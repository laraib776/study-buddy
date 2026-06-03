# StudyBuddy Neural Study Engine — Training Pipeline

## Overview

This pipeline fine-tunes two models:

| Model | Role | Base |
|-------|------|------|
| **Generation Model** | makeQuestions / makeFlashcards / makeQuiz | `google/flan-t5-base` + LoRA |
| **Evaluation Model** | evaluateAnswer scoring regression | `roberta-base` + regression head |

Both are trained with parameter-efficient fine-tuning (PEFT/LoRA), so they run on a single consumer GPU (12 GB VRAM) or Google Colab T4.

---

## Directory Layout

```
model-training/
  data/
    raw/          ← downloaded datasets (auto-created by prepare_data.py)
    processed/    ← tokenized JSONL splits
    eval/         ← held-out test set (by document, not row)
  scripts/
    prepare_data.py     ← download + convert all datasets
    train_lora.py       ← LoRA fine-tune generation model
    train_evaluator.py  ← fine-tune answer scorer
    evaluate.py         ← full metric report
    export_model.py     ← merge + quantize + export to ONNX
    test_model.py       ← integration smoke tests
  configs/
    generation.yaml     ← hyperparameters for generation training
    evaluation.yaml     ← hyperparameters for evaluator training
  notebooks/            ← exploratory Jupyter notebooks
  README.md
```

---

## Datasets Used

### Generation Tasks (questions / flashcards / quiz)

| Dataset | Source | Size | Use |
|---------|--------|------|-----|
| **SQuAD 2.0** | HuggingFace `rajpurkar/squad_v2` | 130k QA pairs | Question generation from passages |
| **FairytaleQA** | HuggingFace `workdaypt/FairytaleQA_Dataset` | 10k edu Q/A | Educationally grounded Q generation |
| **RACE** | HuggingFace `ehovy/race` | 97k MCQ | MCQ generation (all difficulty levels) |
| **SciQ** | HuggingFace `allenai/sciq` | 13k MCQ | Science MCQ with distractors |
| **ARC Challenge** | HuggingFace `allenai/ai2_arc` | 7k MCQ | Hard reasoning MCQ |
| **OpenBookQA** | HuggingFace `allenai/openbookqa` | 5.9k QA | Fact-based short answer |

### Answer Evaluation Task

| Dataset | Source | Size | Use |
|---------|--------|------|-----|
| **ASAP-AES** | Kaggle / HuggingFace `tasksource/asap` | 12k graded answers | Short-answer grading, score 0-3 |
| **Mohler Dataset** | `winogrande` proxy / direct download | 2.3k answer pairs | CS Q/A with human scores |
| **SemEval-2013 Task 7** | HuggingFace `sem_eval_2010_task_8` proxy | 5k graded answers | Student answer scoring |

> **Download link for ASAP:** https://www.kaggle.com/c/asap-aes/data  
> **Download link for Mohler:** https://github.com/mheilman/semeval-2013-task7  
> All HuggingFace datasets are downloaded automatically by `prepare_data.py`.

---

## Quick Start

### 1. Environment Setup

```bash
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

pip install -r requirements.txt
```

`requirements.txt` content:
```
torch>=2.1.0
transformers>=4.40.0
peft>=0.10.0
datasets>=2.18.0
accelerate>=0.28.0
bitsandbytes>=0.43.0
evaluate>=0.4.0
rouge_score>=0.1.2
sentencepiece>=0.1.99
scipy>=1.11.0
scikit-learn>=1.3.0
numpy>=1.24.0
pandas>=2.0.0
tqdm>=4.65.0
pyyaml>=6.0
nltk>=3.8
onnx>=1.15.0
optimum[onnxruntime]>=1.16.0
```

### 2. Download and Prepare All Datasets

```bash
python scripts/prepare_data.py --output_dir data/
```

This will:
- Download all HuggingFace datasets automatically
- Convert them to unified JSONL format
- Split by **document source** (not random row) to prevent leakage
- Write `data/processed/train.jsonl`, `val.jsonl`, `test.jsonl`
- Write `data/eval/evaluator_train.jsonl`, `evaluator_val.jsonl`, `evaluator_test.jsonl`
- Print a summary of counts per task

### 3. Train the Generation Model

```bash
python scripts/train_lora.py --config configs/generation.yaml
```

Checkpoints saved to `outputs/generation/`.

### 4. Train the Answer Evaluator

```bash
python scripts/train_evaluator.py --config configs/evaluation.yaml
```

Checkpoints saved to `outputs/evaluator/`.

### 5. Evaluate Both Models

```bash
python scripts/evaluate.py \
  --gen_model outputs/generation/best \
  --eval_model outputs/evaluator/best \
  --test_data data/processed/test.jsonl \
  --eval_test data/eval/evaluator_test.jsonl
```

Prints a full metrics table and saves `results/metrics.json`.

### 6. Export for Deployment

```bash
# Merge LoRA weights and optionally quantize / export ONNX
python scripts/export_model.py \
  --model_path outputs/generation/best \
  --output_path exports/generation \
  --quantize int8          # optional: int8, int4, none
  --export_onnx            # optional: for browser/WASM deployment
```

---

## Training Hardware Requirements

| Setup | VRAM | ETA (generation) | ETA (evaluator) |
|-------|------|-------------------|-----------------|
| Single A100 40GB | 40 GB | ~3 hours | ~1 hour |
| Single RTX 3090/4090 | 24 GB | ~6 hours | ~2 hours |
| Google Colab T4 | 16 GB | ~12 hours | ~3 hours |
| CPU only (not recommended) | — | days | hours |

> Use `--fp16` flag on A100/RTX; use `--load_in_4bit` on T4/Colab.

---

## Target Metrics

| Metric | Target |
|--------|--------|
| JSON validity rate | > 98% |
| Human-acceptable questions | > 85% |
| Answer score correlation (Pearson r) | > 0.75 |
| Hallucinated unsupported facts | < 5% |
| p95 latency (backend) | < 5 s |
| p95 latency (local scorer) | < 1.5 s |

---

## Integration Adapter

After export, copy the adapter to your app:

```
client/public/study-engine/    ← browser / WASM build
server/src/study-engine/       ← backend API
```

The runtime adapter exposes the same `window.StudyBuddyEngine` API.  
See `study_engine_adapter.js` (backend) and `study_engine_browser.js` (WASM) included in this repo.

---

## Replacement Instructions

To swap the neural engine for a different model:
1. Place new model files in `client/public/study-engine/` or `server/src/study-engine/`.
2. Implement the same four methods: `makeQuestions`, `evaluateAnswer`, `makeFlashcards`, `makeQuiz`.
3. No UI changes required — the adapter contract is fixed.

---

## Notes

- Never train on the test split.  Train/val/test are split **by document source**.
- The evaluator **does not** leak full reference answers to the student — `suggestedAnswer` is omitted unless the UI requests it.
- All model-specific code is isolated; UI components import only the adapter.
