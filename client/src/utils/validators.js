export const isValidTopic = (value) => {
  const clean = String(value || '').trim();
  if (clean.length < 3) return false;
  const alphaCount = (clean.match(/[a-z]/gi) || []).length;
  const alnumCount = (clean.match(/[a-z0-9]/gi) || []).length;
  return alphaCount >= 1 && alnumCount >= 3;
};

export const normalizeName = (value) =>
  String(value || 'guest').toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 80) || 'guest';
