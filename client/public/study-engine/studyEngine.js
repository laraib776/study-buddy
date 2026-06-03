(function () {
  const STOP = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'for', 'with', 'as', 'by',
    'this', 'that', 'it', 'its', 'be', 'from', 'at', 'your', 'you', 'i', 'my', 'we', 'our', 'about', 'into', 'can',
    'should', 'would', 'could', 'will', 'shall', 'has', 'have', 'had', 'they', 'their', 'them', 'there', 'then', 'than'
  ]);

  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const words = (value) => (normalize(value).toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) || [])
    .filter((word) => !STOP.has(word));
  const unique = (items) => [...new Set(items.filter(Boolean))];

  const splitSentences = (text) => normalize(text)
    .split(/(?=\b\d+\)\s+)|(?<=[.!?])\s+/)
    .map((item) => normalize(item))
    .filter((item) => item.length > 35);

  const cleanPrompt = (value) => normalize(value)
    .replace(/^TECHNICAL\s+INTERVIEW\s*[—-].*?\d+\)\s*/i, '')
    .replace(/\bAnswer\s*[:：][\s\S]*$/i, '')
    .replace(/[“"'].*$/, '')
    .replace(/\bStrategic\s+Answers?\b[\s\S]*$/i, '')
    .replace(/^\d+\)\s*/, '')
    .replace(/\?[\s\S]*$/, '?')
    .slice(0, 110)
    .trim();

  const termStats = (sentences) => {
    const freq = {};
    sentences.forEach((sentence) => {
      unique(words(sentence)).forEach((word) => {
        freq[word] = (freq[word] || 0) + 1;
      });
    });
    return freq;
  };

  const sentenceScore = (sentence, freq, topic) => {
    const tokens = words(sentence);
    const density = unique(tokens).reduce((total, token) => total + (freq[token] || 0), 0);
    const lengthFit = sentence.length > 65 && sentence.length < 260 ? 12 : 0;
    const topicHit = topic && sentence.toLowerCase().includes(String(topic).toLowerCase()) ? 8 : 0;
    const signal = /\b(because|therefore|important|core|key|method|process|model|system|architecture|result|impact)\b/i.test(sentence) ? 8 : 0;
    return density + lengthFit + topicHit + signal;
  };

  const rankedEvidence = (notes, topic = '') => {
    const sentences = splitSentences(notes);
    const fallback = normalize(notes).slice(0, 300);
    if (!sentences.length && fallback) return [{ prompt: cleanPrompt(fallback), answer: fallback, score: 1 }];
    const freq = termStats(sentences);
    return sentences
      .map((sentence) => ({ prompt: cleanPrompt(sentence), answer: sentence, score: sentenceScore(sentence, freq, topic) }))
      .filter((item) => item.prompt.length > 14 && item.answer.length > 35)
      .sort((a, b) => b.score - a.score);
  };

  const makeQuestions = ({ notes, topic = '', count = 5 }) => {
    const evidence = rankedEvidence(notes, topic).slice(0, Math.max(count, 5));
    const templates = [
      (prompt) => prompt.endsWith('?') ? prompt : `Explain ${prompt} in your own words.`,
      () => `Why is this important in ${topic || 'this topic'}? Use details from your notes.`,
      (prompt) => `Write a short answer about ${prompt}.`,
      (prompt) => `What would you remember for an exam about ${prompt}?`,
      (prompt) => `Summarize the main idea behind ${prompt}.`
    ];
    return evidence.slice(0, count).map((item, index) => ({
      q: templates[index % templates.length](item.prompt),
      ans: item.answer,
      evidence: item.answer,
      score: item.score
    }));
  };

  const makeFlashcards = ({ notes, topic = '', count = 12 }) => {
    const evidence = rankedEvidence(notes, topic).slice(0, count);
    return evidence.map((item, index) => {
      const terms = unique(words(item.answer)).slice(0, 3);
      const tag = terms[0] || topic || 'concept';
      return {
        front: item.prompt.endsWith('?') ? item.prompt : `What is the key idea behind ${item.prompt}?`,
        back: item.answer,
        tag,
        difficulty: index < 4 ? 'easy' : index < 9 ? 'medium' : 'hard'
      };
    });
  };

  const makeQuiz = ({ notes, topic = '', count = 5 }) => {
    const evidence = rankedEvidence(notes, topic).slice(0, Math.max(count, 5));
    const terms = unique(evidence.flatMap((item) => words(item.answer))).slice(0, 24);
    const distractors = (answer) => unique(terms.filter((term) => term !== answer)).slice(0, 3);
    const mcq = evidence.slice(0, count).map((item, index) => {
      const answer = unique(words(item.prompt))[0] || unique(words(item.answer))[0] || topic || 'concept';
      const opts = unique([answer, ...distractors(answer), topic || 'review']).slice(0, 4);
      while (opts.length < 4) opts.push(['context', 'method', 'result', 'system'][opts.length]);
      return {
        q: `Which term is most closely connected to: ${item.prompt}?`,
        opts,
        ans: 0,
        exp: item.answer
      };
    });
    const tf = evidence.slice(0, 4).map((item) => ({
      q: item.prompt.endsWith('.') ? item.prompt : `${item.prompt}.`,
      ans: true,
      exp: item.answer
    }));
    const short = evidence.slice(0, 4).map((item) => ({
      q: item.prompt.endsWith('?') ? item.prompt : `Explain ${item.prompt}.`,
      ans: item.answer
    }));
    const blanks = evidence.slice(0, 5).map((item) => {
      const answer = unique(words(item.prompt))[0] || unique(words(item.answer))[0] || topic || 'concept';
      const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const source = item.prompt || item.answer;
      const question = source.match(new RegExp(`\\b${escaped}\\b`, 'i'))
        ? source.replace(new RegExp(`\\b${escaped}\\b`, 'i'), '_____')
        : `_____ is closely connected to: ${source}`;
      return {
        q: question.endsWith('.') || question.endsWith('?') ? question : `${question}.`,
        ans: answer,
        exp: item.answer
      };
    });
    return { mcq, tf, short, blanks };
  };

  const evaluateBlank = ({ student, expected }) => {
    const clean = (value) => normalize(value).toLowerCase();
    const got = clean(student);
    const exp = clean(expected);
    const correct = !!got && (got === exp || got.includes(exp) || exp.includes(got));
    return {
      pct: correct ? 100 : 0,
      correct,
      feedback: correct ? 'Correct.' : `Expected: ${expected}`
    };
  };

  const evaluateAnswer = ({ student, expected, type = 'subjective' }) => {
    if (type === 'blank') return evaluateBlank({ student, expected });
    const expectedTerms = unique(words(expected));
    const got = new Set(words(student));
    const hits = expectedTerms.filter((term) => got.has(term));
    const coverage = expectedTerms.length ? hits.length / expectedTerms.length : 0;
    const length = words(student).length;
    const lengthScore = Math.min(1, length / Math.max(8, expectedTerms.length * 0.35));
    const pct = Math.min(100, Math.round((coverage * 72) + (lengthScore * 20) + (hits.length >= 3 ? 8 : 0)));
    return {
      pct,
      correct: pct >= 60,
      hits: hits.length,
      total: expectedTerms.length,
      feedback: pct >= 80 ? 'Strong answer.' : pct >= 60 ? 'Good start; add more exact details.' : 'Needs more detail from the notes.'
    };
  };

  window.StudyBuddyEngine = {
    version: 'local-semantic-ranker-1.0.0',
    makeQuestions,
    makeFlashcards,
    makeQuiz,
    evaluateAnswer,
    evaluateBlank
  };
})();
