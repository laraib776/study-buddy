const getApiBase = () => {
  if (import.meta.env.VITE_STUDYBUDDY_API_BASE) return import.meta.env.VITE_STUDYBUDDY_API_BASE;
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:8787`;
  }
  return '';
};

export async function callClaude(prompt, system = 'You are StudyBuddy AI, a helpful study assistant.', tools = null) {
  const apiBase = getApiBase();
  const url = apiBase ? `${apiBase}/api/claude` : '/api/claude';
  let response = null;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, system, tools })
    });
  } catch {
    throw new Error(`Could not reach StudyBuddy AI backend at ${url}`);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload.details === 'string' ? `: ${payload.details}` : '';
    throw new Error(`${payload.error || 'AI request failed'}${detail}`);
  }
  const text = (
    payload.text ||
    payload.data?.text ||
    payload.content?.map((item) => item.text || '').join('') ||
    ''
  ).trim();
  if (!text) throw new Error('Empty AI response. Check your API key/model and try again.');
  return text;
}
