"""
export_model.py
---------------
Merges LoRA adapter into the base model and saves a clean checkpoint
for deployment. Optionally quantizes to 4-bit GGUF (for llama.cpp serving).

Usage:
    # Merge and save as bfloat16
    python scripts/export_model.py \\
        --lora_path checkpoints/generation/final \\
        --base_model microsoft/Phi-3-mini-4k-instruct \\
        --output_dir exported/study-engine-phi3

    # Merge + quantize to 4-bit (requires llama.cpp installed)
    python scripts/export_model.py \\
        --lora_path checkpoints/generation/final \\
        --base_model microsoft/Phi-3-mini-4k-instruct \\
        --output_dir exported/study-engine-phi3 \\
        --quantize 4bit
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer


def merge_lora(lora_path: str, base_model: str, output_dir: str):
    """Load base model + LoRA adapter, merge weights, save merged model."""
    print(f"Loading base model: {base_model}")
    base = AutoModelForCausalLM.from_pretrained(
        base_model,
        device_map="cpu",          # CPU merge to avoid VRAM limits
        torch_dtype=torch.bfloat16,
        trust_remote_code=True,
    )
# def merge_lora(lora_path: str, base_model: str, output_dir: str):
#     """Load base model + LoRA adapter, merge weights, save merged model."""
#     print(f"Loading base model: {base_model}")
#     base = AutoModelForCausalLM.from_pretrained(
#         base_model,
#         device_map="cpu",          # CPU merge to avoid VRAM limits
#         torch_dtype=torch.bfloat16,
#         trust_remote_code=True,
#     )
    
    print(f"Loading LoRA adapter from: {lora_path}")
    peft_model = PeftModel.from_pretrained(base, lora_path)

    print("Merging LoRA weights into base model...")
    merged = peft_model.merge_and_unload()

    print(f"Saving merged model to: {output_dir}")
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    merged.save_pretrained(output_dir, safe_serialization=True)

    # Copy tokenizer
    tokenizer = AutoTokenizer.from_pretrained(lora_path, trust_remote_code=True)
    tokenizer.save_pretrained(output_dir)

    print("Merge complete. ✓")
    return output_dir


# def quantize_gguf(merged_dir: str, output_dir: str, bits: int = 4):
#     """
#     Convert merged HF model to GGUF format using llama.cpp convert scripts.

#     Requirements:
#         git clone https://github.com/ggerganov/llama.cpp
#         cd llama.cpp && pip install -r requirements.txt
#         make -j  (to build quantize binary)
#     """
def quantize_gguf(merged_dir: str, output_dir: str, bits: int = 4):
    """
    Convert merged HF model to GGUF format using llama.cpp convert scripts.

    Requirements:
        git clone https://github.com/ggerganov/llama.cpp
        cd llama.cpp && pip install -r requirements.txt
        make -j  (to build quantize binary)
    """
    gguf_dir = os.path.join(output_dir, "gguf")
    Path(gguf_dir).mkdir(parents=True, exist_ok=True)

    # Step 1: Convert to f16 GGUF
    f16_path = os.path.join(gguf_dir, "model-f16.gguf")
    convert_script = "llama.cpp/convert_hf_to_gguf.py"

    if not os.path.exists(convert_script):
        print("\n[WARN] llama.cpp not found. Skipping GGUF conversion.")
        print("  To enable quantization:")
        print("    git clone https://github.com/ggerganov/llama.cpp")
        print("    cd llama.cpp && pip install -r requirements.txt && make -j")
        return None

    print(f"Converting to GGUF (f16)...")
    result = subprocess.run(
        [sys.executable, convert_script, merged_dir,
         "--outfile", f16_path, "--outtype", "f16"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"[ERROR] GGUF conversion failed:\n{result.stderr}")
        return None

    # Step 2: Quantize
    quant_type = f"Q{bits}_K_M"
    quant_path = os.path.join(gguf_dir, f"model-{quant_type}.gguf")
    quantize_bin = "llama.cpp/build/bin/llama-quantize"
    if not os.path.exists(quantize_bin):
        quantize_bin = "llama.cpp/quantize"  # fallback path

    if not os.path.exists(quantize_bin):
        print("[WARN] llama-quantize binary not found. Run `make -j` in llama.cpp/")
        return f16_path

    print(f"Quantizing to {quant_type}...")
    result = subprocess.run(
        [quantize_bin, f16_path, quant_path, quant_type],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"[ERROR] Quantization failed:\n{result.stderr}")
        return f16_path

    # Cleanup f16 file (large)
    os.remove(f16_path)
    print(f"Quantized model saved: {quant_path} ✓")
    size_mb = os.path.getsize(quant_path) / (1024 ** 2)
    print(f"Size: {size_mb:.0f} MB")
    return quant_path


def print_model_info(output_dir: str):
    """Print basic info about the exported model."""
    files = list(Path(output_dir).rglob("*.safetensors")) + \
            list(Path(output_dir).rglob("*.bin")) + \
            list(Path(output_dir).rglob("*.gguf"))
    total_mb = sum(f.stat().st_size for f in files) / (1024 ** 2)
    print(f"\nExported files: {len(files)}")
    print(f"Total size: {total_mb:.0f} MB")
    for f in sorted(files):
        mb = f.stat().st_size / (1024 ** 2)
        print(f"  {f.name}  ({mb:.0f} MB)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lora_path", required=True,
                        help="Path to trained LoRA adapter")
    parser.add_argument("--base_model",
                        default="microsoft/Phi-3-mini-4k-instruct")
    parser.add_argument("--output_dir", required=True,
                        help="Directory to save exported model")
    parser.add_argument("--quantize", choices=["4bit", "8bit", "none"],
                        default="none",
                        help="Quantize output for llama.cpp serving")
    args = parser.parse_args()

    print("\n=== StudyBuddy Model Export ===\n")

    # Step 1: Merge LoRA
    merged_dir = os.path.join(args.output_dir, "merged")
    merge_lora(args.lora_path, args.base_model, merged_dir)

    # Step 2: Optional quantization
    if args.quantize != "none":
        bits = int(args.quantize.replace("bit", ""))
        quantize_gguf(merged_dir, args.output_dir, bits=bits)

    # Step 3: Write a deployment card
    card_path = os.path.join(args.output_dir, "MODEL_CARD.md")
    with open(card_path, "w") as f:
        f.write(f"""# StudyBuddy Study Engine Model

Base model: `{args.base_model}`
Fine-tuning: QLoRA (LoRA r=16, 4-bit NF4 quantization during training)
Tasks: makeQuestions, makeFlashcards, makeQuiz, evaluateAnswer
Output format: JSON only

## Usage (HuggingFace Transformers)

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch, json

model = AutoModelForCausalLM.from_pretrained("{merged_dir}", torch_dtype=torch.bfloat16, device_map="auto")
tok = AutoTokenizer.from_pretrained("{merged_dir}")

prompt = \"\"\"[INST] SYSTEM: You are an expert educational AI.
TASK: makeFlashcards
TOPIC: Machine Learning
COUNT: 3
NOTES: Overfitting occurs when a model memorizes training data...
Generate exactly 3 flashcards as valid JSON array. [/INST]\"\"\"

inputs = tok(prompt, return_tensors="pt").to(model.device)
out = model.generate(**inputs, max_new_tokens=400, do_sample=False)
print(json.loads(tok.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)))
```

## Serving (FastAPI)
See `study-engine/server.py` for the full API server.
""")

    print_model_info(args.output_dir)
    print(f"\nExport complete → {args.output_dir} ✓")


if __name__ == "__main__":
    main()
