export const safeParse = (value, fallback) => {
  try {
    return JSON.parse(value || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
};

export const loadFromStorage = (key, fallback) => {
  if (typeof window === 'undefined') return fallback;
  return safeParse(window.localStorage.getItem(key), fallback);
};

export const saveToStorage = (key, data) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Storage may fail in private mode.
  }
};

export const userKey = (uid, key) => `sb3_${String(uid || 'guest').toLowerCase().replace(/[^a-z0-9_-]/g, '_')}_${key}`;

export const loadUserData = (uid) =>
  loadFromStorage(userKey(uid, 'data'), {
    notes: '',
    topic: '',
    cards: [],
    quiz: null,
    cardRatings: {},
    uploadedSrc: [],
    prefs: null,
    profile: null,
    savedNotes: [],
    selectedNoteId: ''
  });

export const saveUserData = (uid, data) => saveToStorage(userKey(uid, 'data'), data);

export const loadUserProgress = (uid) => loadFromStorage(userKey(uid, 'prog'), {});
export const saveUserProgress = (uid, data) => saveToStorage(userKey(uid, 'prog'), data);

const timeValue = (value) => {
  if (!value) return 0;
  if (typeof value === 'string') return Date.parse(value) || 0;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
};

const mergeNotes = (localNotes = [], cloudNotes = []) => {
  const byId = new Map();
  [...localNotes, ...cloudNotes].forEach((note) => {
    if (!note?.id) return;
    const existing = byId.get(note.id);
    if (!existing || timeValue(note.updatedAt) >= timeValue(existing.updatedAt)) byId.set(note.id, note);
  });
  return Array.from(byId.values()).sort((a, b) => timeValue(b.updatedAt) - timeValue(a.updatedAt));
};

export const mergeUserSnapshots = (localData = {}, cloudData = {}, localProgress = {}, cloudProgress = {}) => {
  const cloudApp = cloudData?.app || {};
  const localWins = timeValue(localData.updatedAt) > timeValue(cloudApp.updatedAt);
  const base = localWins ? { ...cloudApp, ...localData } : { ...localData, ...cloudApp };
  const savedNotes = mergeNotes(localData.savedNotes || [], cloudApp.savedNotes || []);
  const selectedNoteId = base.selectedNoteId || savedNotes[0]?.id || '';
  const profile = { ...(localData.profile || {}), ...(cloudApp.profile || {}), ...(cloudData.profile || {}) };
  return {
    app: { ...base, savedNotes, selectedNoteId, profile },
    progress: { ...(localProgress || {}), ...(cloudProgress || {}) }
  };
};
