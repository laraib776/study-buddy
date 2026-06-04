"""
server.py
---------
FastAPI backend for the StudyBuddy Neural Study Engine.
Exposes POST /api/study-engine matching the integration contract.

Setup:
    pip install fastapi uvicorn transformers peft torch

Run:
    uvicorn study-engine.server:app --host 0.0.0.0 --port 8000

Environment variables:
    MODEL_PATH       Path to exported merged model (default: exported/study-engine-phi3/merged)
    BASE_MODEL       HuggingFace model ID for base model (used if MODEL_PATH is a PEFT adapter)
    MAX_INPUT_CHARS  Max input text characters (default: 8000)
    RATE_LIMIT       Max requests per minute per IP (default: 30)
"""

import json
import logging
import os
import re
import time
from contextlib import asynccontextmanager
from typing import Any, Optional

import torch
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from transformers import AutoModelForCausalLM, AutoTokenizer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("study-engine")

# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────

MODEL_PATH = os.environ.get("MODEL_PATH", "exported/study-engine-phi3/merged")
BASE_MODEL = os.environ.get("BASE_MODEL", "microsoft/Phi-3-mini-4k-instruct")
MAX_INPUT_CHARS = int(os.environ.get("MAX_INPUT_CHARS", "8000"))
RATE_LIMIT = int(os.environ.get("RATE_LIMIT", "30"))

# ─────────────────────────────────────────────────────────────────────────────
# System prompt
# ─────────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = (
    "You are an expert educational AI. You generate high-quality flashcards, "
    "quizzes, and subjective questions from study notes, and evaluate student "
    "answers like a fair examiner. Always respond with valid JSON only."
)

# ─────────────────────────────────────────────────────────────────────────────
# Model state
# ─────────────────────────────────────────────────────────────────────────────

model_state = {"model": None, "tokenizer": None, "ready": False}

# ─────────────────────────────────────────────────────────────────────────────
# Rate limiter (simple in-memory)
# ─────────────────────────────────────────────────────────────────────────────

rate_store: dict = {}

def check_rate_limit(ip: str) -> bool:
    now = time.time()
    window_start = now - 60
    calls = rate_store.get(ip, [])
    calls = [t for t in calls if t > window_start]
    if len(calls) >= RATE_LIMIT:
        rate_store[ip] = calls
        return False
    calls.append(now)
    rate_store[ip] = calls
    return True


# ─────────────────────────────────────────────────────────────────────────────
# Prompt builders
# ─────────────────────────────────────────────────────────────────────────────

def build_prompt(task: str, notes: str, topic: str, count: int,
                  difficulty: str = "medium", student: str = "",
                  expected: str = "", question: str = "",
                  rubric: Optional[dict] = None) -> str:

    clean_notes = sanitize_input(notes)[:MAX_INPUT_CHARS]

    if task == "makeQuestions":
        return (
            f"[INST] SYSTEM: {SYSTEM_PROMPT}\n\n"
            f"TASK: makeQuestions\nTOPIC: {topic}\nCOUNT: {count}\n"
            f"DIFFICULTY: {difficulty}\n\nNOTES:\n{clean_notes}\n\n"
            f"Generate exactly {count} subjective practice questions as a valid JSON array. "
            f'Each item: {{"q":"...","ans":"...","rubric":{{"keyPoints":[],"mustMention":[],'
            f'"niceToHave":[]}},"difficulty":"medium","sourceSpan":"..."}}. '
            f"Do NOT embed the answer inside the question. [/INST]"
        )

    elif task == "makeFlashcards":
        return (
            f"[INST] SYSTEM: {SYSTEM_PROMPT}\n\n"
            f"TASK: makeFlashcards\nTOPIC: {topic}\nCOUNT: {count}\n\n"
            f"NOTES:\n{clean_notes}\n\n"
            f"Generate exactly {count} flashcards as a valid JSON array. "
            f'Each item: {{"front":"...","back":"...","tag":"...","difficulty":"medium",'
            f'"sourceSpan":"..."}}. [/INST]'
        )

    elif task == "makeQuiz":
        return (
            f"[INST] SYSTEM: {SYSTEM_PROMPT}\n\n"
            f"TASK: makeQuiz\nTOPIC: {topic}\nCOUNT: {count}\n"
            f"DIFFICULTY: {difficulty}\n\nNOTES:\n{clean_notes}\n\n"
            f"Generate a quiz as a valid JSON object with keys: "
            f'"mcq" (array of MCQs), "tf" (true/false), "blanks" (fill-in), "short" (short answer). '
            f'MCQ format: {{"q":"","opts":["","","",""],"ans":0,"exp":""}}. '
            f'TF format: {{"q":"","ans":true,"exp":""}}. '
            f'Blanks format: {{"q":"_____ is X","ans":"","exp":""}}. [/INST]'
        )

    elif task == "evaluateAnswer":
        rubric_str = json.dumps(rubric or {"keyPoints": []})
        return (
            f"[INST] SYSTEM: {SYSTEM_PROMPT}\n\n"
            f"TASK: evaluateAnswer\nTOPIC: {topic}\n"
            f"QUESTION: {question}\n"
            f"REFERENCE ANSWER: {expected[:600]}\n"
            f"RUBRIC: {rubric_str}\n"
            f"STUDENT ANSWER: {sanitize_input(student)[:1200]}\n\n"
            f"Evaluate the student answer. Return ONLY valid JSON: "
            f'{{"pct":0-100,"correct":bool,"band":"weak|partial|good|strong",'
            f'"feedback":"short feedback without revealing full reference answer",'
            f'"strengths":[],"missing":[],"rubricHits":[],"rubricMisses":[]}}. [/INST]'
        )

    raise ValueError(f"Unknown task: {task}")


def sanitize_input(text: str) -> str:
    """Strip HTML tags and script content from user input."""
    text = re.sub(r"<script[^>]*>.*?</script>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip()


# ─────────────────────────────────────────────────────────────────────────────
# Inference
# ─────────────────────────────────────────────────────────────────────────────

def infer(prompt: str, max_new_tokens: int = 600) -> str:
    model = model_state["model"]
    tokenizer = model_state["tokenizer"]

    inputs = tokenizer(
        prompt,
        return_tensors="pt",
        truncation=True,
        max_length=2000,
    ).to(model.device)

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

    new_tokens = output[0][inputs["input_ids"].shape[1]:]
    return tokenizer.decode(new_tokens, skip_special_tokens=True).strip()


def parse_json_response(raw: str) -> Any:
    """Try to parse JSON from model output; strip markdown fences if needed."""
    text = raw.strip()
    # Remove ```json ... ``` fences
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


# ─────────────────────────────────────────────────────────────────────────────
# Request / Response schemas
# ─────────────────────────────────────────────────────────────────────────────

class StudyRequest(BaseModel):
    task: str = Field(..., description="makeQuestions | makeFlashcards | makeQuiz | evaluateAnswer")
    notes: Optional[str] = ""
    topic: Optional[str] = "General"
    count: Optional[int] = Field(5, ge=1, le=20)
    difficulty: Optional[str] = "medium"
    # evaluateAnswer fields
    student: Optional[str] = ""
    expected: Optional[str] = ""
    question: Optional[str] = ""
    rubric: Optional[dict] = None

    @validator("task")
    def task_must_be_valid(cls, v):
        valid = {"makeQuestions", "makeFlashcards", "makeQuiz", "evaluateAnswer"}
        if v not in valid:
            raise ValueError(f"task must be one of {valid}")
        return v

    @validator("notes", "student", "expected", pre=True)
    def limit_length(cls, v):
        if v and len(v) > 10000:
            return v[:10000]
        return v


# ─────────────────────────────────────────────────────────────────────────────
# App lifecycle
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Loading model from: {MODEL_PATH}")
    try:
        tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, trust_remote_code=True)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        model = AutoModelForCausalLM.from_pretrained(
            MODEL_PATH,
            device_map="auto",
            torch_dtype=torch.bfloat16,
            trust_remote_code=True,
        )
        model.eval()
        model_state["model"] = model
        model_state["tokenizer"] = tokenizer
        model_state["ready"] = True
        logger.info("Model ready. ✓")
    except Exception as e:
        logger.error(f"Model failed to load: {e}")
        model_state["ready"] = False
    yield
    logger.info("Shutting down study engine.")


app = FastAPI(title="StudyBuddy Neural Study Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # restrict in production
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"ok": model_state["ready"], "model": MODEL_PATH}


@app.post("/api/study-engine")
async def study_engine(request: Request, body: StudyRequest):
    # Rate limit
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Try again later.")

    # Model readiness check
    if not model_state["ready"]:
        return JSONResponse(
            status_code=503,
            content={"ok": False, "error": "Model unavailable", "fallbackRecommended": True}
        )

    try:
        t0 = time.perf_counter()

        prompt = build_prompt(
            task=body.task,
            notes=body.notes or "",
            topic=body.topic or "General",
            count=body.count or 5,
            difficulty=body.difficulty or "medium",
            student=body.student or "",
            expected=body.expected or "",
            question=body.question or "",
            rubric=body.rubric,
        )

        raw = infer(prompt)
        data = parse_json_response(raw)
        latency = time.perf_counter() - t0

        logger.info(f"task={body.task} latency={latency:.2f}s ip={client_ip}")
        return {"ok": True, "data": data, "latency_s": round(latency, 3)}

    except json.JSONDecodeError:
        logger.warning(f"JSON parse failed for task={body.task}. Raw: {raw[:200]}")
        return JSONResponse(
            status_code=200,
            content={"ok": False, "error": "Model returned invalid JSON",
                     "fallbackRecommended": True}
        )
    except Exception as e:
        logger.exception(f"Inference error: {e}")
        return JSONResponse(
            status_code=500,
            content={"ok": False, "error": str(e), "fallbackRecommended": True}
        )
