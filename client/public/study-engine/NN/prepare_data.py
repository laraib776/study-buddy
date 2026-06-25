#!/usr/bin/env python3
"""
prepare_data.py
===============
Downloads all required datasets from HuggingFace Hub,
converts them to unified JSONL format, and creates
train / val / test splits by *document source* (not random row)
to prevent leakage.

Usage
-----
    python scripts/prepare_data.py --output_dir data/ [--seed 42]

Outputs
-------
    data/processed/train.jsonl      ← generation tasks
    data/processed/val.jsonl
    data/processed/test.jsonl
    data/eval/evaluator_train.jsonl ← answer evaluation task
    data/eval/evaluator_val.jsonl
    data/eval/evaluator_test.jsonl
    data/processed/stats.json       ← row counts per split / task
"""

import argparse
import hashlib
import json
import os
import random
from collections import defaultdict
from pathlib import Path
from typing import Any

from datasets import load_dataset
from tqdm import tqdm

# ──────────────────────────────────────────────────────────────────────────────
# Unified example schemas
# ──────────────────────────────────────────────────────────────────────────────

# Generation example (shared across tasks)
def gen_example(task: str, document: str, topic: str, output: Any, source: str) -> dict:
    """TASK prefix + document → JSON output."""
    return {
        "task": task,                          # subjective_questions | flashcards | quiz
        "input": f"TASK={task}\nTOPIC={topic}\nDOCUMENT:\n{document}",
        "output": json.dumps(output, ensure_ascii=False),
        "source": source,                      # dataset name — used for split key
        "topic": topic,
    }

# Evaluator example
# # Evaluator example
# def eval_example(
def eval_example(
    question: str,
    reference_answer: str,
    student_answer: str,
    rubric: dict,
    score: float,          # 0-100
    feedback: str,
    source: str,
) -> dict:
    return {
        "question": question,
        "reference_answer": reference_answer,
        "student_answer": student_answer,
        "rubric": rubric,
        "score": float(score),
        "feedback": feedback,
        "source": source,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Helper: document-based split
# ──────────────────────────────────────────────────────────────────────────────

def split_by_source(
    examples: list[dict],
    train_ratio: float = 0.80,
    val_ratio: float = 0.10,
    seed: int = 42,
) -> tuple[list, list, list]:
    """
    Group examples by their `source` field, then split groups into
    train / val / test so no document appears in more than one split.
    """
    rng = random.Random(seed)
    by_source = defaultdict(list)
    for ex in examples:
        key = ex.get("source", "unknown")
        by_source[key].append(ex)

    sources = sorted(by_source.keys())
    rng.shuffle(sources)

    n = len(sources)
    n_train = int(n * train_ratio)
    n_val = int(n * val_ratio)

    train_src = set(sources[:n_train])
    val_src   = set(sources[n_train : n_train + n_val])
    # rest → test

    train, val, test = [], [], []
    for src, exs in by_source.items():
        if src in train_src:
            train.extend(exs)
        elif src in val_src:
            val.extend(exs)
        else:
            test.extend(exs)

    rng.shuffle(train)
    return train, val, test


# ──────────────────────────────────────────────────────────────────────────────
# Dataset converters
# ──────────────────────────────────────────────────────────────────────────────

def load_squad_v2(limit: int | None = None) -> list[dict]:
    """
    SQuAD 2.0  →  subjective question generation examples.
    Dataset: https://huggingface.co/datasets/rajpurkar/squad_v2
    """
    print("  Downloading SQuAD v2 …")
    ds = load_dataset("rajpurkar/squad_v2", split="train")
    if limit:
        ds = ds.select(range(min(limit, len(ds))))

    examples = []
    for row in tqdm(ds, desc="  SQuAD→gen"):
        if not row["answers"]["text"]:
            continue  # unanswerable — skip for generation
        context  = row["context"].strip()
        question = row["question"].strip()
        answer   = row["answers"]["text"][0].strip()
        title    = row.get("title", "unknown")

        q_obj = {
            "q": question,
            "ans": answer,
            "rubric": {
                "keyPoints": [answer],
                "mustMention": [],
                "niceToHave": [],
            },
            "difficulty": "medium",
            "sourceSpan": context[:120],
        }
        ex = gen_example(
            task="subjective_questions",
            document=context,
            topic=title,
            output=[q_obj],
            source=f"squad2_{_hash(context)}",
        )
        examples.append(ex)
    print(f"    → {len(examples)} examples")
    return examples


def load_fairytaleqa(limit: int | None = None) -> list[dict]:
    """
    FairytaleQA  →  subjective question generation.
    Dataset: https://huggingface.co/datasets/workdaypt/FairytaleQA_Dataset
    """
    print("  Downloading FairytaleQA …")
    try:
        ds = load_dataset("workdaypt/FairytaleQA_Dataset", split="train")
    except Exception:
        print("    ⚠  FairytaleQA unavailable — skipping.")
        return []

    if limit:
        ds = ds.select(range(min(limit, len(ds))))

    examples = []
    for row in tqdm(ds, desc="  FairytaleQA→gen"):
        context  = (row.get("content") or row.get("story_section") or "").strip()
        question = (row.get("question") or "").strip()
        answer   = (row.get("answer1") or row.get("answer") or "").strip()
        if not context or not question or not answer:
            continue
        q_obj = {
            "q": question,
            "ans": answer,
            "rubric": {"keyPoints": [answer[:80]], "mustMention": [], "niceToHave": []},
            "difficulty": "medium",
            "sourceSpan": context[:120],
        }
        ex = gen_example(
            task="subjective_questions",
            document=context,
            topic="Reading Comprehension",
            output=[q_obj],
            source=f"fairytaleqa_{_hash(context)}",
        )
        examples.append(ex)
    print(f"    → {len(examples)} examples")
    return examples


def load_race(limit: int | None = None) -> list[dict]:
    """
    RACE (all)  →  MCQ quiz generation examples.
    Dataset: https://huggingface.co/datasets/ehovy/race
    """
    print("  Downloading RACE …")
    ds = load_dataset("ehovy/race", "all", split="train")
    if limit:
        ds = ds.select(range(min(limit, len(ds))))

    examples = []
    for row in tqdm(ds, desc="  RACE→quiz"):
        context  = row["article"].strip()
        question = row["question"].strip()
        opts     = row["options"]
        ans_letter = row["answer"]           # A / B / C / D
        ans_idx  = "ABCD".index(ans_letter)

        if len(opts) != 4:
            continue

        quiz_obj = {
            "mcq": [{
                "q": question,
                "opts": opts,
                "ans": ans_idx,
                "exp": f"Correct: {opts[ans_idx]}",
            }],
            "tf": [], "blanks": [], "short": [],
        }
        ex = gen_example(
            task="quiz",
            document=context,
            topic="Reading Comprehension",
            output=quiz_obj,
            source=f"race_{_hash(context)}",
        )
        examples.append(ex)
    print(f"    → {len(examples)} examples")
    return examples


def load_sciq(limit: int | None = None) -> list[dict]:
    """
    SciQ  →  MCQ + fill-in-the-blank quiz generation.
    Dataset: https://huggingface.co/datasets/allenai/sciq
    """
    print("  Downloading SciQ …")
    ds = load_dataset("allenai/sciq", split="train")
    if limit:
        ds = ds.select(range(min(limit, len(ds))))

    examples = []
    for row in tqdm(ds, desc="  SciQ→quiz"):
        support  = (row.get("support") or "").strip()
        question = row["question"].strip()
        correct  = row["correct_answer"].strip()
        distractors = [
            row.get("distractor1", "").strip(),
            row.get("distractor2", "").strip(),
            row.get("distractor3", "").strip(),
        ]
        opts = [correct] + [d for d in distractors if d]
        random.shuffle(opts)
        ans_idx = opts.index(correct)

        # Also make a fill-in-the-blank
        blank_q = question.replace(correct, "_____", 1) if correct in question else None

        quiz_obj = {
            "mcq": [{
                "q": question,
                "opts": opts[:4],
                "ans": ans_idx,
                "exp": support[:200] if support else f"Correct answer: {correct}",
            }],
            "tf": [],
            "blanks": ([{
                "q": blank_q,
                "ans": correct,
                "exp": support[:200] if support else "",
            }] if blank_q else []),
            "short": [],
        }
        document = support if support else question
        ex = gen_example(
            task="quiz",
            document=document,
            topic="Science",
            output=quiz_obj,
            source=f"sciq_{_hash(document)}",
        )
        examples.append(ex)
    print(f"    → {len(examples)} examples")
    return examples


def load_arc(limit: int | None = None) -> list[dict]:
    """
    ARC Challenge  →  hard MCQ quiz generation.
    Dataset: https://huggingface.co/datasets/allenai/ai2_arc
    """
    print("  Downloading ARC Challenge …")
    ds = load_dataset("allenai/ai2_arc", "ARC-Challenge", split="train")
    if limit:
        ds = ds.select(range(min(limit, len(ds))))

    examples = []
    for row in tqdm(ds, desc="  ARC→quiz"):
        question = row["question"].strip()
        choices  = row["choices"]
        labels   = choices["label"]
        texts    = choices["text"]
        ans_key  = row["answerKey"]

        try:
            ans_idx = labels.index(ans_key)
        except ValueError:
            continue

        quiz_obj = {
            "mcq": [{
                "q": question,
                "opts": texts,
                "ans": ans_idx,
                "exp": f"Correct: {texts[ans_idx]}",
            }],
            "tf": [], "blanks": [], "short": [],
        }
        ex = gen_example(
            task="quiz",
            document=question,                 # ARC has no passage; question is the doc
            topic="Science Reasoning",
            output=quiz_obj,
            source=f"arc_{_hash(question)}",
        )
        examples.append(ex)
    print(f"    → {len(examples)} examples")
    return examples


def load_openbookqa(limit: int | None = None) -> list[dict]:
    """
    OpenBookQA  →  flashcard + short-answer generation.
    Dataset: https://huggingface.co/datasets/allenai/openbookqa
    """
    print("  Downloading OpenBookQA …")
    ds = load_dataset("allenai/openbookqa", "main", split="train")
    if limit:
        ds = ds.select(range(min(limit, len(ds))))

    examples = []
    for row in tqdm(ds, desc="  OpenBookQA→flashcards"):
        question    = row["question_stem"].strip()
        choices     = row["choices"]
        labels      = choices["label"]
        texts       = choices["text"]
        ans_key     = row["answerKey"]
        fact        = row.get("fact1", "").strip()

        try:
            ans_text = texts[labels.index(ans_key)]
        except (ValueError, IndexError):
            continue

        # Flashcard: front = question, back = answer + fact
        card = {
            "front": question,
            "back": f"{ans_text}. {fact}" if fact else ans_text,
            "tag": "Science",
            "difficulty": "easy",
            "sourceSpan": fact[:120] if fact else "",
        }
        ex = gen_example(
            task="flashcards",
            document=fact if fact else question,
            topic="Science",
            output=[card],
            source=f"openbookqa_{_hash(question)}",
        )
        examples.append(ex)
    print(f"    → {len(examples)} examples")
    return examples


# ──────────────────────────────────────────────────────────────────────────────
# Evaluator datasets
# ──────────────────────────────────────────────────────────────────────────────

def load_asap_evaluator(limit: int | None = None) -> list[dict]:
    """
    ASAP (Automated Student Assessment Prize) via tasksource.
    Dataset: https://huggingface.co/datasets/tasksource/asap
    Scores normalized to 0-100.
    """
    print("  Downloading ASAP (student answer scoring) …")
    try:
        ds = load_dataset("tasksource/asap", split="train")
    except Exception:
        print("    ⚠  ASAP unavailable via HuggingFace — see README for Kaggle download.")
        return _make_synthetic_eval_examples(300)

    if limit:
        ds = ds.select(range(min(limit, len(ds))))

    examples = []
    for row in tqdm(ds, desc="  ASAP→eval"):
        essay     = (row.get("essay") or "").strip()
        score     = row.get("domain1_score") or row.get("score") or 0
        max_score = row.get("domain1_max_score") or 3
        question  = row.get("prompt") or "Answer the question based on the passage."

        if not essay:
            continue

        pct = round((float(score) / float(max_score)) * 100) if max_score else 0
        feedback = _pct_to_feedback(pct)
        rubric   = {"keyPoints": [], "mustMention": [], "niceToHave": []}

        ex = eval_example(
            question=question,
            reference_answer="",               # ASAP doesn't provide reference
            student_answer=essay,
            rubric=rubric,
            score=pct,
            feedback=feedback,
            source=f"asap_{_hash(essay)}",
        )
        examples.append(ex)
    print(f"    → {len(examples)} examples")
    return examples


def _make_synthetic_eval_examples(n: int = 500) -> list[dict]:
    """
    Create synthetic evaluator examples for each score band
    when real datasets are unavailable.
    """
    templates = [
        # (student_answer, score, feedback)
        ("", 0, "Blank answer. No credit awarded."),
        ("I don't know.", 5, "No relevant content provided."),
        ("The answer is something related to the topic.", 25, "Too vague. Lacks specific details."),
        ("The concept involves some important aspects.", 30, "Mentions the topic but provides no substance."),
        ("It is a method that helps improve results in some situations.", 45, "Partially correct but missing key terminology and detail."),
        ("This technique reduces errors by applying constraints during training.", 62, "Decent answer. Mention the specific mechanism more precisely."),
        ("Regularization adds a penalty term to the loss function to prevent overfitting by discouraging large weights.", 80, "Good answer. Could add an example (L1/L2)."),
        ("Regularization is a technique that adds a penalty (L1 or L2) to the loss function, discouraging overly large weights and improving generalization to unseen data.", 95, "Excellent. Clear, specific, complete."),
        ("This is absolutely correct and I know everything about it very well definitely.", 10, "Confident but unsupported. No relevant facts."),
        ("Transfer learning reuses pretrained model weights on a new related task, reducing training data requirements.", 90, "Strong. Mention domain similarity for full marks."),
    ]
    examples = []
    for i in range(n):
        t = templates[i % len(templates)]
        ex = eval_example(
            question="Explain the concept.",
            reference_answer="A clear, accurate, specific explanation with examples.",
            student_answer=t[0],
            rubric={"keyPoints": ["accuracy", "specificity", "completeness"]},
            score=t[1],
            feedback=t[2],
            source=f"synthetic_{i}",
        )
        examples.append(ex)
    return examples


def _pct_to_feedback(pct: float) -> str:
    if pct < 20:
        return "Answer is irrelevant or blank."
    elif pct < 40:
        return "Very vague. Key points not addressed."
    elif pct < 60:
        return "Partially correct. Missing important details."
    elif pct < 80:
        return "Good answer but incomplete. Expand on key concepts."
    else:
        return "Strong answer. Well-structured and accurate."


# ──────────────────────────────────────────────────────────────────────────────
# Negative / robustness examples
# ──────────────────────────────────────────────────────────────────────────────

def make_negative_eval_examples() -> list[dict]:
    """
    Hand-crafted negatives: copied answers, hallucinations,
    spelling errors, mixed-language, overconfident-but-wrong answers.
    """
    negatives = [
        {
            "student_answer": "Overfitting is when a model fits training data too well and fails on unseen data. Overfitting is when a model fits training data too well and fails on unseen data.",
            "score": 40,
            "feedback": "Copied phrasing detected. Answer lacks original explanation.",
            "note": "copy",
        },
        {
            "student_answer": "GPT-4 invented regularization in 2023 as a new concept for neural networks.",
            "score": 0,
            "feedback": "Unsupported claim. GPT-4 did not invent regularization; it predates modern LLMs.",
            "note": "hallucination",
        },
        {
            "student_answer": "yes",
            "score": 0,
            "feedback": "Answer is too short. No relevant content.",
            "note": "too_short",
        },
        {
            "student_answer": "Regularisation penalises big wieghts and stopt the modl from memorising traning data.",
            "score": 68,
            "feedback": "Correct concept despite spelling errors. Penalize less for typos.",
            "note": "spelling_errors",
        },
        {
            "student_answer": "Overfitting matlab jab model training data ko memorize kar leta hai aur new data pe acha perform nahi karta.",
            "score": 72,
            "feedback": "Correct in Roman Urdu. Mixed-language accepted.",
            "note": "roman_urdu",
        },
        {
            "student_answer": "It definitely completely fixes all problems with 100% certainty in all cases always.",
            "score": 5,
            "feedback": "Overconfident. No factual content.",
            "note": "overconfident_wrong",
        },
    ]
    examples = []
    for neg in negatives:
        ex = eval_example(
            question="Explain regularization and overfitting.",
            reference_answer="Regularization adds a penalty to the loss function to prevent the model from memorizing training data, improving generalization.",
            student_answer=neg["student_answer"],
            rubric={"keyPoints": ["penalty term", "overfitting prevention", "generalization"]},
            score=neg["score"],
            feedback=neg["feedback"],
            source=f"negative_{neg['note']}",
        )
        examples.append(ex)
    return examples


# ──────────────────────────────────────────────────────────────────────────────
# Utilities
# ──────────────────────────────────────────────────────────────────────────────

def _hash(text: str) -> str:
    return hashlib.md5(text[:200].encode()).hexdigest()[:10]


def write_jsonl(examples: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for ex in examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")
    print(f"  ✓ Wrote {len(examples):,} rows → {path}")


def dedup(examples: list[dict], key_field: str = "input") -> list[dict]:
    seen = set()
    out = []
    for ex in examples:
        k = _hash(ex.get(key_field, ""))
        if k not in seen:
            seen.add(k)
            out.append(ex)
    removed = len(examples) - len(out)
    if removed:
        print(f"  Deduplicated: removed {removed} duplicates.")
    return out


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output_dir", default="data/")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--limit", type=int, default=None,
                        help="Per-dataset row cap (for quick test runs)")
    args = parser.parse_args()

    random.seed(args.seed)
    out = Path(args.output_dir)

    # ── 1. Generation datasets ────────────────────────────────────────────────
    print("\n=== Loading Generation Datasets ===")
    gen_examples = []
    gen_examples += load_squad_v2(args.limit)
    gen_examples += load_fairytaleqa(args.limit)
    gen_examples += load_race(args.limit)
    gen_examples += load_sciq(args.limit)
    gen_examples += load_arc(args.limit)
    gen_examples += load_openbookqa(args.limit)

    print(f"\nTotal generation examples before dedup: {len(gen_examples):,}")
    gen_examples = dedup(gen_examples, key_field="input")
    print(f"After dedup: {len(gen_examples):,}")

    g_train, g_val, g_test = split_by_source(gen_examples, seed=args.seed)
    write_jsonl(g_train, out / "processed/train.jsonl")
    write_jsonl(g_val,   out / "processed/val.jsonl")
    write_jsonl(g_test,  out / "processed/test.jsonl")

    # ── 2. Evaluator datasets ─────────────────────────────────────────────────
    print("\n=== Loading Evaluator Datasets ===")
    eval_examples = []
    eval_examples += load_asap_evaluator(args.limit)
    eval_examples += _make_synthetic_eval_examples(500)
    eval_examples += make_negative_eval_examples()

    print(f"\nTotal evaluator examples before dedup: {len(eval_examples):,}")
    eval_examples = dedup(eval_examples, key_field="student_answer")
    print(f"After dedup: {len(eval_examples):,}")

    e_train, e_val, e_test = split_by_source(eval_examples, seed=args.seed)
    write_jsonl(e_train, out / "eval/evaluator_train.jsonl")
    write_jsonl(e_val,   out / "eval/evaluator_val.jsonl")
    write_jsonl(e_test,  out / "eval/evaluator_test.jsonl")

    # ── 3. Stats ──────────────────────────────────────────────────────────────
    stats = {
        "generation": {
            "train": len(g_train),
            "val":   len(g_val),
            "test":  len(g_test),
        },
        "evaluator": {
            "train": len(e_train),
            "val":   len(e_val),
            "test":  len(e_test),
        },
    }
    stats_path = out / "processed/stats.json"
    stats_path.write_text(json.dumps(stats, indent=2))

    print("\n=== Dataset Summary ===")
    for split_name, counts in stats.items():
        print(f"\n  {split_name.upper()}")
        for s, c in counts.items():
            print(f"    {s:10s}: {c:>7,}")
    print(f"\n  Stats → {stats_path}")
    print("\n✅ Data preparation complete.\n")


if __name__ == "__main__":
    main()
