import { getConfig } from '../config/index.js';

const TYPES = {
  anthropic: 'anthropic',
  gemini: 'gemini'
};

function safeJsonParse(input) {
  try {
    return JSON.parse(input || '{}');
  } catch {
    return null;
  }
}

function geminiErrorMessage(body) {
  const parsed = safeJsonParse(body);
  const message = parsed?.error?.message || '';
  const status = parsed?.error?.status || '';
  const blockReason = parsed?.promptFeedback?.blockReason;
  const finishReason = parsed?.candidates?.find?.((candidate) => candidate.finishReason)?.finishReason;
  const retry = parsed?.error?.details?.find?.((item) => item['@type']?.includes('RetryInfo'))?.retryDelay;
  if (status === 'RESOURCE_EXHAUSTED' || /quota exceeded|exceeded your current quota/i.test(message)) {
    return `Gemini quota exhausted${retry ? `; retry after ${retry}` : ''}.`;
  }
  if (/API key not valid|invalid api key/i.test(message)) {
    return 'Gemini API key is invalid. Check GEMINI_API_KEY in .env.';
  }
  if (blockReason) return `Gemini blocked the prompt: ${blockReason}.`;
  if (finishReason && finishReason !== 'STOP') return `Gemini stopped before returning text: ${finishReason}.`;
  return message || 'Gemini proxy failed';
}

function extractGeminiText(body) {
  const parsed = safeJsonParse(body);
  const text = parsed?.candidates
    ?.flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || '')
    .join('')
    .trim();
  return { parsed, text };
}

async function callAnthropic({ prompt, system, tools }) {
  const { ANTHROPIC_API_KEY, ANTHROPIC_MODEL } = getConfig();
  const payload = {
    model: ANTHROPIC_MODEL,
    max_tokens: 1400,
    system: system || 'You are StudyBuddy AI, a helpful study assistant.',
    messages: [{ role: 'user', content: prompt }]
  };
  if (tools) payload.tools = tools;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  return { response, body: text };
}

async function callGemini({ prompt, system, model }) {
  const { GEMINI_API_KEY } = getConfig();
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 3000, temperature: 0.25 }
  });

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY
    },
    body
  });

  const text = await response.text();
  return { response, body: text };
}

export async function proxyClaude({ prompt, system, tools }) {
  const config = getConfig();
  if (!config.GEMINI_API_KEY && !config.ANTHROPIC_API_KEY) {
    return { status: 500, payload: { error: 'Server missing GEMINI_API_KEY or ANTHROPIC_API_KEY' } };
  }

  if (config.GEMINI_API_KEY) {
    const models = [config.GEMINI_MODEL, ...(config.GEMINI_FALLBACK_MODELS || [])].filter(Boolean);
    let lastError = null;

    for (const model of [...new Set(models)]) {
      const { response, body } = await callGemini({ prompt, system, model });
      const status = response.status;
      const problem = /high demand|overloaded|temporarily unavailable|try again later/i.test(body);
      if (status < 400 && !problem) {
        const { text } = extractGeminiText(body);
        if (text) return { status: 200, payload: { text } };
        lastError = { status: 502, body };
        continue;
      }
      lastError = { status, body };
    }

    return {
      status: lastError?.status || 502,
      payload: {
        error: geminiErrorMessage(lastError?.body),
        details: lastError?.body
      }
    };
  }

  const { response, body } = await callAnthropic({ prompt, system, tools });
  if (response.status >= 400) {
    return { status: response.status, payload: { error: safeJsonParse(body)?.error || 'Anthropic API error' } };
  }
  return { status: 200, payload: safeJsonParse(body) || { text: body } };
}
