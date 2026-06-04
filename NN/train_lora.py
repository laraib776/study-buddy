"""
train_lora.py
-------------
QLoRA fine-tuning for the StudyBuddy neural study engine.
Uses PEFT LoRA + bitsandbytes 4-bit quantization + TRL SFTTrainer.

Usage:
    # Generation tasks (makeQuestions, makeFlashcards, makeQuiz):
    python scripts/train_lora.py \\
        --config configs/generation.yaml \\
        --base_model microsoft/Phi-3-mini-4k-instruct \\
        --data_path data/processed/train.jsonl \\
        --val_path data/processed/val.jsonl \\
        --output_dir checkpoints/generation

    # Evaluation task (evaluateAnswer):
    python scripts/train_lora.py \\
        --config configs/evaluation.yaml \\
        --base_model microsoft/Phi-3-mini-4k-instruct \\
        --data_path data/processed/eval_train.jsonl \\
        --val_path data/processed/eval_val.jsonl \\
        --output_dir checkpoints/evaluation
"""

import argparse
import json
import os
import yaml
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

import torch
from datasets import load_dataset, Dataset
from peft import LoraConfig, TaskType, get_peft_model, prepare_model_for_kbit_training
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments,
    EarlyStoppingCallback,
)
from trl import SFTTrainer, DataCollatorForCompletionOnlyLM


# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class TrainConfig:
    # Model
    base_model: str = "microsoft/Phi-3-mini-4k-instruct"
    lora_r: int = 16
    lora_alpha: int = 32
    lora_dropout: float = 0.05
    lora_target_modules: list = field(
        default_factory=lambda: ["q_proj", "k_proj", "v_proj", "o_proj",
                                  "gate_proj", "up_proj", "down_proj"]
    )
    use_4bit: bool = True
    bnb_4bit_compute_dtype: str = "bfloat16"

    # Data
    data_path: str = "data/processed/train.jsonl"
    val_path: str = "data/processed/val.jsonl"
    max_seq_length: int = 2048
    packing: bool = False

    # Training
    output_dir: str = "checkpoints/generation"
    num_train_epochs: int = 3
    per_device_train_batch_size: int = 4
    per_device_eval_batch_size: int = 4
    gradient_accumulation_steps: int = 4
    learning_rate: float = 2e-4
    lr_scheduler_type: str = "cosine"
    warmup_ratio: float = 0.03
    weight_decay: float = 0.001
    optim: str = "paged_adamw_32bit"
    fp16: bool = False
    bf16: bool = True
    logging_steps: int = 25
    save_steps: int = 200
    eval_steps: int = 200
    early_stopping_patience: int = 3
    load_best_model_at_end: bool = True
    report_to: str = "none"  # change to "wandb" if you want W&B logging
    seed: int = 42


def load_config(yaml_path: Optional[str], overrides: dict) -> TrainConfig:
    cfg = TrainConfig()
    if yaml_path and os.path.exists(yaml_path):
        with open(yaml_path) as f:
            yaml_data = yaml.safe_load(f)
        for k, v in yaml_data.items():
            if hasattr(cfg, k):
                setattr(cfg, k, v)
    for k, v in overrides.items():
        if v is not None and hasattr(cfg, k):
            setattr(cfg, k, v)
    return cfg


# ─────────────────────────────────────────────────────────────────────────────
# Dataset loading
# ─────────────────────────────────────────────────────────────────────────────

def load_jsonl(path: str) -> Dataset:
    """Load a .jsonl file and return a HuggingFace Dataset."""
    data = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                data.append(json.loads(line))
    return Dataset.from_list(data)


def format_example(example: dict, tokenizer) -> dict:
    """
    Combine prompt + completion into a single 'text' field.
    The SFTTrainer with DataCollatorForCompletionOnlyLM will train
    only on the completion part (after [/INST]).
    """
    prompt = example["prompt"]
    completion = example["completion"]
    # Add EOS token to end of completion
    text = prompt + completion + tokenizer.eos_token
    return {"text": text}


# ─────────────────────────────────────────────────────────────────────────────
# Model setup
# ─────────────────────────────────────────────────────────────────────────────

def build_model_and_tokenizer(cfg: TrainConfig):
    compute_dtype = getattr(torch, cfg.bnb_4bit_compute_dtype)

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=cfg.use_4bit,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=compute_dtype,
        bnb_4bit_use_double_quant=True,
    )

    print(f"Loading base model: {cfg.base_model}")
    model = AutoModelForCausalLM.from_pretrained(
        cfg.base_model,
        quantization_config=bnb_config if cfg.use_4bit else None,
        device_map="auto",
        trust_remote_code=True,
        torch_dtype=compute_dtype,
        attn_implementation="flash_attention_2" if is_flash_attn_available() else "eager",
    )
    model.config.use_cache = False
    model.config.pretraining_tp = 1

    tokenizer = AutoTokenizer.from_pretrained(
        cfg.base_model, trust_remote_code=True
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    if cfg.use_4bit:
        model = prepare_model_for_kbit_training(model)

    lora_config = LoraConfig(
        r=cfg.lora_r,
        lora_alpha=cfg.lora_alpha,
        target_modules=cfg.lora_target_modules,
        lora_dropout=cfg.lora_dropout,
        bias="none",
        task_type=TaskType.CAUSAL_LM,
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    return model, tokenizer


def is_flash_attn_available() -> bool:
    try:
        import flash_attn  # noqa
        return True
    except ImportError:
        return False


# ─────────────────────────────────────────────────────────────────────────────
# JSON validity callback
# ─────────────────────────────────────────────────────────────────────────────

from transformers import TrainerCallback

class JsonValidityCallback(TrainerCallback):
    """Logs the fraction of completions that parse as valid JSON during eval."""

    def __init__(self, tokenizer, eval_dataset, sample_size=50):
        self.tokenizer = tokenizer
        self.eval_dataset = eval_dataset
        self.sample_size = sample_size

    def on_evaluate(self, args, state, control, model=None, **kwargs):
        if model is None:
            return
        import random
        samples = random.sample(
            list(self.eval_dataset),
            min(self.sample_size, len(self.eval_dataset))
        )
        valid = 0
        model.eval()
        with torch.no_grad():
            for sample in samples:
                prompt = sample["prompt"]
                inputs = self.tokenizer(
                    prompt, return_tensors="pt", truncation=True, max_length=1800
                ).to(model.device)
                out = model.generate(
                    **inputs,
                    max_new_tokens=512,
                    do_sample=False,
                    temperature=1.0,
                    pad_token_id=self.tokenizer.pad_token_id,
                )
                decoded = self.tokenizer.decode(
                    out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True
                )
                try:
                    json.loads(decoded.strip())
                    valid += 1
                except json.JSONDecodeError:
                    pass
        json_rate = valid / len(samples) if samples else 0
        print(f"\n[JsonValidity] {valid}/{len(samples)} = {json_rate:.1%} valid JSON")
        if state.log_history is not None:
            state.log_history.append({"json_valid_rate": json_rate,
                                       "step": state.global_step})


# ─────────────────────────────────────────────────────────────────────────────
# Main training
# ─────────────────────────────────────────────────────────────────────────────

def train(cfg: TrainConfig):
    Path(cfg.output_dir).mkdir(parents=True, exist_ok=True)

    # ── Build model ───────────────────────────────────────────────────────────
    model, tokenizer = build_model_and_tokenizer(cfg)

    # ── Load datasets ─────────────────────────────────────────────────────────
    print(f"Loading training data: {cfg.data_path}")
    train_ds = load_jsonl(cfg.data_path)
    val_ds = load_jsonl(cfg.val_path)

    # Format to text field
    train_ds = train_ds.map(lambda ex: format_example(ex, tokenizer))
    val_ds = val_ds.map(lambda ex: format_example(ex, tokenizer))

    print(f"Train: {len(train_ds):,} examples | Val: {len(val_ds):,} examples")

    # ── Training arguments ────────────────────────────────────────────────────
    training_args = TrainingArguments(
        output_dir=cfg.output_dir,
        num_train_epochs=cfg.num_train_epochs,
        per_device_train_batch_size=cfg.per_device_train_batch_size,
        per_device_eval_batch_size=cfg.per_device_eval_batch_size,
        gradient_accumulation_steps=cfg.gradient_accumulation_steps,
        optim=cfg.optim,
        save_steps=cfg.save_steps,
        logging_steps=cfg.logging_steps,
        learning_rate=cfg.learning_rate,
        weight_decay=cfg.weight_decay,
        fp16=cfg.fp16,
        bf16=cfg.bf16,
        max_grad_norm=0.3,
        warmup_ratio=cfg.warmup_ratio,
        group_by_length=True,
        lr_scheduler_type=cfg.lr_scheduler_type,
        report_to=cfg.report_to,
        evaluation_strategy="steps",
        eval_steps=cfg.eval_steps,
        load_best_model_at_end=cfg.load_best_model_at_end,
        metric_for_best_model="eval_loss",
        greater_is_better=False,
        seed=cfg.seed,
        dataloader_num_workers=4,
        remove_unused_columns=False,
    )

    # ── Completion-only collator: train on completions only ───────────────────
    # The response template is the token after [/INST]
    response_template = "[/INST]"
    collator = DataCollatorForCompletionOnlyLM(
        response_template=response_template,
        tokenizer=tokenizer,
    )

    # ── Callbacks ─────────────────────────────────────────────────────────────
    callbacks = [
        EarlyStoppingCallback(early_stopping_patience=cfg.early_stopping_patience),
        JsonValidityCallback(tokenizer, val_ds, sample_size=30),
    ]

    # ── Trainer ───────────────────────────────────────────────────────────────
    trainer = SFTTrainer(
        model=model,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        dataset_text_field="text",
        max_seq_length=cfg.max_seq_length,
        tokenizer=tokenizer,
        args=training_args,
        packing=cfg.packing,
        data_collator=collator,
        callbacks=callbacks,
    )

    # ── Train ─────────────────────────────────────────────────────────────────
    print("\n=== Starting Training ===\n")
    trainer.train()

    # ── Save ──────────────────────────────────────────────────────────────────
    final_path = os.path.join(cfg.output_dir, "final")
    trainer.save_model(final_path)
    tokenizer.save_pretrained(final_path)
    print(f"\nModel saved to: {final_path}")

    # ── Save config ───────────────────────────────────────────────────────────
    with open(os.path.join(cfg.output_dir, "train_config.json"), "w") as f:
        json.dump(cfg.__dict__, f, indent=2)

    print("\nTraining complete. ✓")


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=None, help="Path to YAML config")
    parser.add_argument("--base_model", default=None)
    parser.add_argument("--data_path", default=None)
    parser.add_argument("--val_path", default=None)
    parser.add_argument("--output_dir", default=None)
    parser.add_argument("--epochs", type=int, default=None, dest="num_train_epochs")
    parser.add_argument("--lr", type=float, default=None, dest="learning_rate")
    parser.add_argument("--batch_size", type=int, default=None,
                        dest="per_device_train_batch_size")
    parser.add_argument("--lora_r", type=int, default=None)
    parser.add_argument("--no_4bit", action="store_true")
    args = parser.parse_args()

    overrides = {k: v for k, v in vars(args).items()
                 if k not in ("config", "no_4bit") and v is not None}
    if args.no_4bit:
        overrides["use_4bit"] = False

    cfg = load_config(args.config, overrides)
    print("\nEffective config:")
    print(json.dumps(cfg.__dict__, indent=2, default=str))

    train(cfg)


if __name__ == "__main__":
    main()
