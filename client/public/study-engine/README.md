# Study Engine

This directory is intentionally removable. The app only depends on the browser global:

```js
window.StudyBuddyEngine
```

Current implementation:

- `makeQuestions({ notes, topic, count })`
- `evaluateAnswer({ student, expected })`
- `makeFlashcards({ notes, topic, count })`
- `makeQuiz({ notes, topic, count })`

It is a local semantic ranker, not a trained neural network. A real neural model needs a labeled dataset, training/validation split, repeatable training script, and exported browser/server runtime weights.

To replace it later, keep the same function names and return shapes. The rest of the app can stay mostly unchanged.

Recommended future upgrade:

1. Build a dataset of notes, high-quality questions, flashcards, quizzes, student answers, and evaluator scores.
2. Fine-tune or distill a small instruction model outside this app.
3. Export it to a server endpoint or a browser-compatible runtime such as ONNX/WebGPU.
4. Replace `studyEngine.js` with an adapter that calls that model.
