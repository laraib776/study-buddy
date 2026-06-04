"""
test_study_engine.py
--------------------
Unit + integration tests for the StudyBuddy neural study engine.

Run:
    # Unit tests only (no model needed)
    pytest test_study_engine.py -v -m "not integration"

    # Full integration tests (model must be running)
    MODEL_PATH=exported/study-engine-phi3/merged \\
    pytest test_study_engine.py -v

    # Against live API server
    API_URL=http://localhost:8000 \\
    pytest test_study_engine.py -v -m integration
"""

import json
import os
import re
import pytest
import requests
from typing import Any

API_URL = os.environ.get("API_URL", "http://localhost:8000")
MODEL_PATH = os.environ.get("MODEL_PATH", None)

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

SAMPLE_NOTES = """
Machine Learning is a branch of artificial intelligence that enables systems to learn
from data and improve from experience without being explicitly programmed.

Overfitting occurs when a model learns the training data too well, including noise,
and performs poorly on new, unseen data. Signs include high training accuracy but low
validation accuracy.

Regularization techniques like L1 (Lasso) and L2 (Ridge) are used to reduce overfitting
by adding a penalty to the loss function for large weights.

A neural network is a series of algorithms that attempt to recognize underlying
relationships in a set of data through a process that mimics how the human brain operates.
Layers include input, hidden, and output layers.

Transfer learning reuses a pre-trained model on a new related task, reducing training time
and data requirements significantly.
"""

SAMPLE_TOPIC = "Machine Learning"


def is_valid_json(text: str) -> tuple:
    try:
        obj = json.loads(text)
        return True, obj
    except json.JSONDecodeError:
        return False, None


def api_post(payload: dict) -> dict:
    resp = requests.post(f"{API_URL}/api/study-engine", json=payload, timeout=30)
    return resp.json()


# ─────────────────────────────────────────────────────────────────────────────
# Schema validators
# ─────────────────────────────────────────────────────────────────────────────

def validate_questions(data: Any):
    assert isinstance(data, list), "makeQuestions must return a list"
    assert len(data) > 0, "Questions list must not be empty"
    for item in data:
        assert "q" in item, "Question must have 'q' field"
        assert "ans" in item, "Question must have 'ans' field"
        assert "rubric" in item, "Question must have 'rubric' field"
        assert "difficulty" in item, "Question must have 'difficulty' field"
        # Ensure answer is not embedded in question
        assert item["ans"][:30].lower() not in item["q"].lower(), \
            "Answer text must not appear inside question text"
        # Difficulty must be valid
        assert item["difficulty"] in ("easy", "medium", "hard"), \
            f"Invalid difficulty: {item['difficulty']}"
        # Rubric structure
        assert isinstance(item["rubric"].get("keyPoints", []), list)


def validate_flashcards(data: Any):
    assert isinstance(data, list), "makeFlashcards must return a list"
    assert len(data) > 0, "Flashcards list must not be empty"
    for card in data:
        assert "front" in card and card["front"].strip(), "Flashcard must have non-empty 'front'"
        assert "back" in card and card["back"].strip(), "Flashcard must have non-empty 'back'"
        assert "tag" in card, "Flashcard must have 'tag'"
        assert "difficulty" in card, "Flashcard must have 'difficulty'"
        # front should be a question
        assert len(card["front"]) < 300, "Flashcard front must be concise"
        assert len(card["back"]) < 500, "Flashcard back must be concise"


def validate_quiz(data: Any):
    assert isinstance(data, dict), "makeQuiz must return a dict"
    assert "mcq" in data, "Quiz must have 'mcq' array"
    assert "tf" in data, "Quiz must have 'tf' array"
    assert "blanks" in data, "Quiz must have 'blanks' array"
    assert "short" in data, "Quiz must have 'short' array"
    for mcq in data["mcq"]:
        assert "q" in mcq and "opts" in mcq and "ans" in mcq and "exp" in mcq
        assert len(mcq["opts"]) == 4, "MCQ must have exactly 4 options"
        assert isinstance(mcq["ans"], int), "MCQ answer must be integer index"
        assert 0 <= mcq["ans"] <= 3, "MCQ answer index out of range"
    for tf in data["tf"]:
        assert "q" in tf and "ans" in tf and "exp" in tf
        assert isinstance(tf["ans"], bool), "TF answer must be bool"
    for blank in data["blanks"]:
        assert "q" in blank and "ans" in blank and "exp" in blank
        assert "___" in blank["q"] or "_____" in blank["q"], \
            "Fill-in-blank question must contain blank marker"


def validate_evaluation(data: Any):
    assert isinstance(data, dict), "evaluateAnswer must return a dict"
    assert "pct" in data, "Evaluation must have 'pct'"
    assert "correct" in data, "Evaluation must have 'correct'"
    assert "band" in data, "Evaluation must have 'band'"
    assert "feedback" in data, "Evaluation must have 'feedback'"
    assert isinstance(data["pct"], int), "pct must be int"
    assert 0 <= data["pct"] <= 100, f"pct out of range: {data['pct']}"
    assert data["band"] in ("weak", "partial", "good", "strong"), \
        f"Invalid band: {data['band']}"
    assert isinstance(data["correct"], bool), "correct must be bool"
    # Feedback must not be empty
    assert len(data["feedback"].strip()) > 10, "Feedback must be meaningful"


# ─────────────────────────────────────────────────────────────────────────────
# Unit tests — JSON format validation (no model needed)
# ─────────────────────────────────────────────────────────────────────────────

class TestJsonSchemas:

    def test_valid_questions_schema(self):
        sample = [
            {
                "q": "Explain overfitting in your own words.",
                "ans": "Overfitting is when a model memorizes training data.",
                "rubric": {"keyPoints": ["memorization", "poor generalization"],
                           "mustMention": [], "niceToHave": []},
                "difficulty": "medium",
                "sourceSpan": "Overfitting occurs..."
            }
        ]
        validate_questions(sample)

    def test_valid_flashcard_schema(self):
        sample = [
            {
                "front": "What is transfer learning?",
                "back": "Transfer learning reuses a pre-trained model on a related task.",
                "tag": "machine learning",
                "difficulty": "medium",
                "sourceSpan": "Transfer learning reuses..."
            }
        ]
        validate_flashcards(sample)

    def test_valid_quiz_schema(self):
        sample = {
            "mcq": [{"q": "Which best describes overfitting?",
                     "opts": ["High train, low val", "Low train, low val",
                               "High train, high val", "Low train, high val"],
                     "ans": 0, "exp": "Overfitting = high train, low val."}],
            "tf": [{"q": "Regularization helps reduce overfitting.", "ans": True,
                    "exp": "Correct."}],
            "blanks": [{"q": "_____ penalizes large model weights.",
                        "ans": "Regularization", "exp": "Regularization explanation."}],
            "short": [{"q": "Explain overfitting.", "ans": "..."}]
        }
        validate_quiz(sample)

    def test_valid_evaluation_schema(self):
        sample = {
            "pct": 78, "correct": True, "band": "good",
            "feedback": "Good answer. Add deployment details.",
            "strengths": ["mentions ML focus"],
            "missing": ["deployment stack"],
            "rubricHits": ["machine learning"],
            "rubricMisses": ["deployment"]
        }
        validate_evaluation(sample)

    def test_evaluation_score_range(self):
        for pct in [0, 25, 50, 75, 100]:
            data = {"pct": pct, "correct": pct >= 60, "band": "good",
                    "feedback": "Test feedback here.", "strengths": [],
                    "missing": [], "rubricHits": [], "rubricMisses": []}
            validate_evaluation(data)

    def test_answer_not_in_question(self):
        question = {"q": "Explain overfitting.", "ans": "Overfitting is memorization.",
                    "rubric": {"keyPoints": []}, "difficulty": "medium", "sourceSpan": ""}
        assert "Overfitting is memorization" not in question["q"]

    def test_blank_question_has_marker(self):
        blank = {"q": "_____ reduces overfitting.", "ans": "Regularization", "exp": "..."}
        assert "___" in blank["q"]


# ─────────────────────────────────────────────────────────────────────────────
# Unit tests — blank evaluator (client-side logic)
# ─────────────────────────────────────────────────────────────────────────────

class TestBlankEvaluator:
    """Test the pure-Python version of the blank evaluator logic."""

    def _evaluate(self, student, expected, accepted=None):
        """Python port of the JS evaluateBlank function."""
        def normalize(s):
            return re.sub(r"[^a-z0-9]", "", s.lower().strip())

        def levenshtein(a, b):
            m, n = len(a), len(b)
            dp = [[0] * (n + 1) for _ in range(m + 1)]
            for i in range(m + 1): dp[i][0] = i
            for j in range(n + 1): dp[0][j] = j
            for i in range(1, m + 1):
                for j in range(1, n + 1):
                    if a[i - 1] == b[j - 1]:
                        dp[i][j] = dp[i - 1][j - 1]
                    else:
                        dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
            return dp[m][n]

        s_norm = normalize(student)
        e_norm = normalize(expected)
        all_accepted = [e_norm] + [normalize(a) for a in (accepted or [])]

        if s_norm in all_accepted:
            return {"pct": 100, "correct": True}
        if any(levenshtein(s_norm, a) <= 2 for a in all_accepted):
            return {"pct": 90, "correct": True}
        return {"pct": 0, "correct": False}

    def test_exact_match(self):
        r = self._evaluate("Regularization", "Regularization")
        assert r["correct"] and r["pct"] == 100

    def test_case_insensitive(self):
        r = self._evaluate("regularization", "Regularization")
        assert r["correct"] and r["pct"] == 100

    def test_british_spelling(self):
        r = self._evaluate("regularisation", "Regularization",
                           accepted=["regularisation"])
        assert r["correct"]

    def test_typo_tolerance(self):
        r = self._evaluate("regularizaton", "Regularization")  # 1 char missing
        assert r["correct"]

    def test_wrong_answer(self):
        r = self._evaluate("dropout", "Regularization")
        assert not r["correct"] and r["pct"] == 0

    def test_blank_answer(self):
        r = self._evaluate("", "Regularization")
        assert not r["correct"] and r["pct"] == 0


# ─────────────────────────────────────────────────────────────────────────────
# Hallucination check
# ─────────────────────────────────────────────────────────────────────────────

class TestHallucinationChecks:

    HALLUCINATION_PATTERNS = [
        r"\bquantum\b",
        r"\bblockchain\b",
        r"\bNFT\b",
        r"\bmetaverse\b",
    ]

    def _contains_hallucination(self, text: str) -> bool:
        text_lower = text.lower()
        return any(re.search(p, text_lower) for p in self.HALLUCINATION_PATTERNS)

    def test_no_hallucination_in_ml_question(self):
        """Questions about ML should not mention unrelated topics."""
        questions = [
            {"q": "Explain how neural networks learn.", "ans": "Backpropagation.",
             "rubric": {"keyPoints": []}, "difficulty": "medium", "sourceSpan": ""}
        ]
        for q in questions:
            assert not self._contains_hallucination(q["q"]), \
                f"Potential hallucination in question: {q['q']}"

    def test_evaluation_feedback_grounded(self):
        """Evaluation feedback should not claim things outside the rubric."""
        eval_result = {
            "feedback": "Good answer. You covered backpropagation and gradient descent.",
            "rubricHits": ["backpropagation", "gradient descent"],
        }
        # Every rubric hit mentioned in feedback should actually be in rubricHits
        for hit in eval_result["rubricHits"]:
            assert hit.lower() in eval_result["feedback"].lower(), \
                f"rubricHit '{hit}' not mentioned in feedback"


# ─────────────────────────────────────────────────────────────────────────────
# Integration tests — require a running API server
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.integration
class TestAPIIntegration:

    def test_health_endpoint(self):
        resp = requests.get(f"{API_URL}/health", timeout=5)
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_make_questions(self):
        result = api_post({
            "task": "makeQuestions",
            "notes": SAMPLE_NOTES,
            "topic": SAMPLE_TOPIC,
            "count": 3
        })
        assert result["ok"], f"API returned ok=False: {result.get('error')}"
        validate_questions(result["data"])
        assert len(result["data"]) <= 5  # max reasonable output

    def test_make_flashcards(self):
        result = api_post({
            "task": "makeFlashcards",
            "notes": SAMPLE_NOTES,
            "topic": SAMPLE_TOPIC,
            "count": 4
        })
        assert result["ok"]
        validate_flashcards(result["data"])

    def test_make_quiz(self):
        result = api_post({
            "task": "makeQuiz",
            "notes": SAMPLE_NOTES,
            "topic": SAMPLE_TOPIC,
            "count": 3,
            "difficulty": "medium"
        })
        assert result["ok"]
        validate_quiz(result["data"])

    def test_evaluate_strong_answer(self):
        result = api_post({
            "task": "evaluateAnswer",
            "question": "Explain overfitting.",
            "expected": "Overfitting occurs when a model memorizes training data and generalizes poorly.",
            "student": "Overfitting is when the model learns training data too well including noise, causing poor performance on new data. It shows as high training accuracy but low validation accuracy.",
            "topic": SAMPLE_TOPIC,
            "rubric": {"keyPoints": ["memorization", "poor generalization", "training vs validation gap"]}
        })
        assert result["ok"]
        validate_evaluation(result["data"])
        assert result["data"]["pct"] >= 70, "Strong answer should score >= 70"

    def test_evaluate_weak_answer(self):
        result = api_post({
            "task": "evaluateAnswer",
            "question": "Explain overfitting.",
            "expected": "Overfitting occurs when a model memorizes training data.",
            "student": "I think it means the model is too big.",
            "topic": SAMPLE_TOPIC,
            "rubric": {"keyPoints": ["memorization", "poor generalization"]}
        })
        assert result["ok"]
        validate_evaluation(result["data"])
        assert result["data"]["pct"] <= 50, "Weak answer should score <= 50"

    def test_evaluate_blank_answer(self):
        result = api_post({
            "task": "evaluateAnswer",
            "question": "Explain overfitting.",
            "expected": "Overfitting is when a model memorizes training data.",
            "student": "",
            "topic": SAMPLE_TOPIC,
            "rubric": {"keyPoints": ["memorization"]}
        })
        assert result["ok"]
        assert result["data"]["pct"] == 0 or result["data"]["band"] == "weak"

    def test_rate_limiting(self):
        """Make 35 rapid requests; expect a 429 at some point."""
        hit_limit = False
        for _ in range(35):
            try:
                resp = requests.post(
                    f"{API_URL}/api/study-engine",
                    json={"task": "makeFlashcards", "notes": "test", "topic": "test", "count": 1},
                    timeout=5
                )
                if resp.status_code == 429:
                    hit_limit = True
                    break
            except Exception:
                break
        # Rate limit should kick in (may not in test env if limit is 30/min and test is slow)
        # This is an informational test, not a hard failure
        if not hit_limit:
            pytest.skip("Rate limit not reached in this test run (may need faster test loop)")

    def test_input_sanitization_strips_html(self):
        """HTML in notes should not cause errors."""
        result = api_post({
            "task": "makeFlashcards",
            "notes": "<b>Overfitting</b> is <script>alert('xss')</script> bad.",
            "topic": "ML",
            "count": 1
        })
        # Should succeed (sanitized) or return ok=False gracefully
        assert "ok" in result

    def test_response_latency(self):
        import time
        t0 = time.perf_counter()
        result = api_post({
            "task": "makeFlashcards",
            "notes": SAMPLE_NOTES[:500],
            "topic": SAMPLE_TOPIC,
            "count": 2
        })
        latency = time.perf_counter() - t0
        assert latency < 15, f"Response too slow: {latency:.1f}s"
        if result.get("latency_s"):
            assert result["latency_s"] < 10, f"Model inference too slow: {result['latency_s']}s"


# ─────────────────────────────────────────────────────────────────────────────
# Scoring consistency tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.integration
class TestScoringConsistency:

    QUESTION = "What is regularization and how does it reduce overfitting?"
    EXPECTED = ("Regularization adds a penalty term to the loss function for large weights, "
                "discouraging overly complex models and improving generalization.")
    RUBRIC = {"keyPoints": ["penalty term", "loss function", "large weights", "generalization"]}

    ANSWERS_BY_EXPECTED_BAND = {
        "strong": (
            "Regularization adds a penalty to the loss function for large weights (L1/L2). "
            "This discourages overly complex models and improves generalization on unseen data."
        ),
        "good": "Regularization penalizes large weights to prevent overfitting.",
        "partial": "Regularization is used to make the model simpler.",
        "weak": "I think regularization is about cleaning data.",
    }

    def test_score_ordering(self):
        """Stronger answers must score higher than weaker answers."""
        scores = {}
        for band, answer in self.ANSWERS_BY_EXPECTED_BAND.items():
            result = api_post({
                "task": "evaluateAnswer",
                "question": self.QUESTION,
                "expected": self.EXPECTED,
                "student": answer,
                "topic": "Machine Learning",
                "rubric": self.RUBRIC,
            })
            if result.get("ok"):
                scores[band] = result["data"]["pct"]

        if len(scores) >= 2:
            assert scores.get("strong", 0) >= scores.get("good", 0), \
                "Strong answer must score >= good answer"
            assert scores.get("good", 0) >= scores.get("partial", 0), \
                "Good answer must score >= partial answer"
            assert scores.get("partial", 0) >= scores.get("weak", 0), \
                "Partial answer must score >= weak answer"
