/**
 * study-engine/adapter.js
 * -----------------------
 * Browser adapter for the StudyBuddy Neural Study Engine.
 * Sets window.StudyBuddyEngine with the four required methods.
 *
 * Priority:
 *   1. Backend neural model (POST /api/study-engine)
 *   2. Local rule-based fallback (studyEngine.js)
 *
 * Drop this file in: client/public/study-engine/adapter.js
 * Load it with: <script src="/study-engine/adapter.js"></script>
 * (Load BEFORE any UI code that calls window.StudyBuddyEngine)
 */

(function () {
  "use strict";

  // ── Config ────────────────────────────────────────────────────────────────
  const BACKEND_URL = "/api/study-engine"; // relative — same origin
  const REQUEST_TIMEOUT_MS = 12000;
  const MAX_INPUT_CHARS = 8000;

  // ── Utilities ─────────────────────────────────────────────────────────────

  function sanitize(text) {
    if (typeof text !== "string") return "";
    return text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, "")
      .trim()
      .slice(0, MAX_INPUT_CHARS);
  }

  function withTimeout(promise, ms) {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out")), ms)
    );
    return Promise.race([promise, timeout]);
  }

  // ── Backend call ──────────────────────────────────────────────────────────

  async function callBackend(payload) {
    const resp = await withTimeout(
      fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      REQUEST_TIMEOUT_MS
    );
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const json = await resp.json();
    if (!json.ok) {
      throw new Error(json.error || "Backend returned ok=false");
    }
    return json.data;
  }

  // ── Local fallback ────────────────────────────────────────────────────────
  // Delegates to window.StudyEngineLocal if the backend is unavailable.
  // This should be your existing studyEngine.js rule-based engine.

  function localMakeQuestions({ notes, topic, count }) {
    if (window.StudyEngineLocal && typeof window.StudyEngineLocal.makeQuestions === "function") {
      return window.StudyEngineLocal.makeQuestions({ notes, topic, count });
    }
    // Minimal stub so the app never completely crashes
    return [
      {
        q: `What is the main concept covered in these ${topic} notes?`,
        ans: "See your notes for the reference answer.",
        rubric: { keyPoints: [], mustMention: [], niceToHave: [] },
        difficulty: "medium",
        sourceSpan: "",
      },
    ];
  }

  function localEvaluateAnswer({ student, expected, question, topic, rubric }) {
    if (window.StudyEngineLocal && typeof window.StudyEngineLocal.evaluateAnswer === "function") {
      return window.StudyEngineLocal.evaluateAnswer({ student, expected, question, topic, rubric });
    }
    // Keyword overlap fallback
    const studentWords = new Set(student.toLowerCase().split(/\W+/).filter(Boolean));
    const keyPoints = (rubric && rubric.keyPoints) || [];
    const hits = keyPoints.filter((kp) =>
      kp
        .toLowerCase()
        .split(/\W+/)
        .some((w) => studentWords.has(w))
    );
    const pct = keyPoints.length > 0 ? Math.round((hits.length / keyPoints.length) * 100) : 50;
    const band = pct >= 80 ? "strong" : pct >= 60 ? "good" : pct >= 40 ? "partial" : "weak";
    return {
      pct,
      correct: pct >= 60,
      band,
      feedback:
        pct >= 80
          ? "Good answer. Keep it up."
          : pct >= 60
          ? "Decent answer. Add more detail on key points."
          : "Try to cover more of the key concepts.",
      strengths: hits.map((k) => k),
      missing: keyPoints.filter((k) => !hits.includes(k)),
      rubricHits: hits,
      rubricMisses: keyPoints.filter((k) => !hits.includes(k)),
    };
  }

  function localMakeFlashcards({ notes, topic, count }) {
    if (window.StudyEngineLocal && typeof window.StudyEngineLocal.makeFlashcards === "function") {
      return window.StudyEngineLocal.makeFlashcards({ notes, topic, count });
    }
    return [
      {
        front: `What is the main idea of the ${topic} notes?`,
        back: "Review your notes to find the answer.",
        tag: topic,
        difficulty: "medium",
        sourceSpan: "",
      },
    ];
  }

  function localMakeQuiz({ notes, topic, count, difficulty }) {
    if (window.StudyEngineLocal && typeof window.StudyEngineLocal.makeQuiz === "function") {
      return window.StudyEngineLocal.makeQuiz({ notes, topic, count, difficulty });
    }
    return {
      mcq: [
        {
          q: `Which statement best describes the core topic of these ${topic} notes?`,
          opts: ["See your notes", "Cannot determine", "Ask your teacher", "Review later"],
          ans: 0,
          exp: "Please review the notes for the correct answer.",
        },
      ],
      tf: [],
      blanks: [],
      short: [],
    };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  const StudyBuddyEngine = {
    /**
     * Generate subjective practice questions from notes.
     * @returns {Promise<Array>} Array of question objects
     */
    async makeQuestions({ notes, topic = "General", count = 5 }) {
      try {
        return await callBackend({
          task: "makeQuestions",
          notes: sanitize(notes),
          topic,
          count,
        });
      } catch (err) {
        console.warn("[StudyBuddyEngine] Backend unavailable, using fallback:", err.message);
        return localMakeQuestions({ notes, topic, count });
      }
    },

    /**
     * Evaluate a student's subjective answer.
     * @returns {Promise<Object>} Evaluation result with pct, band, feedback, etc.
     */
    async evaluateAnswer({ student, expected, question, topic = "General", rubric, type }) {
      try {
        return await callBackend({
          task: "evaluateAnswer",
          student: sanitize(student),
          expected,
          question,
          topic,
          rubric: rubric || null,
        });
      } catch (err) {
        console.warn("[StudyBuddyEngine] Backend unavailable, using fallback:", err.message);
        return localEvaluateAnswer({ student, expected, question, topic, rubric });
      }
    },

    /**
     * Generate flashcards from notes.
     * @returns {Promise<Array>} Array of flashcard objects
     */
    async makeFlashcards({ notes, topic = "General", count = 10 }) {
      try {
        return await callBackend({
          task: "makeFlashcards",
          notes: sanitize(notes),
          topic,
          count,
        });
      } catch (err) {
        console.warn("[StudyBuddyEngine] Backend unavailable, using fallback:", err.message);
        return localMakeFlashcards({ notes, topic, count });
      }
    },

    /**
     * Generate a quiz from notes.
     * @returns {Promise<Object>} Quiz object with mcq, tf, blanks, short arrays
     */
    async makeQuiz({ notes, topic = "General", count = 5, difficulty = "medium" }) {
      try {
        return await callBackend({
          task: "makeQuiz",
          notes: sanitize(notes),
          topic,
          count,
          difficulty,
        });
      } catch (err) {
        console.warn("[StudyBuddyEngine] Backend unavailable, using fallback:", err.message);
        return localMakeQuiz({ notes, topic, count, difficulty });
      }
    },

    /**
     * Evaluate a fill-in-the-blank answer (runs locally — no backend needed).
     * @returns {Object} Evaluation result
     */
    evaluateBlank({ student, expected, acceptedAnswers = [] }) {
      const normalize = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]/g, "");
      const studentNorm = normalize(student);
      const expectedNorm = normalize(expected);
      const allAccepted = [expectedNorm, ...acceptedAnswers.map(normalize)];

      // Exact / case-insensitive match
      if (allAccepted.includes(studentNorm)) {
        return {
          pct: 100,
          correct: true,
          feedback: "Correct.",
          expected,
          acceptedAnswers,
        };
      }

      // Typo tolerance: Levenshtein distance ≤ 2
      function levenshtein(a, b) {
        const m = a.length, n = b.length;
        const dp = Array.from({ length: m + 1 }, (_, i) =>
          Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
        );
        for (let i = 1; i <= m; i++)
          for (let j = 1; j <= n; j++)
            dp[i][j] =
              a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        return dp[m][n];
      }

      const closeEnough = allAccepted.some((a) => levenshtein(studentNorm, a) <= 2);
      if (closeEnough) {
        return {
          pct: 90,
          correct: true,
          feedback: `Close! The expected answer is "${expected}".`,
          expected,
          acceptedAnswers,
        };
      }

      return {
        pct: 0,
        correct: false,
        feedback: `Expected "${expected}". Review this concept and try again.`,
        expected,
      };
    },
  };

  // ── Attach to window ──────────────────────────────────────────────────────
  window.StudyBuddyEngine = StudyBuddyEngine;
  console.log("[StudyBuddyEngine] Adapter loaded. Backend:", BACKEND_URL);
})();
