# StudyBuddy Neural Study Engine Requirements

## Purpose

Build a removable neural study engine that can generate high-quality flashcards, quizzes, subjective practice questions, and evaluator-style feedback from a user-provided study document.

The model must improve on the current local `studyEngine.js` rule-based/semantic-ranker fallback, while keeping the same integration boundary so the app can swap engines easily.

Current integration target:

```js
window.StudyBuddyEngine
```

Required public API:

```js
makeQuestions({ notes, topic, count })
evaluateAnswer({ student, expected, question, topic, rubric })
makeFlashcards({ notes, topic, count })
makeQuiz({ notes, topic, count, difficulty })
```

The model implementation may run:

- in a backend service,
- in Firebase/Cloud Functions,
- locally through ONNX/WebGPU/WASM,
- or as a hybrid where generation is server-side and lightweight scoring is client-side.

## Core Tasks

### 1. Document Understanding

The model must parse a document and identify:

- main topics,
- subtopics,
- definitions,
- processes,
- cause/effect relationships,
- formulas,
- examples,
- comparisons,
- interview-style Q/A blocks,
- exam-worthy concepts,
- weak/ambiguous sections.

Input examples:

- pasted notes,
- lecture notes,
- PDF-extracted text,
- DOCX text,
- PPTX extracted text,
- interview prep documents,
- textbook excerpts,
- article summaries.

### 2. Subjective Practice Question Generation

The model must generate questions that are:

- clean and short,
- exam/interview appropriate,
- focused on important concepts,
- not copied with full answer paragraphs,
- not exposing the model answer inside the question,
- varied in cognitive level.

Question types:

- explain in your own words,
- compare and contrast,
- why/impact questions,
- process walkthrough,
- scenario/application,
- short exam answer,
- interview answer,
- misconception check.

Output shape:

```json
[
  {
    "q": "Tell us about yourself technically.",
    "ans": "Reference answer or rubric evidence hidden from student.",
    "rubric": {
      "keyPoints": ["AI/ML engineering", "computer vision", "product development"],
      "mustMention": ["project/deployment experience"],
      "niceToHave": ["FastAPI", "React", "model optimization"]
    },
    "difficulty": "medium",
    "sourceSpan": "short source evidence or offset metadata"
  }
]
```

### 3. Subjective Answer Evaluation

The evaluator must behave like a fair examiner.

It should score:

- correctness,
- coverage of key points,
- clarity,
- specificity,
- use of evidence from notes,
- completeness,
- concision,
- factual consistency,
- hallucination/unsupported claims,
- communication quality.

It should behave like a real examiner:

- reward correct wording even if it differs from the reference answer,
- detect vague answers that sound fluent but miss the point,
- penalize unsupported claims,
- identify missing key concepts,
- give concise improvement guidance,
- avoid leaking the full reference answer unless the UI explicitly requests it.

It should return:

```json
{
  "pct": 78,
  "correct": true,
  "band": "good",
  "feedback": "Good answer. Add deployment detail and one concrete project example.",
  "strengths": ["mentions AI/ML focus", "mentions computer vision"],
  "missing": ["deployment stack", "specific project outcome"],
  "rubricHits": ["AI/ML engineering", "computer vision"],
  "rubricMisses": ["FastAPI deployment"],
  "suggestedAnswer": "Optional; only show if UI explicitly asks for it."
}
```

Important: default chat feedback must not reveal full model answers after every attempt unless the UI asks for a review/model answer mode.

### 4. Flashcard Generation

The model must create flashcards that are:

- atomic,
- clear,
- answerable,
- not too long,
- based on high-value document ideas,
- tagged by topic,
- assigned difficulty.

Output shape:

```json
[
  {
    "front": "What is transfer learning?",
    "back": "Transfer learning reuses a model trained on one task as a starting point for another related task.",
    "tag": "machine learning",
    "difficulty": "medium",
    "sourceSpan": "..."
  }
]
```

### 5. Quiz Generation

The model must generate:

- MCQs,
- true/false,
- fill-in-the-blanks,
- short-answer questions,
- explanations,
- difficulty-aware questions.

Output shape:

```json
{
  "mcq": [
    {
      "q": "Which option best describes overfitting?",
      "opts": ["High train performance but poor generalization", "...", "...", "..."],
      "ans": 0,
      "exp": "Overfitting occurs when a model memorizes training data and performs poorly on unseen data."
    }
  ],
  "tf": [
    {
      "q": "Overfitting usually improves generalization.",
      "ans": false,
      "exp": "It usually hurts generalization."
    }
  ],
  "blanks": [
    {
      "q": "_____ is used to reduce overfitting.",
      "ans": "Regularization",
      "exp": "Regularization penalizes overly complex models."
    }
  ],
  "short": [
    {
      "q": "Explain overfitting in one paragraph.",
      "ans": "A model overfits when..."
    }
  ]
}
```

### 6. Fill-In-The-Blanks Evaluation

The model/runtime must generate and evaluate blanks too.

Blank evaluation should support:

- exact match,
- case-insensitive match,
- accepted synonyms,
- minor typo tolerance where possible,
- concise feedback after submission.

Output shape:

```json
{
  "pct": 100,
  "correct": true,
  "feedback": "Correct.",
  "expected": "Regularization",
  "acceptedAnswers": ["regularization", "regularisation"]
}
```

For wrong answers:

```json
{
  "pct": 0,
  "correct": false,
  "feedback": "Expected regularization. Review how it reduces overfitting.",
  "expected": "Regularization"
}
```

## Dataset Requirements

You need a labeled dataset. The model cannot be reliably trained without examples.

### Required Dataset Types

#### A. Document-to-Questions Dataset

Each example should contain:

```json
{
  "document": "Full notes/document text",
  "topic": "Machine Learning",
  "highValueSpans": ["Important extracted sentence/paragraph"],
  "subjectiveQuestions": [
    {
      "q": "Explain overfitting.",
      "answer": "Reference answer",
      "rubric": {
        "keyPoints": ["memorization", "poor generalization", "training vs validation gap"]
      },
      "difficulty": "medium"
    }
  ],
  "flashcards": [],
  "quiz": {}
}
```

#### B. Answer Evaluation Dataset

Each example should contain:

```json
{
  "question": "Explain overfitting.",
  "referenceAnswer": "Overfitting is...",
  "rubric": {
    "keyPoints": ["memorization", "poor generalization"]
  },
  "studentAnswer": "It is when a model learns too much from training data and fails on new data.",
  "score": 85,
  "feedback": "Good answer; mention validation performance."
}
```

Include answers across score bands:

- 0-20: irrelevant/blank,
- 20-40: vague,
- 40-60: partially correct,
- 60-80: good but incomplete,
- 80-100: strong.

#### C. Negative/Robustness Dataset

Include:

- copied answers,
- hallucinated facts,
- overly short answers,
- correct but differently worded answers,
- answers with spelling/grammar mistakes,
- answers in mixed English/Roman Urdu if your users need that,
- documents with bad extraction artifacts,
- interview notes where questions and answers are mixed together.

### Dataset Size Targets

Minimum prototype:

- 500 documents,
- 5,000 generated question examples,
- 10,000 answer-evaluation examples.

Better production target:

- 5,000+ documents,
- 50,000+ question/flashcard/quiz examples,
- 100,000+ answer-evaluation examples.

If you cannot collect that much data, use a strong hosted LLM or fine-tune a small model carefully instead of claiming a fully trained evaluator.

## Model Architecture Options

### Option A: Hosted LLM + Rubric Engine

Best quality, easiest to build.

Use Gemini/OpenAI/Anthropic to generate questions and evaluate answers. Keep a deterministic rubric checker as backup.

Pros:

- best quality,
- no local training required,
- easy updates.

Cons:

- API cost,
- network dependency,
- needs backend secret management.

### Option B: Fine-Tuned Small Language Model

Fine-tune an instruction model such as:

- Llama 3.x 8B,
- Mistral 7B,
- Phi family,
- Qwen small/medium instruct model.

Use LoRA/QLoRA.

Pros:

- controllable,
- can run server-side,
- can specialize to your educational format.

Cons:

- needs dataset,
- needs GPU training,
- needs evaluation,
- deployment is heavier.

### Option C: Hybrid Neural Ranker + Template Generator

Train or use embeddings to rank important document spans, then generate cards/questions through templates.

Pros:

- cheaper,
- less hallucination,
- can work offline,
- easier to evaluate.

Cons:

- less fluent than an LLM,
- answer evaluation is weaker unless paired with a cross-encoder or LLM.

### Option D: Browser Local ONNX/WebGPU Model

Use a small embedding model or classifier in-browser.

Pros:

- private,
- no API,
- works offline.

Cons:

- model size/performance limits,
- harder to generate natural questions,
- browser compatibility issues.

## Recommended First Production Architecture

Use a hybrid:

1. Backend LLM for generation/evaluation when available.
2. Local `study-engine` fallback for offline/no-cost behavior.
3. Same interface for both.

Flow:

```text
Client
  -> StudyEngine adapter
    -> backend neural model / LLM if available
    -> local fallback if unavailable
```

## Training Pipeline Requirements

Create a separate training repo or directory:

```text
model-training/
  data/
    raw/
    processed/
    eval/
  scripts/
    prepare_data.py
    train_lora.py
    evaluate.py
    export_model.py
  configs/
    generation.yaml
    evaluation.yaml
  notebooks/
  README.md
```

### Data Preparation

Steps:

1. Clean text extraction artifacts.
2. Split documents into chunks.
3. Label high-value spans.
4. Create training examples.
5. Create validation/test split by document, not by row.
6. Remove duplicates.
7. Check leakage between train and test.

### Training

For generation:

- supervised fine-tuning on document -> JSON output.
- enforce JSON schema.
- train on multiple tasks with task prefix:
  - `TASK=subjective_questions`
  - `TASK=flashcards`
  - `TASK=quiz`

For answer evaluation:

- either fine-tune model to return rubric JSON,
- or train a regression/classification scorer with text pairs:
  - question,
  - reference answer,
  - rubric,
  - student answer.

### Validation

Measure:

- JSON validity rate,
- rubric coverage,
- hallucination rate,
- question quality human rating,
- answer-score correlation with human graders,
- exact/semantic key point recall,
- latency,
- cost per request,
- failure rate.

Target metrics:

- JSON valid: > 98%
- human acceptable questions: > 85%
- answer score correlation with human graders: > 0.75
- hallucinated unsupported facts: < 5%
- p95 latency: < 5 seconds for backend; < 1.5 seconds for local scoring.

## Integration Contract

The app should call only an adapter, not model internals.

Browser global option:

```js
window.StudyBuddyEngine.makeQuestions({ notes, topic, count })
window.StudyBuddyEngine.evaluateAnswer({ student, expected, question, topic, rubric })
window.StudyBuddyEngine.makeFlashcards({ notes, topic, count })
window.StudyBuddyEngine.makeQuiz({ notes, topic, count, difficulty })
```

Backend endpoint option:

```http
POST /api/study-engine
Content-Type: application/json
```

Request:

```json
{
  "task": "makeQuiz",
  "notes": "...",
  "topic": "...",
  "count": 5,
  "difficulty": "medium"
}
```

Response:

```json
{
  "ok": true,
  "data": {}
}
```

Failure response:

```json
{
  "ok": false,
  "error": "Model unavailable",
  "fallbackRecommended": true
}
```

## Security and Privacy

Requirements:

- Never expose API keys in frontend code.
- User documents may contain private study material; treat them as private data.
- If using server model, use HTTPS.
- Do not log full user documents in production.
- Add rate limits.
- Validate input length.
- Strip scripts/HTML from uploaded text.
- Keep Firebase rules user-scoped.

## Overfitting and Underfitting Controls

To avoid overfitting:

- split train/test by document source,
- deduplicate documents,
- test on unseen subjects,
- evaluate on messy extracted text,
- use early stopping,
- avoid training only on one subject type.

To avoid underfitting:

- ensure enough examples per task,
- include rubrics and explanations,
- train/evaluate on hard examples,
- use a strong enough base model,
- use curriculum from easy to hard tasks.

## Deployment Requirements

### Backend Deployment

If server-side:

- package model separately,
- expose `/api/study-engine`,
- keep model warm if possible,
- add request timeouts,
- add fallback to local engine,
- add monitoring.

### Browser Deployment

If local:

- keep model small,
- lazy-load it,
- show loading state,
- support browsers without WebGPU,
- use ONNX/WASM fallback if needed,
- cache model assets.

## Removability Requirement

All model-specific code must stay inside:

```text
client/public/study-engine/
```

or a clearly named backend equivalent:

```text
server/src/study-engine/
```

The app should only depend on a small adapter. Do not scatter model logic through UI components.

## Future AI Prompt To Build The Model

Use this prompt later with an AI coding/model-building assistant:

```text
You are building a production-ready neural study engine for an educational app named StudyBuddy.

Goal:
Create a modular model system that generates subjective practice questions, flashcards, quizzes, and evaluator-style scoring from user-provided study notes. The system must be replaceable/removable and integrated through a small adapter.

Current app integration contract:
- Browser global: window.StudyBuddyEngine
- Required methods:
  1. makeQuestions({ notes, topic, count })
  2. evaluateAnswer({ student, expected, question, topic, rubric, type })
  3. makeFlashcards({ notes, topic, count })
  4. makeQuiz({ notes, topic, count, difficulty })

Required output schemas:
makeQuestions returns:
[
  {
    "q": "Clean student-facing question",
    "ans": "Hidden reference answer/evidence",
    "rubric": {
      "keyPoints": [],
      "mustMention": [],
      "niceToHave": []
    },
    "difficulty": "easy|medium|hard",
    "sourceSpan": "optional"
  }
]

evaluateAnswer returns:
{
  "pct": 0-100,
  "correct": true/false,
  "band": "weak|partial|good|strong",
  "feedback": "Short examiner feedback without revealing the full model answer by default",
  "strengths": [],
  "missing": [],
  "rubricHits": [],
  "rubricMisses": [],
  "suggestedAnswer": "optional"
}

makeFlashcards returns:
[
  {
    "front": "Question",
    "back": "Answer",
    "tag": "topic tag",
    "difficulty": "easy|medium|hard",
    "sourceSpan": "optional"
  }
]

makeQuiz returns:
{
  "mcq": [{"q":"","opts":["","","",""],"ans":0,"exp":""}],
  "tf": [{"q":"","ans":true,"exp":""}],
  "blanks": [{"q":"_____ is the missing term.","ans":"","exp":""}],
  "short": [{"q":"","ans":""}]
}

Requirements:
- Do not expose full reference answers in normal examiner feedback.
- Generate clean questions, not long copied answer paragraphs.
- Generate fill-in-the-blanks and evaluate blank answers.
- Evaluate subjective answers like a real examiner using rubric coverage, correctness, clarity, and unsupported-claim checks.
- Prefer important, high-impact document concepts.
- Support messy extracted text from PDFs/DOCX/PPTX.
- Include local fallback behavior.
- Keep all model-specific files isolated in a study-engine directory.
- Provide training scripts, data schema, evaluation scripts, and deployment adapter.
- Include tests for JSON validity, hallucination checks, scoring consistency, and integration.

Training:
- Use supervised fine-tuning or a hybrid ranker+LLM architecture.
- Prepare datasets for document-to-questions, document-to-flashcards, document-to-quiz, and answer evaluation.
- Split train/validation/test by document, not random row.
- Include negative examples and short/partial/hallucinated answers.
- Evaluate correlation with human grader scores.

Deliverables:
1. model-training/ directory with scripts and configs.
2. study-engine runtime adapter matching the current API.
3. backend endpoint option /api/study-engine.
4. browser fallback adapter.
5. README with setup, training, evaluation, deployment, and replacement instructions.
6. tests and sample dataset.

Do not claim the model is trained unless the training script has run and evaluation metrics are produced.
```

## Acceptance Checklist

- [ ] Generates clean subjective questions.
- [ ] Does not reveal answers inside questions.
- [ ] Evaluates answers with rubric-like feedback.
- [ ] Generates valid flashcards.
- [ ] Generates valid quizzes.
- [ ] Handles messy extracted documents.
- [ ] Has train/validation/test split.
- [ ] Reports evaluation metrics.
- [ ] Has clear integration adapter.
- [ ] Can be removed or replaced without rewriting UI.
- [ ] Does not expose secrets.
- [ ] Has fallback behavior when the model fails.
