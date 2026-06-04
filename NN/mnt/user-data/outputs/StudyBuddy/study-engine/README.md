# study-engine — Runtime Adapter

This directory contains all model-specific runtime code.
The rest of the app only imports from here through the adapter.

## Files

| File | Purpose |
|------|---------|
| `adapter.js` | Browser global `window.StudyBuddyEngine` — calls backend, falls back to local engine |
| `server.py` | FastAPI backend serving `POST /api/study-engine` |

## Integration

### Browser

```html
<!-- Load the adapter before any UI code -->
<script src="/study-engine/adapter.js"></script>

<!-- Your existing local fallback (optional but recommended) -->
<script src="/study-engine/studyEngine.js"></script>
```

```js
// Then use anywhere in your app:
const questions = await window.StudyBuddyEngine.makeQuestions({
  notes: userNotes,
  topic: "Machine Learning",
  count: 5
});

const evaluation = await window.StudyBuddyEngine.evaluateAnswer({
  question: "Explain overfitting.",
  expected: rubricAnswer,
  student: userAnswer,
  topic: "Machine Learning",
  rubric: { keyPoints: ["memorization", "generalization"] }
});
```

### Backend

```bash
# Set model path and start the server
MODEL_PATH=exported/study-engine-phi3/merged uvicorn study-engine.server:app --port 8000
```

## Replacing the engine

To swap this engine for a new one:

1. Replace this directory with your new implementation.
2. The new `adapter.js` must expose `window.StudyBuddyEngine` with the same four methods.
3. The new `server.py` must accept `POST /api/study-engine` with the same request/response shape.
4. No UI component needs to change.
