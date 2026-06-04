"""
evaluate.py
-----------
Evaluates a trained StudyBuddy model checkpoint against test data.

Metrics measured:
  - JSON validity rate
  - Schema compliance rate
  - Answer score correlation (Pearson r) with ground truth
  - Rubric key-point recall
  - ROUGE-L for generated text quality
  - Latency (p50, p95)
  - Per-task breakdown

Usage:
    python scripts/evaluate.py \\
        --model_path checkpoints/generation/final \\
        --base_model microsoft/Phi-3-mini-4k-instruct \\
        --test_data data/processed/test.jsonl \\
        --eval_test_data data/processed/eval_test.jsonl \\
        --output_dir data/eval \\
        --sample 200
"""

import argparse
import json
import os
import time
from pathlib import Path
from collections import defaultdict
from typing import List, Dict, Any, Optional

import numpy as np
import torch
from tqdm import tqdm
from scipy.stats import pearsonr
from evaluate import load as load_metric
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel


# ─────────────────────────────────────────────────────────────────────────────
# Model loading
# ─────────────────────────────────────────────────────────────────────────────

def load_model(model_path: str, base_model: Optional[str] = None):
    """Load a fine-tuned LoRA model (or a merged model)."""
    # Detect if it's a PEFT adapter or a merged model
    is_peft = os.path.exists(os.path.join(model_path, "adapter_config.json"))

    tokenizer = AutoTokenizer.from_pretrained(
        model_path if not is_peft else base_model,
        trust_remote_code=True
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    if is_peft and base_model:
        print(f"Loading base model: {base_model}")
        base = AutoModelForCausalLM.from_pretrained(
            base_model,
            device_map="auto",
            torch_dtype=torch.bfloat16,
            trust_remote_code=True,
        )
        print(f"Loading LoRA adapter from: {model_path}")
        model = PeftModel.from_pretrained(base, model_path)
    else:
        print(f"Loading merged model from: {model_path}")
        model = AutoModelForCausalLM.from_pretrained(
            model_path,
            device_map="auto",
            torch_dtype=torch.bfloat16,
            trust_remote_code=True,
        )

    model.eval()
    return model, tokenizer


# ─────────────────────────────────────────────────────────────────────────────
# Inference
# ─────────────────────────────────────────────────────────────────────────────

def generate_response(model, tokenizer, prompt: str, max_new_tokens: int = 600) -> tuple:
    """Returns (decoded_text, latency_seconds)."""
    inputs = tokenizer(
        prompt,
        return_tensors="pt",
        truncation=True,
        max_length=1800,
        padding=True,
    ).to(model.device)

    t0 = time.perf_counter()
    with torch.no_grad():
        output = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            temperature=1.0,
            repetition_penalty=1.1,
            pad_token_id=tokenizer.pad_token_id,
            eos_token_id=tokenizer.eos_token_id,
        )
    latency = time.perf_counter() - t0

    new_tokens = output[0][inputs["input_ids"].shape[1]:]
    decoded = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()
    return decoded, latency


# ─────────────────────────────────────────────────────────────────────────────
# Validators
# ─────────────────────────────────────────────────────────────────────────────

REQUIRED_KEYS = {
    "makeQuestions": {"q", "ans", "rubric", "difficulty"},
    "makeFlashcards": {"front", "back", "tag", "difficulty"},
    "makeQuiz":       {"mcq", "tf", "blanks", "short"},
    "evaluateAnswer": {"pct", "correct", "band", "feedback"},
}


def is_valid_json(text: str) -> tuple:
    """Returns (is_valid, parsed_object)."""
    try:
        obj = json.loads(text)
        return True, obj
    except json.JSONDecodeError:
        return False, None


def check_schema(parsed: Any, task: str) -> bool:
    """Check that required top-level keys are present."""
    required = REQUIRED_KEYS.get(task, set())
    if not required:
        return True
    if isinstance(parsed, list):
        if not parsed:
            return False
        return required.issubset(set(parsed[0].keys()))
    elif isinstance(parsed, dict):
        return required.issubset(set(parsed.keys()))
    return False


def compute_rubric_recall(predicted: dict, ground_truth: dict) -> float:
    """Fraction of ground-truth rubric key points covered in predicted output."""
    gt_kp = ground_truth.get("rubricHits", []) + ground_truth.get("rubricMisses", [])
    pred_kp = predicted.get("rubricHits", []) + predicted.get("rubricMisses", [])
    if not gt_kp:
        return 1.0
    hits = sum(
        1 for k in gt_kp
        if any(k.lower()[:30] in p.lower() for p in pred_kp)
    )
    return hits / len(gt_kp)


def band_to_int(band: str) -> int:
    return {"weak": 0, "partial": 1, "good": 2, "strong": 3}.get(band, 1)


# ─────────────────────────────────────────────────────────────────────────────
# Evaluation loop
# ─────────────────────────────────────────────────────────────────────────────

def evaluate(model, tokenizer, examples: List[dict], task_filter: Optional[str] = None) -> Dict:
    rouge = load_metric("rouge")
    results_by_task = defaultdict(lambda: {
        "json_valid": [], "schema_valid": [], "latencies": [],
        "pred_scores": [], "gt_scores": [],
        "pred_bands": [], "gt_bands": [],
        "rubric_recalls": [], "rouge_l": [],
    })

    for ex in tqdm(examples, desc="Evaluating"):
        task = ex.get("task", "unknown")
        if task_filter and task != task_filter:
            continue

        gt_text = ex.get("completion", "{}")
        gt_valid, gt_parsed = is_valid_json(gt_text)
        if not gt_valid:
            continue

        pred_text, latency = generate_response(model, tokenizer, ex["prompt"])
        pred_valid, pred_parsed = is_valid_json(pred_text)

        r = results_by_task[task]
        r["json_valid"].append(int(pred_valid))
        r["latencies"].append(latency)

        if pred_valid:
            r["schema_valid"].append(int(check_schema(pred_parsed, task)))
        else:
            r["schema_valid"].append(0)

        # Task-specific metrics
        if task == "evaluateAnswer" and pred_valid and isinstance(pred_parsed, dict):
            pred_pct = pred_parsed.get("pct", 50)
            gt_pct = gt_parsed.get("pct", 50) if isinstance(gt_parsed, dict) else 50
            r["pred_scores"].append(pred_pct)
            r["gt_scores"].append(gt_pct)

            pred_band = band_to_int(pred_parsed.get("band", "partial"))
            gt_band = band_to_int(gt_parsed.get("band", "partial") if isinstance(gt_parsed, dict) else "partial")
            r["pred_bands"].append(pred_band)
            r["gt_bands"].append(gt_band)

            recall = compute_rubric_recall(pred_parsed, gt_parsed if isinstance(gt_parsed, dict) else {})
            r["rubric_recalls"].append(recall)

        # ROUGE-L on text content
        pred_text_content = pred_text[:500]
        gt_text_content = gt_text[:500]
        try:
            rouge_result = rouge.compute(
                predictions=[pred_text_content],
                references=[gt_text_content]
            )
            r["rouge_l"].append(rouge_result["rougeL"])
        except Exception:
            pass

    return dict(results_by_task)


def summarize(results: Dict) -> Dict:
    summary = {}
    all_latencies = []

    for task, r in results.items():
        n = len(r["json_valid"])
        if n == 0:
            continue

        task_summary = {
            "n_examples": n,
            "json_valid_rate": np.mean(r["json_valid"]),
            "schema_valid_rate": np.mean(r["schema_valid"]) if r["schema_valid"] else 0,
            "latency_p50_s": float(np.percentile(r["latencies"], 50)) if r["latencies"] else 0,
            "latency_p95_s": float(np.percentile(r["latencies"], 95)) if r["latencies"] else 0,
        }

        if r["rouge_l"]:
            task_summary["rouge_l"] = float(np.mean(r["rouge_l"]))

        if r["pred_scores"] and r["gt_scores"] and len(r["pred_scores"]) > 1:
            try:
                corr, pval = pearsonr(r["pred_scores"], r["gt_scores"])
                task_summary["score_pearson_r"] = float(corr)
                task_summary["score_pearson_pval"] = float(pval)
            except Exception:
                pass
            task_summary["score_mae"] = float(
                np.mean(np.abs(np.array(r["pred_scores"]) - np.array(r["gt_scores"])))
            )

        if r["rubric_recalls"]:
            task_summary["rubric_recall"] = float(np.mean(r["rubric_recalls"]))

        all_latencies.extend(r["latencies"])
        summary[task] = task_summary

    # Overall stats
    if all_latencies:
        summary["_overall"] = {
            "p50_latency_s": float(np.percentile(all_latencies, 50)),
            "p95_latency_s": float(np.percentile(all_latencies, 95)),
            "total_examples": sum(r["n_examples"] for r in summary.values() if isinstance(r, dict)),
        }

    return summary


def check_targets(summary: Dict) -> list:
    """Check against the target metrics defined in the requirements."""
    issues = []
    for task, stats in summary.items():
        if not isinstance(stats, dict):
            continue
        jvr = stats.get("json_valid_rate", 0)
        if jvr < 0.98:
            issues.append(f"[FAIL] {task}: JSON valid rate {jvr:.1%} < 98% target")
        p95 = stats.get("latency_p95_s", 0)
        if p95 > 5.0:
            issues.append(f"[WARN] {task}: p95 latency {p95:.1f}s > 5s target")
        corr = stats.get("score_pearson_r")
        if corr is not None and corr < 0.75:
            issues.append(f"[FAIL] {task}: score correlation {corr:.3f} < 0.75 target")
    if not issues:
        issues.append("[PASS] All key metrics within target thresholds.")
    return issues


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model_path", required=True)
    parser.add_argument("--base_model", default="microsoft/Phi-3-mini-4k-instruct")
    parser.add_argument("--test_data", default="data/processed/test.jsonl")
    parser.add_argument("--eval_test_data", default="data/processed/eval_test.jsonl")
    parser.add_argument("--output_dir", default="data/eval")
    parser.add_argument("--sample", type=int, default=200,
                        help="Max examples to evaluate (use 0 for all)")
    args = parser.parse_args()

    Path(args.output_dir).mkdir(parents=True, exist_ok=True)

    # Load model
    model, tokenizer = load_model(args.model_path, args.base_model)

    # Load test examples
    all_examples = []
    for path in [args.test_data, args.eval_test_data]:
        if os.path.exists(path):
            with open(path) as f:
                for line in f:
                    line = line.strip()
                    if line:
                        all_examples.append(json.loads(line))

    if args.sample > 0 and len(all_examples) > args.sample:
        import random
        random.seed(42)
        all_examples = random.sample(all_examples, args.sample)

    print(f"\nEvaluating {len(all_examples)} examples...\n")

    # Run evaluation
    results = evaluate(model, tokenizer, all_examples)
    summary = summarize(results)
    issues = check_targets(summary)

    # Print results
    print("\n" + "═" * 60)
    print(" EVALUATION RESULTS")
    print("═" * 60)
    for task, stats in summary.items():
        if not isinstance(stats, dict):
            continue
        print(f"\n  Task: {task}")
        for k, v in stats.items():
            if isinstance(v, float):
                print(f"    {k}: {v:.4f}")
            else:
                print(f"    {k}: {v}")

    print("\n" + "─" * 60)
    print(" TARGET CHECKS")
    print("─" * 60)
    for issue in issues:
        print(f"  {issue}")

    # Save results
    out_path = os.path.join(args.output_dir, "eval_results.json")
    with open(out_path, "w") as f:
        json.dump({"summary": summary, "target_checks": issues}, f, indent=2)
    print(f"\nResults saved → {out_path}")


if __name__ == "__main__":
    main()
