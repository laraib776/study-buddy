export function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.max(0, Math.floor(seconds % 60));
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function todayKey() {
  return dateKey();
}

export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseJsonRelaxed(value) {
  const clean = String(value || '')
    .replace(/```json\n?/gi, '')
    .replace(/```\n?/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
  const candidates = [clean];
  const firstArr = clean.indexOf('[');
  const firstObj = clean.indexOf('{');
  const starts = [firstArr, firstObj].filter((idx) => idx >= 0).sort((a, b) => a - b);
  for (const start of starts) {
    const open = clean[start];
    const close = open === '[' ? ']' : '}';
    const end = clean.lastIndexOf(close);
    if (end > start) candidates.push(clean.slice(start, end + 1));
  }
  for (const candidate of candidates) {
    const repairs = [
      candidate,
      candidate.replace(/,\s*([}\]])/g, '$1'),
      candidate.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":').replace(/,\s*([}\]])/g, '$1')
    ];
    for (const text of repairs) {
      try {
        return JSON.parse(text);
      } catch {
        // Try the next reasonable repair.
      }
    }
  }
  return null;
}

export function normalizeQuizPayload(q) {
  if (!q || typeof q !== 'object') return null;
  const source = q.quiz || q.questions || q.data || q;
  const normalizeAnswerIndex = (answer, options) => {
    if (Number.isInteger(answer) && answer >= 0 && answer < options.length) return answer;
    const text = String(answer ?? '').trim();
    const letterIndex = /^[A-D]$/i.test(text) ? text.toUpperCase().charCodeAt(0) - 65 : -1;
    if (letterIndex >= 0 && letterIndex < options.length) return letterIndex;
    const exact = options.findIndex((option) => String(option).trim().toLowerCase() === text.toLowerCase());
    return exact >= 0 ? exact : 0;
  };
  const mcq = Array.isArray(source.mcq)
    ? source.mcq
        .map((item) => ({ ...item, opts: item.opts || item.options || item.choices }))
        .filter((item) => item && Array.isArray(item.opts) && item.opts.length >= 2)
        .map((item) => ({
          q: String(item.q || item.question || 'Question'),
          opts: item.opts.slice(0, 4).map((opt) => String(opt)),
          ans: normalizeAnswerIndex(item.ans ?? item.answer ?? item.correct ?? item.correctAnswer, item.opts),
          exp: String(item.exp || item.explanation || '')
        }))
    : [];
  const tf = Array.isArray(source.tf || source.trueFalse)
    ? (source.tf || source.trueFalse).map((item) => ({
        q: String(item?.q || item?.question || item?.statement || 'Statement'),
        ans: typeof (item?.ans ?? item?.answer) === 'string' ? /true|yes|correct/i.test(item.ans ?? item.answer) : !!(item?.ans ?? item?.answer),
        exp: String(item?.exp || item?.explanation || '')
      }))
    : [];
  const short = Array.isArray(source.short || source.shortAnswer)
    ? (source.short || source.shortAnswer).map((item) => ({
        q: String(item?.q || item?.question || 'Question'),
        ans: String(item?.ans || item?.answer || '')
      }))
    : [];
  const blanks = Array.isArray(source.blanks || source.fillBlanks || source.fillInTheBlank)
    ? (source.blanks || source.fillBlanks || source.fillInTheBlank).map((item) => ({
        q: String(item?.q || item?.question || 'Fill in the blank'),
        ans: String(item?.ans || item?.answer || ''),
        exp: String(item?.exp || item?.explanation || '')
      }))
    : [];
  return mcq.length || tf.length || short.length || blanks.length ? { mcq, tf, short, blanks } : null;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
