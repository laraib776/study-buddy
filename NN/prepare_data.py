"""
prepare_data.py
---------------
Downloads RACE, SQuAD v2, SciQ, QASC from Hugging Face and converts them
into the StudyBuddy instruction-following format.

Splits are made BY DOCUMENT SOURCE to prevent train/test leakage.

Usage:
    python scripts/prepare_data.py \
        --output_dir data/processed \
        --val_ratio 0.1 \
        --test_ratio 0.1 \
        --asap_path data/raw/asap_training_set_rel3.tsv  # optional
"""

import argparse
import json
import os
import random
import re
import hashlib
from pathlib import Path
from typing import List, Dict, Any

import pandas as pd
from datasets import load_dataset
from tqdm import tqdm

# ─────────────────────────────────────────────────────────────────────────────
# Prompt templates
# ─────────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = (
    "You are an expert educational AI. You generate high-quality flashcards, "
    "quizzes, and subjective questions from study notes, and evaluate student "
    "answers like a fair examiner. Always respond with valid JSON only."
)


def make_generation_prompt(task: str, notes: str, topic: str, count: int,
                           difficulty: str = "medium") -> str:
    base = (
        f"[INST] SYSTEM: {SYSTEM_PROMPT}\n\n"
        f"TASK: {task}\n"
        f"TOPIC: {topic}\n"
        f"COUNT: {count}\n"
        f"DIFFICULTY: {difficulty}\n\n"
        f"NOTES:\n{notes.strip()}\n\n"
    )
    if task == "makeQuestions":
        base += (
            "Generate exactly {count} subjective practice questions from the notes above.\n"
            "Return ONLY a valid JSON array. Each item must have keys: "
            '"q", "ans", "rubric" (with keyPoints, mustMention, niceToHave arrays), '
            '"difficulty", "sourceSpan".\n'
            "Do NOT put the answer inside the question text. [/INST]"
        ).format(count=count)
    elif task == "makeFlashcards":
        base += (
            "Generate exactly {count} flashcards from the notes above.\n"
            "Return ONLY a valid JSON array. Each item must have keys: "
            '"front", "back", "tag", "difficulty", "sourceSpan". [/INST]'
        ).format(count=count)
    elif task == "makeQuiz":
        base += (
            "Generate a quiz from the notes above with difficulty={difficulty}.\n"
            "Return ONLY a valid JSON object with keys: "
            '"mcq" (array), "tf" (array), "blanks" (array), "short" (array).\n'
            'Each mcq item: {{"q":"","opts":["","","",""],"ans":0,"exp":""}}.\n'
            'Each tf item: {{"q":"","ans":true,"exp":""}}.\n'
            'Each blanks item: {{"q":"_____ is missing.","ans":"","exp":""}}.\n'
            'Each short item: {{"q":"","ans":""}}. [/INST]'
        ).format(count=count, difficulty=difficulty)
    return base


def make_eval_prompt(question: str, reference: str, rubric: dict,
                     student_answer: str, topic: str) -> str:
    return (
        f"[INST] SYSTEM: {SYSTEM_PROMPT}\n\n"
        f"TASK: evaluateAnswer\n"
        f"TOPIC: {topic}\n"
        f"QUESTION: {question}\n"
        f"REFERENCE ANSWER: {reference}\n"
        f"RUBRIC: {json.dumps(rubric)}\n"
        f"STUDENT ANSWER: {student_answer}\n\n"
        "Evaluate the student answer like a fair examiner. "
        "Return ONLY a valid JSON object with keys: "
        '"pct" (0-100 integer), "correct" (bool), '
        '"band" (weak|partial|good|strong), "feedback" (string), '
        '"strengths" (array), "missing" (array), '
        '"rubricHits" (array), "rubricMisses" (array). '
        "Do NOT reveal the full reference answer in feedback. [/INST]"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Dataset converters
# ─────────────────────────────────────────────────────────────────────────────

def convert_race(split_limit: int = 20000) -> List[Dict]:
    """Convert RACE reading comprehension dataset → makeQuestions + makeQuiz examples."""
    print("Loading RACE dataset...")
    ds = load_dataset("race", "all", trust_remote_code=True)
    examples = []

    for split in ["train", "validation"]:
        for item in tqdm(ds[split], desc=f"RACE {split}"):
            article = item["article"]
            questions = item["question"]
            options = item["options"]
            answer_idx = ord(item["answer"]) - ord("A")

            if not article or len(article) < 100:
                continue

            # makeQuiz example (MCQ)
            opts = options if len(options) == 4 else (options + [""] * 4)[:4]
            quiz_output = {
                "mcq": [{
                    "q": questions,
                    "opts": opts,
                    "ans": answer_idx,
                    "exp": f"The correct answer is based on the passage: ...{article[:120]}..."
                }],
                "tf": [],
                "blanks": [],
                "short": []
            }
            prompt = make_generation_prompt(
                "makeQuiz", article, "Reading Comprehension", 1
            )
            examples.append({
                "prompt": prompt,
                "completion": json.dumps(quiz_output),
                "task": "makeQuiz",
                "source": "race",
                "doc_hash": hashlib.md5(article.encode()).hexdigest()
            })

            # makeQuestions example
            q_output = [{
                "q": questions,
                "ans": options[answer_idx] if answer_idx < len(options) else "",
                "rubric": {
                    "keyPoints": [options[answer_idx][:60]] if answer_idx < len(options) else [],
                    "mustMention": [],
                    "niceToHave": []
                },
                "difficulty": "medium",
                "sourceSpan": article[:80]
            }]
            prompt2 = make_generation_prompt(
                "makeQuestions", article, "Reading Comprehension", 1
            )
            examples.append({
                "prompt": prompt2,
                "completion": json.dumps(q_output),
                "task": "makeQuestions",
                "source": "race",
                "doc_hash": hashlib.md5(article.encode()).hexdigest()
            })

            if len(examples) >= split_limit:
                break
        if len(examples) >= split_limit:
            break

    print(f"  → {len(examples)} RACE examples")
    return examples


def convert_squad(split_limit: int = 15000) -> List[Dict]:
    """Convert SQuAD v2 → makeQuestions + evaluateAnswer examples."""
    print("Loading SQuAD v2 dataset...")
    ds = load_dataset("squad_v2", trust_remote_code=True)
    q_examples = []
    eval_examples = []

    SCORE_BANDS = [
        # (score, feedback_template)
        (90, "Excellent answer. Covers the key point precisely."),
        (75, "Good answer. Mostly correct but could add more detail."),
        (55, "Partially correct. Missing some important aspects."),
        (30, "Vague answer. Touches on the topic but lacks specifics."),
        (10, "Incorrect or irrelevant answer."),
    ]

    for item in tqdm(ds["train"], desc="SQuAD v2"):
        context = item["context"]
        question = item["question"]
        answers = item["answers"]["text"]

        if not context or not question or len(context) < 80:
            continue

        if answers:
            ref_ans = answers[0]

            # makeQuestions example
            q_out = [{
                "q": question,
                "ans": ref_ans,
                "rubric": {
                    "keyPoints": [ref_ans[:60]],
                    "mustMention": [ref_ans.split()[0]] if ref_ans.split() else [],
                    "niceToHave": []
                },
                "difficulty": "medium",
                "sourceSpan": context[:100]
            }]
            q_examples.append({
                "prompt": make_generation_prompt(
                    "makeQuestions", context, "General", 1
                ),
                "completion": json.dumps(q_out),
                "task": "makeQuestions",
                "source": "squad_v2",
                "doc_hash": hashlib.md5(context.encode()).hexdigest()
            })

            # evaluateAnswer examples — one per score band
            for score, feedback in SCORE_BANDS[:2]:  # keep dataset balanced
                if score >= 80:
                    student_ans = ref_ans  # perfect answer
                elif score >= 60:
                    student_ans = ref_ans.split(".")[0] + "."  # partial
                else:
                    student_ans = "I think it has something to do with " + context.split()[0]

                rubric = {"keyPoints": [ref_ans[:60]]}
                eval_out = {
                    "pct": score,
                    "correct": score >= 60,
                    "band": "strong" if score >= 80 else "good" if score >= 60 else
                            "partial" if score >= 40 else "weak",
                    "feedback": feedback,
                    "strengths": [ref_ans[:30]] if score >= 60 else [],
                    "missing": [] if score >= 80 else [ref_ans[:40]],
                    "rubricHits": [ref_ans[:40]] if score >= 60 else [],
                    "rubricMisses": [] if score >= 80 else [ref_ans[:40]]
                }
                eval_examples.append({
                    "prompt": make_eval_prompt(
                        question, ref_ans, rubric, student_ans, "General"
                    ),
                    "completion": json.dumps(eval_out),
                    "task": "evaluateAnswer",
                    "source": "squad_v2",
                    "doc_hash": hashlib.md5(context.encode()).hexdigest()
                })

        if len(q_examples) >= split_limit:
            break

    print(f"  → {len(q_examples)} SQuAD question examples, "
          f"{len(eval_examples)} eval examples")
    return q_examples + eval_examples


def convert_sciq() -> List[Dict]:
    """Convert SciQ science dataset → makeFlashcards + makeQuiz + makeQuestions examples."""
    print("Loading SciQ dataset...")
    ds = load_dataset("sciq", trust_remote_code=True)
    examples = []

    for split in ["train", "validation", "test"]:
        for item in tqdm(ds[split], desc=f"SciQ {split}"):
            support = item.get("support", "")
            question = item["question"]
            correct_ans = item["correct_answer"]
            distractors = [item["distractor1"], item["distractor2"], item["distractor3"]]

            if not support or len(support) < 60:
                support = question  # use question as context if support is missing

            # Shuffle options
            opts = [correct_ans] + distractors
            random.shuffle(opts)
            correct_idx = opts.index(correct_ans)

            # makeFlashcards
            fc_out = [{
                "front": question,
                "back": correct_ans,
                "tag": "science",
                "difficulty": "medium",
                "sourceSpan": support[:80]
            }]
            examples.append({
                "prompt": make_generation_prompt(
                    "makeFlashcards", support, "Science", 1
                ),
                "completion": json.dumps(fc_out),
                "task": "makeFlashcards",
                "source": "sciq",
                "doc_hash": hashlib.md5(support.encode()).hexdigest()
            })

            # makeQuiz
            quiz_out = {
                "mcq": [{
                    "q": question,
                    "opts": opts,
                    "ans": correct_idx,
                    "exp": f"{correct_ans}. {support[:100]}"
                }],
                "tf": [],
                "blanks": [],
                "short": []
            }
            examples.append({
                "prompt": make_generation_prompt(
                    "makeQuiz", support, "Science", 1
                ),
                "completion": json.dumps(quiz_out),
                "task": "makeQuiz",
                "source": "sciq",
                "doc_hash": hashlib.md5(support.encode()).hexdigest()
            })

    print(f"  → {len(examples)} SciQ examples")
    return examples


def convert_qasc() -> List[Dict]:
    """Convert QASC multi-hop science QA → makeQuestions examples."""
    print("Loading QASC dataset...")
    ds = load_dataset("qasc", trust_remote_code=True)
    examples = []

    for split in ["train", "validation"]:
        for item in tqdm(ds[split], desc=f"QASC {split}"):
            question = item["question"]
            fact1 = item.get("fact1", "")
            fact2 = item.get("fact2", "")
            answer_key = item.get("answerKey", "A")
            choices = item["choices"]

            # Build a mini "document" from the facts
            doc = f"{fact1} {fact2}".strip()
            if not doc or len(doc) < 40:
                continue

            # Find correct answer text
            labels = choices["label"]
            texts = choices["text"]
            correct_text = ""
            for lbl, txt in zip(labels, texts):
                if lbl == answer_key:
                    correct_text = txt
                    break

            q_out = [{
                "q": question,
                "ans": correct_text,
                "rubric": {
                    "keyPoints": [correct_text[:60], fact1[:60]],
                    "mustMention": [],
                    "niceToHave": [fact2[:40]] if fact2 else []
                },
                "difficulty": "hard",
                "sourceSpan": doc[:80]
            }]
            examples.append({
                "prompt": make_generation_prompt(
                    "makeQuestions", doc, "Science", 1, difficulty="hard"
                ),
                "completion": json.dumps(q_out),
                "task": "makeQuestions",
                "source": "qasc",
                "doc_hash": hashlib.md5(doc.encode()).hexdigest()
            })

    print(f"  → {len(examples)} QASC examples")
    return examples


def convert_asap(asap_path: str) -> List[Dict]:
    """
    Convert ASAP-AES essay scoring dataset → evaluateAnswer examples.
    Download from: https://www.kaggle.com/c/asap-aes/data
    File: training_set_rel3.tsv
    """
    if not os.path.exists(asap_path):
        print(f"  ASAP file not found at {asap_path}. Skipping.")
        return []

    print(f"Loading ASAP-AES from {asap_path}...")
    df = pd.read_csv(asap_path, sep="\t", encoding="latin-1")
    examples = []

    # ASAP prompts (simplified)
    PROMPTS = {
        1: "Write a letter to your local newspaper about the effects of computers on society.",
        2: "Describe a person who has had a strong influence on your life.",
        3: "Explain why patience is valuable.",
        4: "Write about a time when you felt you did the right thing.",
        5: "Describe your city or town in detail.",
        6: "Write about a time you were afraid.",
        7: "Write about a memorable event.",
        8: "Describe a place that is important to you.",
    }

    for _, row in tqdm(df.iterrows(), total=len(df), desc="ASAP-AES"):
        try:
            prompt_id = int(row["essay_set"])
            essay_text = str(row["essay"])
            # domain1_score is the primary holistic score
            raw_score = float(row["domain1_score"])

            # Normalize to 0-100 based on prompt's score range
            # ASAP scores vary by prompt; approximate normalization
            max_scores = {1: 12, 2: 6, 3: 3, 4: 3, 5: 4, 6: 4, 7: 30, 8: 60}
            max_score = max_scores.get(prompt_id, 10)
            pct = min(100, int((raw_score / max_score) * 100))

            question = PROMPTS.get(prompt_id, "Write a detailed response.")
            rubric = {
                "keyPoints": ["clear argument", "supporting evidence", "organized structure"],
                "mustMention": [],
                "niceToHave": ["examples", "specific details"]
            }

            band = "strong" if pct >= 80 else "good" if pct >= 60 else \
                   "partial" if pct >= 40 else "weak"

            eval_out = {
                "pct": pct,
                "correct": pct >= 60,
                "band": band,
                "feedback": f"Score: {pct}/100. " + (
                    "Strong essay with good support." if pct >= 80 else
                    "Good effort; could improve argument clarity." if pct >= 60 else
                    "Partially developed; needs more specific evidence." if pct >= 40 else
                    "Needs significant improvement in content and structure."
                ),
                "strengths": ["addresses the prompt"] if pct >= 50 else [],
                "missing": ["specific examples"] if pct < 80 else [],
                "rubricHits": ["clear argument"] if pct >= 60 else [],
                "rubricMisses": ["supporting evidence"] if pct < 80 else []
            }

            examples.append({
                "prompt": make_eval_prompt(
                    question, "[Reference essay omitted]", rubric, essay_text, "Essay Writing"
                ),
                "completion": json.dumps(eval_out),
                "task": "evaluateAnswer",
                "source": "asap",
                "doc_hash": hashlib.md5(essay_text[:200].encode()).hexdigest()
            })
        except Exception:
            continue

    print(f"  → {len(examples)} ASAP eval examples")
    return examples


def add_negative_examples(base_examples: List[Dict]) -> List[Dict]:
    """
    Generate robustness/negative examples from existing data:
    - Copied answers (should score low)
    - Blank answers
    - Hallucinated facts
    - Grammar-mistake versions
    """
    negatives = []
    eval_pool = [e for e in base_examples if e["task"] == "evaluateAnswer"]
    sample = random.sample(eval_pool, min(500, len(eval_pool)))

    for ex in tqdm(sample, desc="Generating negatives"):
        # Parse existing prompt to extract question
        prompt = ex["prompt"]
        q_match = re.search(r"QUESTION: (.+?)\n", prompt)
        ref_match = re.search(r"REFERENCE ANSWER: (.+?)\n", prompt)
        if not q_match or not ref_match:
            continue

        question = q_match.group(1)
        ref = ref_match.group(1)
        rubric = {"keyPoints": [ref[:40]]}

        # Negative 1: blank answer
        eval_out_blank = {
            "pct": 0, "correct": False, "band": "weak",
            "feedback": "No answer provided.",
            "strengths": [], "missing": [ref[:40]],
            "rubricHits": [], "rubricMisses": [ref[:40]]
        }
        negatives.append({
            "prompt": make_eval_prompt(question, ref, rubric, "", "General"),
            "completion": json.dumps(eval_out_blank),
            "task": "evaluateAnswer",
            "source": "negative_blank",
            "doc_hash": hashlib.md5(question.encode()).hexdigest()
        })

        # Negative 2: copied answer from reference (should still score ok but flag)
        eval_out_copied = {
            "pct": 65, "correct": True, "band": "good",
            "feedback": "Answer appears closely copied from the reference. "
                        "Try to explain in your own words.",
            "strengths": ["covers key concepts"],
            "missing": ["own explanation"],
            "rubricHits": [ref[:40]], "rubricMisses": []
        }
        negatives.append({
            "prompt": make_eval_prompt(question, ref, rubric, ref, "General"),
            "completion": json.dumps(eval_out_copied),
            "task": "evaluateAnswer",
            "source": "negative_copied",
            "doc_hash": hashlib.md5(question.encode()).hexdigest()
        })

        # Negative 3: hallucinated / irrelevant answer
        hallucinated = "This is related to quantum entanglement and dark matter phenomena."
        eval_out_hall = {
            "pct": 5, "correct": False, "band": "weak",
            "feedback": "Answer contains unsupported claims not grounded in the notes.",
            "strengths": [], "missing": [ref[:40]],
            "rubricHits": [], "rubricMisses": [ref[:40]]
        }
        negatives.append({
            "prompt": make_eval_prompt(question, ref, rubric, hallucinated, "General"),
            "completion": json.dumps(eval_out_hall),
            "task": "evaluateAnswer",
            "source": "negative_hallucinated",
            "doc_hash": hashlib.md5(question.encode()).hexdigest()
        })

    print(f"  → {len(negatives)} negative/robustness examples added")
    return negatives


# ─────────────────────────────────────────────────────────────────────────────
# Split by document hash (not random row)
# ─────────────────────────────────────────────────────────────────────────────

def split_by_document(examples: List[Dict], val_ratio: float,
                       test_ratio: float) -> tuple:
    """Split examples by unique document hash to prevent leakage."""
    doc_hashes = list({e["doc_hash"] for e in examples})
    random.shuffle(doc_hashes)

    n = len(doc_hashes)
    n_test = int(n * test_ratio)
    n_val = int(n * val_ratio)

    test_hashes = set(doc_hashes[:n_test])
    val_hashes = set(doc_hashes[n_test:n_test + n_val])
    train_hashes = set(doc_hashes[n_test + n_val:])

    train = [e for e in examples if e["doc_hash"] in train_hashes]
    val = [e for e in examples if e["doc_hash"] in val_hashes]
    test = [e for e in examples if e["doc_hash"] in test_hashes]

    return train, val, test


def write_jsonl(examples: List[Dict], path: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for ex in examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")
    print(f"  Wrote {len(examples):,} examples → {path}")


def print_stats(name: str, examples: List[Dict]):
    from collections import Counter
    tasks = Counter(e["task"] for e in examples)
    sources = Counter(e["source"] for e in examples)
    print(f"\n{'─'*50}")
    print(f" {name}: {len(examples):,} total examples")
    for t, c in tasks.items():
        print(f"   task={t}: {c:,}")
    for s, c in sources.items():
        print(f"   source={s}: {c:,}")


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output_dir", default="data/processed")
    parser.add_argument("--val_ratio", type=float, default=0.1)
    parser.add_argument("--test_ratio", type=float, default=0.1)
    parser.add_argument("--asap_path",
                        default="data/raw/asap_training_set_rel3.tsv")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--race_limit", type=int, default=20000)
    parser.add_argument("--squad_limit", type=int, default=15000)
    args = parser.parse_args()

    random.seed(args.seed)
    Path(args.output_dir).mkdir(parents=True, exist_ok=True)

    print("\n=== StudyBuddy Dataset Preparation ===\n")

    # ── Collect all examples ──────────────────────────────────────────────────
    all_examples = []

    all_examples += convert_race(split_limit=args.race_limit)
    all_examples += convert_squad(split_limit=args.squad_limit)
    all_examples += convert_sciq()
    all_examples += convert_qasc()
    all_examples += convert_asap(args.asap_path)
    all_examples += add_negative_examples(all_examples)

    print_stats("ALL", all_examples)

    # ── Deduplicate by (task, prompt hash) ───────────────────────────────────
    seen = set()
    deduped = []
    for ex in all_examples:
        key = hashlib.md5((ex["task"] + ex["prompt"][:200]).encode()).hexdigest()
        if key not in seen:
            seen.add(key)
            deduped.append(ex)
    print(f"\nAfter dedup: {len(deduped):,} examples")

    # ── Separate generation and evaluation tasks ──────────────────────────────
    gen_examples = [e for e in deduped if e["task"] != "evaluateAnswer"]
    eval_examples = [e for e in deduped if e["task"] == "evaluateAnswer"]

    # ── Split by document ─────────────────────────────────────────────────────
    g_train, g_val, g_test = split_by_document(
        gen_examples, args.val_ratio, args.test_ratio
    )
    e_train, e_val, e_test = split_by_document(
        eval_examples, args.val_ratio, args.test_ratio
    )

    # ── Write files ───────────────────────────────────────────────────────────
    print("\n=== Writing processed files ===\n")
    write_jsonl(g_train, os.path.join(args.output_dir, "train.jsonl"))
    write_jsonl(g_val,   os.path.join(args.output_dir, "val.jsonl"))
    write_jsonl(g_test,  os.path.join(args.output_dir, "test.jsonl"))

    write_jsonl(e_train, os.path.join(args.output_dir, "eval_train.jsonl"))
    write_jsonl(e_val,   os.path.join(args.output_dir, "eval_val.jsonl"))
    write_jsonl(e_test,  os.path.join(args.output_dir, "eval_test.jsonl"))

    # ── Summary ───────────────────────────────────────────────────────────────
    print("\n=== Summary ===")
    print(f"Generation  — train: {len(g_train):,} | val: {len(g_val):,} | test: {len(g_test):,}")
    print(f"Evaluation  — train: {len(e_train):,} | val: {len(e_val):,} | test: {len(e_test):,}")
    print("\nData preparation complete. ✓")
    print(f"Files saved to: {args.output_dir}/")


if __name__ == "__main__":
    main()
