#!/usr/bin/env python3
"""
train_lora.py
=============
LoRA fine-tuning for the StudyBuddy generation model.
Base: google/flan-t5-base (or flan-t5-large)
Adapter: PEFT LoRA on all attention + FFN projection layers.
Tasks: subjective_questions | flashcards | quiz

Usage
-----
    python scripts/train_lora.py --config configs/generation.yaml

    # Quick smoke-test (small data, few steps):
    python scripts/train_lora.py --config configs/generation.yaml --debug

    # With 4-bit quantization for Colab T4:
    python scripts/train_lora.py --config configs/generation.yaml --load_in_4bit

Checkpoints
-----------
    outputs/generation/checkpoint-*/   ← intermediate
    outputs/generation/best/           ← best by eval_loss
"""

import argparse
import json
import os
import random
from pathlib import Path
from typing import Any

import numpy as np
import torch
import yaml
from datasets import Dataset
from peft import LoraConfig, TaskType, get_peft_model, prepare_model_for_kbit_training
from transformers import (
    AutoModelForSeq2SeqLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    DataCollatorForSeq2Seq,
    EarlyStoppingCallback,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    set_seed,
)

# ──────────────────────────────────────────────────────────────────────────────
# Load config
# ──────────────────────────────────────────────────────────────────────────────

def load_config(path: str) -> dict:
    with open(path) as f:
        cfg = yaml.safe_load(f)
    return cfg


# ──────────────────────────────────────────────────────────────────────────────
# Data loading
# ──────────────────────────────────────────────────────────────────────────────

def load_jsonl(path: str, limit: int | None = None) -> list[dict]:
    examples = []
    with open(path, encoding="utf-8") as f:
        for i, line in enumerate(f):
            if limit and i >= limit:
                break
            line = line.strip()
            if line:
                examples.append(json.loads(line))
    return examples


def preprocess(
    examples: list[dict],
    tokenizer,
    max_input_length: int = 1024,
    max_target_length: int = 512,
) -> dict:
    """Tokenize inputs and targets, return HuggingFace-compatible dict."""
    inputs  = [ex["input"]  for ex in examples]
    targets = [ex["output"] for ex in examples]

    model_inputs = tokenizer(
        inputs,
        max_length=max_input_length,
        truncation=True,
        padding=False,
    )
    with tokenizer.as_target_tokenizer():
        labels = tokenizer(
            targets,
            max_length=max_target_length,
            truncation=True,
            padding=False,
        )

    # Replace tokenizer pad_token_id in labels with -100 (ignore in loss)
    label_ids = [
        [(t if t != tokenizer.pad_token_id else -100) for t in label]
        for label in labels["input_ids"]
    ]
    model_inputs["labels"] = label_ids
    return model_inputs


# ──────────────────────────────────────────────────────────────────────────────
# Metrics
# ──────────────────────────────────────────────────────────────────────────────

def json_validity_rate(decoded: list[str]) -> float:
    """Fraction of decoded outputs that are valid JSON."""
    valid = 0
    for s in decoded:
        try:
            json.loads(s)
            valid += 1
        except Exception:
            pass
    return valid / max(len(decoded), 1)


def compute_metrics_factory(tokenizer, max_target_length: int = 512):
    def compute_metrics(eval_pred):
        predictions, labels = eval_pred

        # Replace -100 with pad token id
        labels = np.where(labels != -100, labels, tokenizer.pad_token_id)

        if isinstance(predictions, tuple):
            predictions = predictions[0]

        # Decode
        decoded_preds = tokenizer.batch_decode(predictions, skip_special_tokens=True)
        decoded_labels = tokenizer.batch_decode(labels, skip_special_tokens=True)

        json_rate = json_validity_rate(decoded_preds)
        return {"json_validity": json_rate}

    return compute_metrics


# ──────────────────────────────────────────────────────────────────────────────
# Model setup
# ──────────────────────────────────────────────────────────────────────────────

def build_model(cfg: dict, load_in_4bit: bool = False, load_in_8bit: bool = False):
    base_model_name = cfg["model"]["base_model"]
    load_in_4bit = load_in_4bit or cfg["model"].get("load_in_4bit", False)
    load_in_8bit = load_in_8bit or cfg["model"].get("load_in_8bit", False)

    bnb_config = None
    if load_in_4bit:
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=torch.float16,
        )
    elif load_in_8bit:
        bnb_config = BitsAndBytesConfig(load_in_8bit=True)

    print(f"Loading base model: {base_model_name}")
    model = AutoModelForSeq2SeqLM.from_pretrained(
        base_model_name,
        quantization_config=bnb_config,
        device_map="auto" if (load_in_4bit or load_in_8bit) else None,
        trust_remote_code=True,
    )

    if load_in_4bit or load_in_8bit:
        model = prepare_model_for_kbit_training(model)

    lora_cfg = cfg["lora"]
    peft_config = LoraConfig(
        task_type=TaskType.SEQ_2_SEQ_LM,
        inference_mode=False,
        r=lora_cfg["r"],
        lora_alpha=lora_cfg["lora_alpha"],
        target_modules=lora_cfg["target_modules"],
        lora_dropout=lora_cfg["lora_dropout"],
        bias=lora_cfg["bias"],
    )

    model = get_peft_model(model, peft_config)
    model.print_trainable_parameters()

    tokenizer = AutoTokenizer.from_pretrained(base_model_name)

    return model, tokenizer


# ──────────────────────────────────────────────────────────────────────────────
# Main training loop
# ──────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/generation.yaml")
    parser.add_argument("--debug", action="store_true",
                        help="Small data, 2 epochs, quick smoke-test")
    parser.add_argument("--load_in_4bit", action="store_true")
    parser.add_argument("--load_in_8bit", action="store_true")
    parser.add_argument("--fp16", action="store_true")
    parser.add_argument("--bf16", action="store_true")
    args = parser.parse_args()

    cfg = load_config(args.config)
    set_seed(cfg["training"]["seed"])

    # ── Model + tokenizer ────────────────────────────────────────────────────
    model, tokenizer = build_model(
        cfg,
        load_in_4bit=args.load_in_4bit,
        load_in_8bit=args.load_in_8bit,
    )

    # ── Data ──────────────────────────────────────────────────────────────────
    data_cfg = cfg["data"]
    limit = 500 if args.debug else None

    print("Loading training data …")
    train_raw = load_jsonl(data_cfg["train_file"], limit=limit)
    val_raw   = load_jsonl(data_cfg["val_file"],   limit=limit // 5 if limit else None)
    print(f"  Train: {len(train_raw):,}  Val: {len(val_raw):,}")

    max_in  = data_cfg["max_input_length"]
    max_out = data_cfg["max_target_length"]

    train_enc = preprocess(train_raw, tokenizer, max_in, max_out)
    val_enc   = preprocess(val_raw,   tokenizer, max_in, max_out)

    train_ds = Dataset.from_dict(train_enc)
    val_ds   = Dataset.from_dict(val_enc)

    # ── Training args ─────────────────────────────────────────────────────────
    t = cfg["training"]
    output_dir = Path(t["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)

    training_args = Seq2SeqTrainingArguments(
        output_dir=str(output_dir),
        num_train_epochs=2 if args.debug else t["num_train_epochs"],
        per_device_train_batch_size=t["per_device_train_batch_size"],
        per_device_eval_batch_size=t["per_device_eval_batch_size"],
        gradient_accumulation_steps=t["gradient_accumulation_steps"],
        learning_rate=t["learning_rate"],
        lr_scheduler_type=t["lr_scheduler_type"],
        warmup_ratio=t["warmup_ratio"],
        weight_decay=t["weight_decay"],
        fp16=args.fp16 or t.get("fp16", False),
        bf16=args.bf16 or t.get("bf16", False),
        max_grad_norm=t["max_grad_norm"],
        evaluation_strategy=t["eval_strategy"],
        save_strategy=t["save_strategy"],
        load_best_model_at_end=t["load_best_model_at_end"],
        metric_for_best_model=t["metric_for_best_model"],
        greater_is_better=t["greater_is_better"],
        logging_steps=t["logging_steps"],
        save_total_limit=t["save_total_limit"],
        report_to=t.get("report_to", "none"),
        predict_with_generate=True,
        generation_max_length=max_out,
        dataloader_num_workers=t.get("dataloader_num_workers", 0),
        seed=t["seed"],
    )

    data_collator = DataCollatorForSeq2Seq(
        tokenizer,
        model=model,
        padding=True,
        pad_to_multiple_of=8,
        label_pad_token_id=-100,
    )

    callbacks = []
    if not args.debug:
        patience = cfg.get("early_stopping", {}).get("patience", 3)
        callbacks.append(EarlyStoppingCallback(early_stopping_patience=patience))

    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        tokenizer=tokenizer,
        data_collator=data_collator,
        compute_metrics=compute_metrics_factory(tokenizer, max_out),
        callbacks=callbacks,
    )

    # ── Train ─────────────────────────────────────────────────────────────────
    print("\n=== Starting LoRA Fine-Tuning ===")
    trainer.train()

    # ── Save best ─────────────────────────────────────────────────────────────
    best_dir = output_dir / "best"
    trainer.save_model(str(best_dir))
    tokenizer.save_pretrained(str(best_dir))
    print(f"\n✅ Best model saved → {best_dir}")

    # ── Quick validation sample ───────────────────────────────────────────────
    print("\n=== Sample Inference ===")
    model.eval()
    sample = val_raw[:2]
    for ex in sample:
        inputs = tokenizer(
            ex["input"][:512],
            return_tensors="pt",
            truncation=True,
            max_length=max_in,
        ).to(model.device)

        gen_cfg = cfg.get("generation", {})
        with torch.no_grad():
            out = model.generate(
                **inputs,
                max_new_tokens=gen_cfg.get("max_new_tokens", 256),
                num_beams=gen_cfg.get("num_beams", 4),
            )
        decoded = tokenizer.decode(out[0], skip_special_tokens=True)
        print(f"  Input[:80]: {ex['input'][:80]}")
        print(f"  Output:     {decoded[:200]}")
        try:
            json.loads(decoded)
            print("  JSON: ✓ valid")
        except Exception:
            print("  JSON: ✗ invalid")
        print()

    print("Training complete.")


if __name__ == "__main__":
    main()
