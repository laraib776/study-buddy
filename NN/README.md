# StudyBuddy Neural Study Engine — Model Training

A production-ready training pipeline for the **StudyBuddy** educational AI system.
Fine-tunes a small language model (Phi-3-mini or Mistral-7B) with QLoRA to generate
flashcards, quizzes, subjective questions, and evaluate student answers.

---

## Architecture Summary

```
User Document
     │
     ▼
[study-engine adapter]
     │
     ├── Backend: Fine-tuned Mistral-7B / Phi-3-mini (QLoRA, served via FastAPI)
     │
     └── Browser fallback: Local rule-based studyEngine.js
```

**Base model options (choose one):**

| Model | Size | VRAM required | HuggingFace ID |
|-------|------|---------------|----------------|
| Phi-3-mini-4k-instruct | 3.8 B | ~8 GB (QLoRA) | `microsoft/Phi-3-mini-4k-instruct` |
| Mistral-7B-Instruct-v0.3 | 7 B | ~12 GB (QLoRA) | `mistralai/Mistral-7B-Instruct-v0.3` |
| Phi-3.5-mini-instruct | 3.8 B | ~8 GB (QLoRA) | `microsoft/Phi-3.5-mini-instruct` |

We recommend **Phi-3-mini** for budget GPUs and **Mistral-7B** for production quality.

---

## Datasets Used

All datasets are freely available on Hugging Face. No sign-up needed except ASAP-AES.

| Dataset | Purpose | HF Path | Size |
|---------|---------|---------|------|
| **RACE** | MCQ + reading comprehension (exam-style) | `race` | ~97k passages |
| **SQuAD v2** | QA pairs from documents | `squad_v2` | ~130k examples |
| **SciQ** | Science educational Q&A | `sciq` | ~13.7k examples |
| **QASC** | Multi-hop science QA | `qasc` | ~9.9k examples |
| **QuALITY** | Long-form reading comprehension | `emozilla/quality` | ~2.5k stories |
| **ASAP-AES** *(optional)* | Student answer scoring (0–100) | Kaggle (see below) | ~17k essays |

### ASAP-AES Dataset (for answer evaluation scoring)

1. Sign in at https://www.kaggle.com/
2. Go to https://www.kaggle.com/c/asap-aes/data
3. Accept competition rules → download `training_set_rel3.tsv`
4. Place file at: `data/raw/asap_training_set_rel3.tsv`
5. The `prepare_data.py` script will convert it automatically.

---

## Directory Structure

```
model-training/
├── data/
│   ├── raw/           ← downloaded datasets land here
│   ├── processed/     ← cleaned + formatted JSONL
│   └── eval/          ← held-out test split (by document)
├── scripts/
│   ├── prepare_data.py    ← download + convert all datasets
│   ├── train_lora.py      ← QLoRA fine-tuning
│   ├── evaluate.py        ← evaluation metrics
│   └── export_model.py    ← merge LoRA + export / quantize
├── configs/
│   ├── generation.yaml    ← training config for generation tasks
│   └── evaluation.yaml    ← training config for eval/scoring task
├── notebooks/
└── README.md
```

---

## Quick Start

### 1. Install dependencies

```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install transformers==4.44.0 datasets peft trl accelerate bitsandbytes
pip install evaluate rouge_score scikit-learn scipy pandas numpy tqdm pyyaml
pip install sentencepiece protobuf
```

Or install all at once:

```bash
pip install -r requirements.txt
```

### 2. Prepare datasets

```bash
python scripts/prepare_data.py \
  --output_dir data/processed \
  --val_ratio 0.1 \
  --test_ratio 0.1
```

This will:
- Download RACE, SQuAD v2, SciQ, QASC from Hugging Face automatically.
- Convert them to the StudyBuddy instruction format.
- Split by **document source** (not random row) to prevent leakage.
- Write `train.jsonl`, `val.jsonl`, `test.jsonl` to `data/processed/`.

### 3. Train the model

**Generation tasks (makeQuestions, makeFlashcards, makeQuiz):**

```bash
python scripts/train_lora.py \
  --config configs/generation.yaml \
  --base_model microsoft/Phi-3-mini-4k-instruct \
  --data_path data/processed/train.jsonl \
  --val_path data/processed/val.jsonl \
  --output_dir checkpoints/generation
```

**Answer evaluation task (evaluateAnswer):**

```bash
python scripts/train_lora.py \
  --config configs/evaluation.yaml \
  --base_model microsoft/Phi-3-mini-4k-instruct \
  --data_path data/processed/eval_train.jsonl \
  --val_path data/processed/eval_val.jsonl \
  --output_dir checkpoints/evaluation
```

Expected training time on an A100 (40 GB): ~3–5 hours per task.
On an RTX 3090 (24 GB): ~8–12 hours per task with QLoRA 4-bit.

### 4. Evaluate

```bash
python scripts/evaluate.py \
  --model_path checkpoints/generation \
  --base_model microsoft/Phi-3-mini-4k-instruct \
  --test_data data/processed/test.jsonl \
  --output_dir data/eval
```

Target metrics:
- JSON valid rate: > 98%
- Human-acceptable questions: > 85%
- Answer score correlation (Pearson r): > 0.75
- Hallucination rate: < 5%

### 5. Export / merge model

```bash
python scripts/export_model.py \
  --lora_path checkpoints/generation \
  --base_model microsoft/Phi-3-mini-4k-instruct \
  --output_dir exported/study-engine-phi3 \
  --quantize 4bit
```

---

## Serving the model

After export, serve with FastAPI:

```bash
cd ../
pip install fastapi uvicorn
uvicorn study-engine.server:app --host 0.0.0.0 --port 8000
```

The server exposes `POST /api/study-engine` matching the integration contract.

---

## Replacing / removing the engine

All model code lives in `study-engine/`. The app never imports model internals.
To swap the engine: replace `study-engine/` with a new implementation that exports
the same four methods. The UI does not change.

---

## Training tips

- Always split train/test **by document source**, not by row.
- Include negative examples: copied answers, vague answers, hallucinated facts.
- Use early stopping with `patience=3` on validation loss.
- Monitor JSON validity on the fly during training (see `evaluate.py`).
- For Roman Urdu / mixed-language users: add ~10% multilingual examples.
