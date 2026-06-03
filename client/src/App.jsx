import { useState, useEffect, useRef } from 'react';
import HomePage from './pages/HomePage.jsx';
import NotesPage from './pages/NotesPage.jsx';
import StudyPage from './pages/StudyPage.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import FocusPage from './pages/FocusPage.jsx';
import BreakPage from './pages/BreakPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SplashPage from './pages/SplashPage.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import Sidebar from './components/Sidebar.jsx';
import BottomNav from './components/BottomNav.jsx';
import GuideCompanion from './components/GuideCompanion.jsx';
import GhostCompanion from './components/GhostCompanion.jsx';
import Toast from './components/Toast.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';
import SafeImage from './components/SafeImage.jsx';
import { assets, defaultPrefs, defaultProfile, themeCards, DECO_PALETTE, iconPaths, splashMsgs, guideLines, guideActions, companionModes, MAX_SAVED_DOCS } from './utils/constants.js';
import { formatDuration, parseJsonRelaxed, normalizeQuizPayload, todayKey, clamp } from './utils/format.js';
import { loadUserData, saveUserData, loadUserProgress, saveUserProgress, mergeUserSnapshots } from './utils/storage.js';
import { isValidTopic, normalizeName } from './utils/validators.js';
import { callClaude } from './services/api.js';
import { initFirebase, loginUser, registerUser, logoutUser, saveUserProfile, saveUserCloudData, loadUserCloudData, listenUserCloudData, callStudyBuddyFunction } from './services/firebase.js';
import { extractFile } from './services/fileExtractor.js';
import './styles/layout.css';
import './styles/components.css';
import './styles/pages.css';

const safeId = (value) => normalizeName(value || 'guest');
const getActiveUserId = () =>
  safeId(window.localStorage.getItem('sb3_uid') || window.localStorage.getItem('sb3_email') || window.localStorage.getItem('sb3_user') || 'guest');

const getFirebaseConfigReady = () => import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_PROJECT_ID;

const mergePrefs = (prefs) => ({
  ...defaultPrefs,
  ...prefs,
  icons: { ...defaultPrefs.icons, ...(prefs?.icons || {}) },
  decorations: prefs?.decorations || []
});

const mergeProfile = (profile) => ({
  ...defaultProfile,
  ...(profile || {}),
  displayName: profile?.displayName || ''
});

const getApiBasePath = () => {
  if (import.meta.env.VITE_STUDYBUDDY_API_BASE) return import.meta.env.VITE_STUDYBUDDY_API_BASE;
  return import.meta.env.DEV ? 'http://localhost:8787' : '';
};

const normalizeSavedId = (name) => normalizeName(name);

function App() {
  const initialUid = getActiveUserId();
  const initialData = loadUserData(initialUid);

  const [entryPhase, setEntryPhase] = useState('splash');
  const [userId, setUserId] = useState(initialUid);
  const [loginName, setLoginName] = useState(() => window.localStorage.getItem('sb3_user') || '');
  const [loginEmail, setLoginEmail] = useState(() => window.localStorage.getItem('sb3_email') || '');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginSignup, setLoginSignup] = useState(false);
  const [loginRemember, setLoginRemember] = useState(() => !!window.localStorage.getItem('sb3_email'));
  const [splashMsg, setSplashMsg] = useState(splashMsgs[0]);
  const [screen, setScreen] = useState('home');
  const [studyTab, setStudyTab] = useState('cards');
  const [notes, setNotes] = useState('');
  const [topic, setTopic] = useState(initialData.topic || '');
  const [savedNotes, setSavedNotes] = useState(initialData.savedNotes || []);
  const [selectedNoteId, setSelectedNoteId] = useState(initialData.selectedNoteId || '');
  const [diff, setDiff] = useState('medium');
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState('');
  const [toast, setToast] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [uploadedSrc, setUploadedSrc] = useState(initialData.uploadedSrc || []);
  const [urlIn, setUrlIn] = useState('');
  const [guideLine, setGuideLine] = useState('Hi, I am your study buddy. Pick a page and I will help you settle in.');
  const [guideState, setGuideState] = useState({ action: 'wave', talk: true });
  const [prefs, setPrefs] = useState(mergePrefs(initialData.prefs || {}));
  const [settingsDraft, setSettingsDraft] = useState(null);
  const [settingsTab, setSettingsTab] = useState('theme');
  const [profile, setProfile] = useState(mergeProfile({ ...(initialData.profile || {}), displayName: window.localStorage.getItem('sb3_user') || initialData.profile?.displayName || '' }));
  const [profileDraft, setProfileDraft] = useState(mergeProfile(initialData.profile || {}));
  const [displayNameDraft, setDisplayNameDraft] = useState(profile.displayName || '');
  const [decoSize, setDecoSize] = useState(54);
  const [authStatus, setAuthStatus] = useState(getFirebaseConfigReady() ? 'Firebase sync ready' : 'Firebase config required for real login');

  const [cards, setCards] = useState(initialData.cards || []);
  const [cardIdx, setCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [cardRatings, setCardRatings] = useState(initialData.cardRatings || {});
  const [quiz, setQuiz] = useState(initialData.quiz || null);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [qtab, setQtab] = useState('mcq');
  const [score, setScore] = useState(null);
  const [viva, setViva] = useState([]);
  const [vivaIn, setVivaIn] = useState('');
  const [vivaLoading, setVivaLoading] = useState(false);
  const [practiceQs, setPracticeQs] = useState([]);
  const [practiceIdx, setPracticeIdx] = useState(0);
  const [practiceDone, setPracticeDone] = useState(false);
  const [practiceResults, setPracticeResults] = useState([]);
  const [speechOn, setSpeechOn] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition));
  const [speechStatus, setSpeechStatus] = useState('');

  const [focusSec, setFocusSec] = useState(0);
  const [focusOn, setFocusOn] = useState(false);
  const [breakType, setBreakType] = useState(null);
  const [breakSec, setBreakSec] = useState(0);

  const [progress, setProgress] = useState(loadUserProgress(initialUid));
  const [calDate, setCalDate] = useState(new Date());
  const [selDay, setSelDay] = useState(null);
  const [calNoteDate, setCalNoteDate] = useState(todayKey());
  const [calNoteText, setCalNoteText] = useState('');
  const [dailyTip, setDailyTip] = useState('');
  const [ghostBurst, setGhostBurst] = useState(false);
  const [ghostHidden, setGhostHidden] = useState(false);
  const [ghostDir, setGhostDir] = useState(-1);
  const [companionsDocked, setCompanionsDocked] = useState(false);

  const timerRef = useRef(null);
  const breakRef = useRef(null);
  const speechRef = useRef(null);
  const speechManualStopRef = useRef(false);
  const guideInitRef = useRef(false);
  const loadedUserRef = useRef('');
  const userStateReadyRef = useRef(false);
  const cloudSaveTimerRef = useRef(null);
  const cloudUnsubRef = useRef(null);
  const appStateVersionRef = useRef(0);
  const speechFinalRef = useRef('');
  const speechInterimRef = useRef('');
  const speechBaseRef = useRef('');
  const studyScrollLockRef = useRef(false);
  const studyScrollRef = useRef(null);
  const studyScrollTopRef = useRef(0);
  const studyScrollTimersRef = useRef([]);
  const ghostRef = useRef({ x: 0, dir: -1, state: 'moving', initialized: false, last: 0, hovered: false });
  const ghostElRef = useRef(null);

  const today = todayKey();
  const todayData = progress[today] || { studyMin: 0, cards: 0, quizScores: [], topics: [], completed: false };
  const avgQ = todayData.quizScores?.length ? Math.round(todayData.quizScores.reduce((total, value) => total + value, 0) / todayData.quizScores.length) : 0;

  useEffect(() => {
    if (entryPhase === 'splash') {
      const interval = setInterval(() => {
        setSplashMsg((prev) => {
          const index = splashMsgs.indexOf(prev);
          return splashMsgs[(index + 1) % splashMsgs.length];
        });
      }, 520);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [entryPhase]);

  useEffect(() => {
    if (entryPhase !== 'splash' && entryPhase !== 'splashAfterLogin') return undefined;
    const id = setTimeout(() => {
      if (entryPhase === 'splashAfterLogin') {
        setEntryPhase('app');
        return;
      }
      setEntryPhase(window.localStorage.getItem('sb3_auth_ok') === '1' && getFirebaseConfigReady() ? 'app' : 'login');
    }, 1800);
    return () => clearTimeout(id);
  }, [entryPhase]);

  useEffect(() => {
    if (entryPhase !== 'app') return undefined;
    if (loadedUserRef.current === userId) return undefined;
    loadedUserRef.current = userId;
    userStateReadyRef.current = false;
    loadUserState(userId);
    return undefined;
  }, [entryPhase, userId]);

  useEffect(() => {
    if (entryPhase !== 'app') return undefined;
    const fb = initFirebase();
    if (!fb.auth) {
      window.localStorage.removeItem('sb3_auth_ok');
      setEntryPhase('login');
      return undefined;
    }
    const unsubscribe = fb.auth.onAuthStateChanged((user) => {
      if (!user || !user.emailVerified) {
        window.localStorage.removeItem('sb3_auth_ok');
        setAuthStatus('Verified Firebase login required');
        setEntryPhase('login');
        return;
      }
      setUserId(user.uid);
      setLoginName(user.displayName || user.email || 'Student');
    });
    return () => unsubscribe();
  }, [entryPhase]);

  useEffect(() => {
    if (entryPhase !== 'app') return undefined;
    const payload = currentAppPayload();
    saveUserData(userId, payload);
    saveUserProgress(userId, progress);
    if (userStateReadyRef.current && userId !== 'guest') {
      window.clearTimeout(cloudSaveTimerRef.current);
      cloudSaveTimerRef.current = window.setTimeout(() => {
        saveCloudNow(payload, progress).catch(() => {
          // Local cache is still the offline fallback if cloud sync fails.
        });
      }, 900);
    }
    return () => window.clearTimeout(cloudSaveTimerRef.current);
  }, [userId, notes, topic, savedNotes, selectedNoteId, cards, quiz, cardRatings, uploadedSrc, prefs, profile, progress, entryPhase]);

  useEffect(() => {
    if (entryPhase !== 'app' || userId === 'guest') return undefined;
    if (cloudUnsubRef.current) cloudUnsubRef.current();
    cloudUnsubRef.current = listenUserCloudData(userId, (cloud) => {
      if (!userStateReadyRef.current) return;
      const localData = loadUserData(userId);
      const localProgress = loadUserProgress(userId);
      const { app: merged, progress: mergedProgress } = mergeUserSnapshots(localData, cloud || {}, localProgress, cloud?.progress || {});
      setTopic(merged.topic || '');
      setSavedNotes(merged.savedNotes || []);
      setSelectedNoteId(merged.selectedNoteId || '');
      setCards(merged.cards || []);
      setQuiz(merged.quiz || null);
      setCardRatings(merged.cardRatings || {});
      setUploadedSrc(merged.uploadedSrc || []);
      setPrefs(mergePrefs(merged.prefs || {}));
      setProfile(mergeProfile({ ...(merged.profile || {}), displayName: merged.profile?.displayName || window.localStorage.getItem('sb3_user') || loginName || '' }));
      setProgress(mergedProgress || {});
      saveUserData(userId, merged);
      saveUserProgress(userId, mergedProgress || {});
      setAuthStatus('Firebase sync active');
    }, (error) => setAuthStatus(`Firebase sync failed: ${error.message || error}`));
    return () => {
      if (cloudUnsubRef.current) cloudUnsubRef.current();
      cloudUnsubRef.current = null;
    };
  }, [entryPhase, userId]);

  useEffect(() => {
    let interval = null;
    if (focusOn) {
      interval = window.setInterval(() => {
        setFocusSec((prev) => {
          const next = prev + 1;
          const minutes = Math.floor(next / 60);
          if (minutes > 0) {
            setProgress((prevProgress) => {
              const update = { ...prevProgress };
              const day = todayKey();
              const current = update[day] || { studyMin: 0, cards: 0, quizScores: [], topics: [], completed: false };
              update[day] = { ...current, studyMin: minutes };
              saveUserProgress(userId, update);
              return update;
            });
          }
          return next;
        });
      }, 1000);
    }
    return () => window.clearInterval(interval);
  }, [focusOn, userId]);

  useEffect(() => {
    if (breakType) {
      breakRef.current = window.setInterval(() => setBreakSec((prev) => prev + 1), 1000);
    }
    return () => window.clearInterval(breakRef.current);
  }, [breakType]);

  useEffect(() => {
    if (!guideInitRef.current) {
      guideInitRef.current = true;
      return undefined;
    }
    runGuideActivity(guideActions[screen] || 'wave', guideLines[screen] || guideLines.home, true);
    return undefined;
  }, [screen]);

  const showToast = (message, type = 'ok') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3400);
  };

  const currentAppPayload = (overrides = {}) => ({
    notes,
    topic,
    savedNotes,
    selectedNoteId,
    cards,
    quiz,
    cardRatings,
    uploadedSrc,
    prefs,
    profile,
    updatedAt: new Date().toISOString(),
    ...overrides
  });

  const saveCloudNow = (payload = currentAppPayload(), progressPayload = progress) => {
    if (userId === 'guest') return Promise.resolve();
    return saveUserCloudData(userId, payload, progressPayload)
      .then(() => setAuthStatus('Firebase sync active'))
      .catch((error) => {
        setAuthStatus(`Firebase sync failed: ${error.message || error}`);
        throw error;
      });
  };

  const callStudyBuddyAI = async (prompt, system, tools = null) => {
    let localError = null;
    try {
      const text = await callClaude(prompt, system, tools);
      if (String(text || '').trim()) return text;
      throw new Error('Empty AI response. Check your API key/model and try again.');
    } catch (error) {
      localError = error;
    }

    try {
      initFirebase();
      const data = await callStudyBuddyFunction({ prompt, system, tools });
      const text = typeof data === 'string'
        ? data
        : typeof data?.text === 'string'
          ? data.text
          : Array.isArray(data?.content)
            ? data.content.map((item) => item.text || '').join('')
            : '';
      if (text.trim()) return text;
      throw new Error('Firebase AI fallback returned an empty response');
    } catch (cloudError) {
      throw new Error(`${localError?.message || 'Local AI backend failed'}. Firebase AI fallback failed: ${cloudError.message}`);
    }

    throw new Error(localError?.message || 'AI request failed');
  };

  const requireJsonFromAI = async (prompt, system) => {
    const response = await callStudyBuddyAI(prompt, `${system} Return only valid JSON. Do not wrap it in Markdown.`);
    if (!response.trim()) throw new Error('Empty AI response. Check your API key/model and try again.');
    return response;
  };

  const getStudySource = (id = selectedNoteId) => {
    const item = savedNotes.find((note) => note.id === id);
    if (!item) {
      showToast('Save and select a notes topic first', 'err');
      setScreen('notes');
      return null;
    }
    if (!item.notes?.trim()) {
      showToast('Selected notes are empty', 'err');
      setScreen('notes');
      return null;
    }
    return item;
  };

  const loadUserState = async (uid) => {
    userStateReadyRef.current = false;
    const loadVersion = appStateVersionRef.current;
    const data = loadUserData(uid);
    const progressData = loadUserProgress(uid);
    const cloud = await loadUserCloudData(uid).catch(() => null);
    if (appStateVersionRef.current !== loadVersion) return;
    const { app: merged, progress: mergedProgress } = mergeUserSnapshots(data, cloud || {}, progressData, cloud?.progress || {});
    setTopic(merged.topic || '');
    setSavedNotes(merged.savedNotes || []);
    setSelectedNoteId(merged.selectedNoteId || '');
    setCards(merged.cards || []);
    setQuiz(merged.quiz || null);
    setCardRatings(merged.cardRatings || {});
    setUploadedSrc(merged.uploadedSrc || []);
    setPrefs(mergePrefs(merged.prefs || {}));
    setProfile(mergeProfile({ ...(merged.profile || {}), displayName: merged.profile?.displayName || window.localStorage.getItem('sb3_user') || loginName || '' }));
    setProfileDraft(mergeProfile(merged.profile || {}));
    setDisplayNameDraft(merged.profile?.displayName || loginName || '');
    setProgress(mergedProgress);
    saveUserData(uid, merged);
    saveUserProgress(uid, mergedProgress);
    userStateReadyRef.current = true;
    if (uid !== 'guest') saveUserCloudData(uid, merged, mergedProgress).catch(() => {});
  };

  const saveNoteEntry = (cleanTopic, cleanNotes, sources = uploadedSrc, options = {}) => {
    if (!isValidTopic(cleanTopic)) {
      showToast('Use a proper topic name with letters, not only numbers or symbols.', 'err');
      return null;
    }
    const title = options.title || cleanTopic;
    if (!isValidTopic(title)) {
      showToast('Use a proper name with letters, not only numbers or symbols.', 'err');
      return null;
    }
    if (savedNotes.some((doc) => doc.id !== options.ignoreId && normalizeSavedId(doc.title || doc.topic) === normalizeSavedId(title))) {
      showToast('A document with this name already exists. Use a different name.', 'err');
      return null;
    }
    if ((options.forceNew || !selectedNoteId) && savedNotes.length >= MAX_SAVED_DOCS) {
      showToast(`Document limit reached (${MAX_SAVED_DOCS}). Delete an old document before adding a new one.`, 'err');
      return null;
    }
    const id = options.forceNew ? `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` : selectedNoteId || `note-${Date.now()}`;
    const item = {
      id,
      topic: cleanTopic,
      title,
      notes: cleanNotes,
      updatedAt: new Date().toISOString(),
      sources,
      kind: options.kind || 'notes'
    };
    setSavedNotes((current) => {
      const exists = current.some((note) => note.id === id);
      const next = exists ? current.map((note) => (note.id === id ? item : note)) : [item, ...current];
      const payload = currentAppPayload({ notes: '', topic: cleanTopic, savedNotes: next, selectedNoteId: id, uploadedSrc: sources });
      saveUserData(userId, payload);
      saveCloudNow(payload, progress).catch(() => showToast('Saved locally. Cloud sync needs Firebase permission.', 'err'));
      return next;
    });
    setSelectedNoteId(id);
    return item;
  };

  const saveNoteSet = () => {
    const cleanTopic = topic.trim();
    const cleanNotes = notes.trim();
    if (!cleanTopic) {
      showToast('Enter the topic name first', 'err');
      return null;
    }
    if (!isValidTopic(cleanTopic)) {
      showToast('Use a proper topic name with letters, not only numbers or symbols.', 'err');
      return null;
    }
    if (!cleanNotes) {
      showToast('Paste or upload notes first', 'err');
      return null;
    }
    const item = saveNoteEntry(cleanTopic, cleanNotes, uploadedSrc);
    if (item) {
      setNotes('');
      showToast('Notes saved');
    }
    return item;
  };

  const loadNoteSet = (id, edit = false) => {
    const item = savedNotes.find((note) => note.id === id);
    if (!item) return;
    setSelectedNoteId(id);
    setTopic(item.topic || '');
    setUploadedSrc(item.sources || []);
    if (edit) setNotes(item.notes || '');
    showToast(`Selected ${item.title || item.topic || 'document'}`);
  };

  const deleteNoteSet = (id) => {
    const item = savedNotes.find((note) => note.id === id);
    if (!item) return;
    if (!window.confirm(`Delete saved notes for "${item.topic || 'this topic'}"?`)) return;
    setSavedNotes((current) => {
      const next = current.filter((note) => note.id !== id);
      const nextSelected = selectedNoteId === id ? '' : selectedNoteId;
      const payload = currentAppPayload({
        savedNotes: next,
        selectedNoteId: nextSelected,
        notes: selectedNoteId === id ? '' : notes,
        topic: selectedNoteId === id ? '' : topic,
        uploadedSrc: selectedNoteId === id ? [] : uploadedSrc
      });
      saveUserData(userId, payload);
      saveCloudNow(payload, progress).catch(() => showToast('Deleted locally. Cloud sync needs Firebase permission.', 'err'));
      return next;
    });
    if (selectedNoteId === id) {
      setSelectedNoteId('');
      setNotes('');
      setTopic('');
      setUploadedSrc([]);
    }
    showToast('Saved notes deleted');
  };

  const sourceNameExists = (name) => {
    const normalized = normalizeSavedId(name);
    return savedNotes.some((doc) => (doc.sources || []).some((src) => normalizeSavedId(src.name) === normalized));
  };

  const handleFile = async (file) => {
    if (!file) return;
    const cleanTopic = topic.trim();
    if (!cleanTopic) {
      showToast('Enter the topic name before uploading notes', 'err');
      return;
    }
    if (!isValidTopic(cleanTopic)) {
      showToast('Use a proper topic name with letters, not only numbers or symbols.', 'err');
      return;
    }
    if (sourceNameExists(file.name)) {
      showToast('This document is already uploaded. Choose a different document.', 'err');
      return;
    }
    if (savedNotes.length >= MAX_SAVED_DOCS) {
      showToast(`Document limit reached (${MAX_SAVED_DOCS}). Delete an old document before uploading a new one.`, 'err');
      return;
    }
    setLoading(true);
    setLoadMsg(`Reading ${file.name}…`);
    try {
      const txt = await extractFile(file);
      const source = { name: file.name, type: file.name.split('.').pop().toUpperCase() };
      const item = saveNoteEntry(cleanTopic, txt, [source], { forceNew: true, title: `${cleanTopic} - ${file.name}`, kind: 'file' });
      if (!item) {
        setLoading(false);
        return;
      }
      setNotes('');
      setUploadedSrc((current) => [source, ...current]);
      showToast(`${file.name} uploaded and saved`);
    } catch {
      showToast('Error reading file', 'err');
    }
    setLoading(false);
  };

  const handleURL = async () => {
    if (!topic.trim()) {
      showToast('Enter a topic name before saving URL notes', 'err');
      return;
    }
    if (!urlIn.trim()) return;
    if (!isValidTopic(topic.trim())) {
      showToast('Use a proper topic name with letters, not only numbers or symbols.', 'err');
      return;
    }
    if (sourceNameExists(urlIn)) {
      showToast('This URL is already saved as a document.', 'err');
      return;
    }
    if (savedNotes.length >= MAX_SAVED_DOCS) {
      showToast(`Document limit reached (${MAX_SAVED_DOCS}). Delete an old document before adding a URL.`, 'err');
      return;
    }
    setLoading(true);
    setLoadMsg('Fetching content from URL…');
    try {
      let content = '';
      try {
        content = await callStudyBuddyAI(
          `Summarise the educational content from this URL into clear study notes:\n${urlIn}\n\nIf you cannot access the URL, create study notes based on the topic implied by the URL path.`,
          'You are a study assistant. Extract and organise educational content.',
          [{ type: 'web_search_20250305', name: 'web_search' }]
        );
      } catch (error) {
        const url = new URL(urlIn);
        const path = url.pathname.split('/').filter(Boolean).join(' / ') || url.hostname;
        content = `URL saved for ${topic.trim()}.\nSource: ${urlIn}\nSuggested focus: ${path}\n\nIf the site blocks browser fetching, paste the article or lecture text here and press Save Notes.`;
        showToast('URL saved; paste page text if fetch is blocked', 'err');
      }
      const nextNotes = `[From: ${urlIn}]\n${content}`;
      const source = { name: urlIn.length > 40 ? `${urlIn.slice(0, 38)}…` : urlIn, type: 'URL' };
      const item = saveNoteEntry(topic.trim(), nextNotes, [source], { forceNew: true, title: `${topic.trim()} - URL`, kind: 'url' });
      if (!item) {
        setLoading(false);
        return;
      }
      setNotes('');
      setUploadedSrc((current) => [source, ...current]);
      setUrlIn('');
      showToast('URL notes added and saved');
    } catch (error) {
      showToast(error.message, 'err');
    }
    setLoading(false);
  };

  const runGuideActivity = (action = 'walk', line = '', talk = false) => {
    if (line) setGuideLine(line);
    setGuideState({ action, talk });
    if (talk) window.setTimeout(() => setGuideState((prev) => ({ ...prev, talk: false })), 3600);
  };

  const flipCard = () => setFlipped((prev) => !prev);
  const nextCard = () => {
    setFlipped(false);
    setCardIdx((prev) => Math.min(cards.length - 1, prev + 1));
  };
  const prevCard = () => {
    setFlipped(false);
    setCardIdx((prev) => Math.max(0, prev - 1));
  };
  const rateCard = (difficulty) => {
    setCardRatings((prev) => ({ ...prev, [cardIdx]: difficulty }));
    showToast(`Marked this card ${difficulty}`);
  };
  const onAnswerChange = (key, value) => setAnswers((prev) => ({ ...prev, [key]: value }));

  const getStudySourceForTask = (id = selectedNoteId) => {
    const source = getStudySource(id);
    if (source) {
      setSelectedNoteId(source.id);
      setTopic(source.topic || '');
      setUploadedSrc(source.sources || []);
    }
    return source;
  };

  const updateProgress = (callback) => {
    setProgress((prev) => {
      const next = callback({ ...prev });
      saveUserProgress(userId, next);
      return next;
    });
  };

  const genCards = async (sourceId = selectedNoteId) => {
    const source = getStudySourceForTask(sourceId);
    if (!source) return;
    setLoading(true);
    setLoadMsg('Creating AI flashcards…');
    try {
      const response = await requireJsonFromAI(
        `Create intelligent spaced-repetition flashcards from:\n\nTOPIC: ${source.topic}\n\nNOTES:\n${source.notes.slice(0, 3500)}\n\nReturn ONLY valid JSON array:\n[{"front":"Question","back":"Answer","tag":"category","difficulty":"easy|medium|hard"}]\n\nGenerate 12–15 cards covering key terms, concepts, formulas.`,
        'You are a study assistant specialising in spaced repetition.'
      );
      const parsed = parseJsonRelaxed(response);
      const nextCards = Array.isArray(parsed)
        ? parsed
            .map((card) => ({
              front: String(card?.front || card?.q || card?.question || '').trim(),
              back: String(card?.back || card?.a || card?.answer || '').trim(),
              tag: String(card?.tag || source.topic || 'Study').trim(),
              difficulty: /^(easy|medium|hard)$/i.test(card?.difficulty || '') ? String(card.difficulty).toLowerCase() : 'medium'
            }))
            .filter((card) => card.front && card.back)
        : [];
      if (nextCards.length) {
        setCards(nextCards);
        setCardIdx(0);
        setFlipped(false);
        setCardRatings({});
        setStudyTab('cards');
        setScreen('study');
        updateProgress((draft) => {
          const todayRecord = draft[today] || { studyMin: 0, cards: 0, quizScores: [], topics: [], completed: false };
          return { ...draft, [today]: { ...todayRecord, cards: todayRecord.cards + nextCards.length, topics: Array.from(new Set([...(todayRecord.topics || []), source.topic || 'Session'])) } };
        });
        showToast('Flashcards ready');
      } else {
        showToast('Parse error — try again', 'err');
      }
    } catch (error) {
      showToast(error.message, 'err');
    }
    setLoading(false);
  };

  const genQuiz = async (sourceId = selectedNoteId) => {
    const source = getStudySourceForTask(sourceId);
    if (!source) return;
    setLoading(true);
    setLoadMsg('Generating quiz…');
    try {
      const response = await requireJsonFromAI(
        `Generate a ${diff} quiz from:\n\nTOPIC: ${source.topic}\n\nNOTES:\n${source.notes.slice(0, 3500)}\n\nReturn ONLY valid JSON:\n{"mcq":[{"q":"?","opts":["A","B","C","D"],"ans":0,"exp":"brief explanation"}],"tf":[{"q":"statement","ans":true,"exp":"explanation"}],"blanks":[{"q":"_____ is the missing term.","ans":"term","exp":"brief explanation"}],"short":[{"q":"?","ans":"model answer"}]}\n\nGenerate: 5 MCQs, 4 T/F, 5 blanks, 4 short answer.`,
        'You are a study assistant. Generate accurate quizzes from study notes.'
      );
      const parsed = normalizeQuizPayload(parseJsonRelaxed(response));
      if (parsed) {
        setQuiz(parsed);
        setAnswers({});
        setSubmitted(false);
        setQtab('mcq');
        setScore(null);
        setStudyTab('quiz');
        setScreen('study');
        showToast('Quiz ready');
      } else {
        showToast('Parse error — try again', 'err');
      }
    } catch (error) {
      showToast(error.message, 'err');
    }
    setLoading(false);
  };

  const makeSubjectiveQuestions = (source) => {
    const text = String(source.notes || '').replace(/\s+/g, ' ').trim();
    const cleanPromptSeed = (value) => String(value || '')
      .replace(/\bAnswer\s*[:：][\s\S]*$/i, '')
      .replace(/\bStrategic\s+Answers?\b[\s\S]*$/i, '')
      .replace(/^\d+\)\s*/, '')
      .trim();
    const chunks = text
      .split(/(?=\b\d+\)\s+)|(?<=[.!?])\s+/)
      .map((item) => ({ prompt: cleanPromptSeed(item), answer: item.trim() }))
      .filter((item) => item.prompt.length > 20 && item.prompt.length < 180 && item.answer.length > 45)
      .slice(0, 8);
    const seeds = chunks.length ? chunks : [{ prompt: `Review a key idea in ${source.topic}.`, answer: text.slice(0, 260) || `Review the key ideas in ${source.topic}.` }];
    return seeds.slice(0, 5).map((content, index) => ({
      q: [
        `Explain this idea in your own words: ${content.prompt}`,
        `Why is this important in ${source.topic}? Use details from your notes.`,
        `Write a short answer about this concept: ${content.prompt}`,
        `What would you remember for an exam about this point: ${content.prompt}`,
        `Summarize the main meaning of this note: ${content.prompt}`
      ][index % 5],
      ans: content.answer
    }));
  };

  const makeCleanSubjectiveQuestions = (source) => {
    const text = String(source.notes || '').replace(/\s+/g, ' ').trim();
    const cleanPromptSeed = (value) => String(value || '')
      .replace(/^TECHNICAL\s+INTERVIEW\s*[—-].*?\d+\)\s*/i, '')
      .replace(/\bAnswer\s*[:：][\s\S]*$/i, '')
      .replace(/[“"'].*$/, '')
      .replace(/\bStrategic\s+Answers?\b[\s\S]*$/i, '')
      .replace(/^\d+\)\s*/, '')
      .trim();
    const questionTitle = (value) => cleanPromptSeed(value)
      .replace(/\?[\s\S]*$/, '?')
      .replace(/\s+/g, ' ')
      .slice(0, 90)
      .trim();
    const chunks = text
      .split(/(?=\b\d+\)\s+)|(?<=[.!?])\s+/)
      .map((item) => ({ prompt: questionTitle(item), answer: item.trim() }))
      .filter((item) => item.prompt.length > 20 && item.answer.length > 45)
      .slice(0, 8);
    const seeds = chunks.length ? chunks : [{ prompt: `Review a key idea in ${source.topic}.`, answer: text.slice(0, 260) || `Review the key ideas in ${source.topic}.` }];
    return seeds.slice(0, 5).map((content, index) => ({
      q: [
        content.prompt.endsWith('?') ? content.prompt : `Explain ${content.prompt} in your own words.`,
        `Why is this important in ${source.topic}? Use details from your notes.`,
        `Write a short answer about ${content.prompt}.`,
        `What would you remember for an exam about ${content.prompt}?`,
        `Summarize the main idea behind ${content.prompt}.`
      ][index % 5],
      ans: content.answer
    }));
  };

  const normalizeSubjectivePayload = (value) => {
    const source = Array.isArray(value) ? value : value?.questions || value?.subjective || value?.items || [];
    return Array.isArray(source)
      ? source
          .map((item) => ({
            q: String(item?.q || item?.question || item?.prompt || '').trim(),
            ans: String(item?.ans || item?.answer || item?.modelAnswer || item?.expected || '').trim()
          }))
          .filter((item) => item.q && item.ans)
          .slice(0, 5)
      : [];
  };

  const genSubjectiveQuestions = async (source) => {
    const response = await requireJsonFromAI(
      `Create subjective written-answer practice questions from these notes.\n\nTOPIC: ${source.topic}\n\nNOTES:\n${source.notes.slice(0, 4500)}\n\nRequired JSON shape:\n[{"q":"Question","ans":"Model answer"}]\n\nGenerate exactly 5 exam-style subjective questions. Keep model answers concise but specific to the notes.`,
      'You are a study examiner who creates subjective practice questions.'
    );
    const parsed = normalizeSubjectivePayload(parseJsonRelaxed(response));
    if (!parsed.length) throw new Error('AI returned no usable subjective questions');
    return parsed;
  };

  const scoreSubjectiveAnswer = (student, model) => {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'for', 'with', 'as', 'by', 'this', 'that', 'it', 'its', 'be', 'from', 'at', 'your', 'you', 'i', 'my', 'we', 'our', 'about', 'into', 'can', 'should', 'would', 'could']);
    const tokenize = (text) => (String(text || '').toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((word) => !stopWords.has(word));
    const expected = [...new Set(tokenize(model))];
    const got = new Set(tokenize(student));
    const hits = expected.filter((word) => got.has(word)).length;
    const coverage = expected.length ? hits / expected.length : 0;
    const lengthOk = tokenize(student).length >= Math.min(8, Math.max(3, Math.round(expected.length * 0.35)));
    const pct = Math.min(100, Math.round(coverage * 85 + (lengthOk ? 15 : 0)));
    return { pct, correct: pct >= 60, hits, total: expected.length };
  };

  const getSource = (id = selectedNoteId) => getStudySourceForTask(id);

  const startOral = async (sourceId = selectedNoteId) => {
    const source = getSource(sourceId);
    if (!source) return;
    setLoading(true);
    setLoadMsg('Creating subjective questions...');
    try {
      let qs = [];
      try {
        qs = await genSubjectiveQuestions(source);
      } catch (error) {
        qs = makeCleanSubjectiveQuestions(source);
        showToast(`${error.message}. Using local practice questions.`, 'err');
      }
      setPracticeQs(qs);
      setPracticeIdx(0);
      setPracticeDone(false);
      setPracticeResults([]);
      setViva([{ role: 'examiner', text: qs[0]?.q || `Write a short answer about ${source.topic || 'this topic'}.` }]);
      setVivaIn('');
      setStudyTab('oral');
      setScreen('study');
      updateProgress((draft) => {
        const day = todayKey();
        const todayRecord = draft[day] || { studyMin: 0, cards: 0, quizScores: [], topics: [], completed: false, subjectivePractice: 0 };
        return {
          ...draft,
          [day]: {
            ...todayRecord,
            subjectivePractice: (todayRecord.subjectivePractice || 0) + 1,
            topics: Array.from(new Set([...(todayRecord.topics || []), source.topic || 'Session']))
          }
        };
      });
      showToast('Subjective questions ready');
    } finally {
      setLoading(false);
    }
  };

  const sendViva = async (overrideText = '') => {
    const answer = String(overrideText || vivaIn).trim();
    if (!answer || vivaLoading || practiceDone) return;
    setVivaIn('');
    const qs = practiceQs.length ? practiceQs : makeCleanSubjectiveQuestions(getStudySource());
    const current = qs[practiceIdx] || qs[0] || { ans: 'Review your notes and include the key terms.' };
    const localMark = scoreSubjectiveAnswer(answer, current.ans);
    setVivaLoading(true);
    try {
      let mark = localMark;
      let aiNote = '';
      try {
        const response = await requireJsonFromAI(
          `Grade this subjective answer.\n\nQuestion: ${current.q || 'Subjective question'}\n\nModel answer: ${current.ans}\n\nStudent answer: ${answer}\n\nRequired JSON shape:\n{"pct":75,"correct":true,"feedback":"One short helpful sentence"}`,
          'You are a fair study examiner. Grade by meaning, not exact wording.'
        );
        const parsed = parseJsonRelaxed(response);
        const pct = Number(parsed?.pct ?? parsed?.score);
        if (Number.isFinite(pct)) {
          mark = {
            pct: clamp(Math.round(pct), 0, 100),
            correct: typeof parsed?.correct === 'boolean' ? parsed.correct : pct >= 60,
            hits: localMark.hits,
            total: localMark.total
          };
          aiNote = String(parsed?.feedback || parsed?.note || '').trim();
        }
      } catch {
        mark = localMark;
      }
      const nextIdx = practiceIdx + 1;
      const next = qs[nextIdx];
      const resultEntry = [...practiceResults, mark];
      const feedbackBase = `Score for this answer: ${mark.pct}% (${mark.correct ? 'Correct' : 'Needs more detail'}).`;
      const feedback = next
        ? `${feedbackBase}${aiNote ? ` ${aiNote}` : ''} Next question: ${next.q}`
        : `${feedbackBase}${aiNote ? ` ${aiNote}` : ''} Result: ${resultEntry.filter((item) => item.correct).length}/${qs.length} answers correct.`;
      setViva((currentViva) => [...currentViva, { role: 'student', text: answer, score: mark.pct, correct: mark.correct }, { role: 'examiner', text: feedback }]);
      setPracticeResults(resultEntry);
      setPracticeIdx(next ? nextIdx : qs.length - 1);
      setPracticeDone(!next);
    } finally {
      setVivaLoading(false);
    }
  };

  const toggleSpeechAnswer = async () => {
    if (vivaLoading) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      showToast('Speech recognition is not supported in this browser', 'err');
      return;
    }
    if (speechOn) {
      speechManualStopRef.current = true;
      speechRef.current?.stop();
      return;
    }
    speechBaseRef.current = vivaIn.trim();
    speechFinalRef.current = '';
    speechInterimRef.current = '';
    speechManualStopRef.current = false;
    const startRecognition = () => {
      const recognition = new SpeechRecognition();
      speechRef.current = recognition;
      recognition.lang = navigator.language?.startsWith('en') ? navigator.language : 'en-US';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 3;
      recognition.onaudiostart = () => setSpeechStatus('Mic is listening...');
      recognition.onspeechstart = () => setSpeechStatus('Hearing your voice...');
      recognition.onstart = () => {
        setSpeechOn(true);
        setSpeechStatus('Mic is listening...');
      };
      recognition.onerror = (event) => {
        if (event.error === 'not-allowed') {
          speechManualStopRef.current = true;
          setSpeechOn(false);
          setSpeechStatus('');
          showToast('Microphone permission was blocked', 'err');
        } else if (event.error === 'no-speech') {
          setSpeechStatus('No speech detected. Try again.');
        }
      };
      recognition.onresult = (event) => {
        let final = speechFinalRef.current;
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const transcript = event.results[i][0]?.transcript || '';
          if (event.results[i].isFinal) final += `${final ? ' ' : ''}${transcript.trim()}`;
          else interim += `${interim ? ' ' : ''}${transcript.trim()}`;
        }
        speechFinalRef.current = final.trim();
        speechInterimRef.current = interim.trim();
        const combined = [speechBaseRef.current, speechFinalRef.current, speechInterimRef.current].filter(Boolean).join(' ');
        setVivaIn(combined);
        if (combined) setSpeechStatus('Writing your words...');
      };
      recognition.onend = () => {
        if (!speechManualStopRef.current) {
          setTimeout(() => {
            if (!speechManualStopRef.current) startRecognition();
          }, 180);
          return;
        }
        setSpeechOn(false);
        setSpeechStatus('');
        const transcript = [speechBaseRef.current, speechFinalRef.current, speechInterimRef.current].filter(Boolean).join(' ').trim();
        if (transcript) sendViva(transcript);
      };
      try {
        recognition.start();
      } catch {
        setTimeout(() => startRecognition(), 300);
      }
    };
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      }
    } catch {}
    showToast('Listening... speak your answer');
    startRecognition();
  };

  const submitQuiz = () => {
    if (!quiz) return;
    let scoreTotal = 0;
    let total = 0;
    quiz.mcq?.forEach((q, index) => {
      total += 1;
      if (answers[`m${index}`] === q.ans) scoreTotal += 1;
    });
    quiz.tf?.forEach((q, index) => {
      total += 1;
      if (answers[`t${index}`] === q.ans) scoreTotal += 1;
    });
    quiz.blanks?.forEach((q, index) => {
      total += 1;
      const clean = (value) => String(value || '').trim().toLowerCase();
      if (clean(answers[`b${index}`]) === clean(q.ans)) scoreTotal += 1;
    });
    const pct = total > 0 ? Math.round((scoreTotal / total) * 100) : 0;
    setScore({ s: scoreTotal, t: total, pct });
    setSubmitted(true);
    updateProgress((draft) => {
      const todayRecord = draft[today] || { studyMin: 0, cards: 0, quizScores: [], topics: [], completed: false };
      return { ...draft, [today]: { ...todayRecord, quizScores: [...(todayRecord.quizScores || []), pct] } };
    });
    showToast(pct >= 70 ? `Score: ${pct}%` : `Score: ${pct}% - keep going`);
  };

  const completeTopic = () => {
    setFocusOn(false);
    const currentTopic = savedNotes.find((note) => note.id === selectedNoteId)?.topic || topic || 'Session';
    updateProgress((draft) => {
      const todayRecord = draft[today] || { studyMin: 0, cards: 0, quizScores: [], topics: [], completed: false };
      return { ...draft, [today]: { ...todayRecord, completed: true, topics: Array.from(new Set([...(todayRecord.topics || []), currentTopic])) } };
    });
    runGuideActivity('celebrate', `"${currentTopic}" completed. You did it!`, true);
    setScreen('home');
    showToast(`"${currentTopic}" completed`);
  };

  const startBreak = (type) => {
    setBreakType(type);
    setBreakSec(0);
    setFocusOn(false);
    setScreen('break');
    runGuideActivity(type === 'rest' ? 'sleep' : type === 'food' ? 'coffee' : 'wave',
      type === 'rest' ? 'Rest mode. I will get cozy while you reset.' : type === 'food' ? 'Break mode. Sip, breathe, reset.' : 'Walk break. Stretch your brain a little.',
      true
    );
  };

  const endBreak = () => {
    setBreakType(null);
    setBreakSec(0);
    setScreen('focus');
    runGuideActivity('wave', 'Break finished. Ready when you are.', true);
  };

  const openSettings = () => {
    setSettingsDraft(mergePrefs(prefs));
    setProfileDraft(profile);
    setDisplayNameDraft(profile.displayName || loginName || '');
    setSettingsTab('theme');
    setShowSettings(true);
  };

  const closeSettings = () => {
    setShowSettings(false);
    setSettingsDraft(null);
  };

  const confirmSettings = async () => {
    const profileData = { ...profileDraft, displayName: (profileDraft.displayName || displayNameDraft || 'Student').trim() };
    if (settingsDraft) setPrefs(mergePrefs(settingsDraft));
    setProfile(profileData);
    setShowSettings(false);
    setSettingsDraft(null);
    showToast('Settings saved');
    await saveDisplayName(profileData.displayName, profileData);
  };

  const saveDisplayName = async (rawName, profileOverride = null) => {
    const name = String(rawName || '').trim() || 'Student';
    const data = { ...(profileOverride || profileDraft), displayName: name };
    try {
      const fb = initFirebase();
      const user = fb.auth.currentUser;
      if (user?.updateProfile) await user.updateProfile({ displayName: name });
      window.localStorage.setItem('sb3_user', name);
      setLoginName(name);
      setProfile(data);
      setProfileDraft(data);
      setDisplayNameDraft(name);
      if (user?.uid) await saveUserProfile(user.uid, data);
      showToast('Name updated');
    } catch (error) {
      showToast(error.message || 'Could not update name', 'err');
    }
  };

  const authSubmit = async (event) => {
    event.preventDefault();
    const email = loginEmail.trim();
    const name = loginName.trim() || email.split('@')[0] || 'Student';
    const fb = initFirebase();
    if (!fb.auth) {
      setAuthStatus('Add Firebase config before login');
      showToast('Real login needs Firebase config first', 'err');
      return;
    }
    try {
      if (loginSignup) {
        setAuthStatus('Creating account...');
        const result = await registerUser(email, loginPassword);
        if (result.user && result.user.sendEmailVerification) {
          await result.user.sendEmailVerification();
          await logoutUser();
          setLoginSignup(false);
          setLoginPassword('');
          setAuthStatus('Verification email sent. Confirm it, then log in.');
          showToast('Check your inbox to verify email', 'ok');
          return;
        }
      } else {
        setAuthStatus('Checking verified login...');
        await loginUser(email, loginPassword);
      }
      const currentUser = fb.auth.currentUser;
      if (!currentUser) {
        throw new Error('Auth did not return a user');
      }
      await currentUser.reload();
      if (!currentUser.emailVerified) {
        if (currentUser.sendEmailVerification) await currentUser.sendEmailVerification();
        await logoutUser();
        setAuthStatus('Email not verified yet');
        showToast('Verify your real email before login', 'err');
        return;
      }
      const uid = currentUser.uid;
      window.localStorage.setItem('sb3_user', currentUser.displayName || name);
      window.localStorage.setItem('sb3_uid', uid);
      window.localStorage.setItem('sb3_auth_ok', '1');
      if (loginRemember) window.localStorage.setItem('sb3_email', email);
      else window.localStorage.removeItem('sb3_email');
      setLoginName(currentUser.displayName || name);
      setAuthStatus('Firebase sync active');
      setEntryPhase('splashAfterLogin');
      loadUserState(uid);
    } catch (error) {
      window.localStorage.removeItem('sb3_auth_ok');
      setAuthStatus(error.message || 'Firebase auth failed');
      showToast(error.message || 'Login failed', 'err');
    }
  };

  const signOut = async () => {
    try {
      await logoutUser();
    } catch {
      // ignore
    }
    window.localStorage.removeItem('sb3_logged_in');
    window.localStorage.removeItem('sb3_auth_ok');
    window.localStorage.removeItem('sb3_uid');
    setLoginPassword('');
    setEntryPhase('login');
    showToast('Logged out');
  };

  const deleteAccount = async () => {
    if (!window.confirm('Delete your account and saved StudyBuddy data? This cannot be undone.')) return;
    try {
      const fb = initFirebase();
      const user = fb.auth.currentUser;
      if (user?.uid) {
        await saveUserProfile(user.uid, {});
        await user.delete();
      }
      window.localStorage.removeItem('sb3_logged_in');
      window.localStorage.removeItem('sb3_auth_ok');
      window.localStorage.removeItem('sb3_uid');
      setEntryPhase('login');
      showToast('Account deleted');
    } catch (error) {
      showToast('Log in again, then delete account', 'err');
      setAuthStatus(error.message || 'Delete failed');
    }
  };

  const selectedSource = savedNotes.find((note) => note.id === selectedNoteId);
  const displayedSources = Array.from(
    new Map(
      savedNotes
        .flatMap((note) => (note.sources || []).map((src) => [`${src.type}:${src.name}`, src]))
        .concat(uploadedSrc.map((src) => [`${src.type}:${src.name}`, src]))
    ).values()
  );

  const screenMap = {
    home: HomePage,
    notes: NotesPage,
    study: StudyPage,
    calendar: CalendarPage,
    focus: FocusPage,
    break: BreakPage
  };
  const ActiveScreen = screenMap[screen] || HomePage;

  const navItems = [
    { id: 'home', icon: 'computer', label: 'Home' },
    { id: 'notes', icon: 'notes', label: 'Notes' },
    { id: 'study', icon: 'star', label: 'Study' },
    { id: 'calendar', icon: 'calendar', label: 'Calendar' },
    { id: 'focus', icon: 'timer', label: 'Focus' }
  ];

  const themeCornerAsset = prefs.theme === 'blue' ? assets.blueCat : prefs.theme === 'dark' ? assets.ghost : prefs.theme === 'purple' ? assets.turtle : assets.cat;
  const themeFloorAsset = prefs.theme === 'blue' ? assets.turtle : prefs.theme === 'dark' ? assets.ghost : prefs.theme === 'purple' ? assets.jelly : assets.cat;

  useEffect(() => {
    document.body.classList.toggle('theme-blue', prefs.theme === 'blue');
    document.body.classList.toggle('theme-purple', prefs.theme === 'purple');
    document.body.classList.toggle('theme-dark', prefs.theme === 'dark');
    return () => {
      document.body.classList.remove('theme-blue', 'theme-purple', 'theme-dark');
    };
  }, [prefs.theme]);

  useEffect(() => {
    if (entryPhase !== 'app') return undefined;
    if (!guideInitRef.current) return undefined;
    const interval = window.setInterval(() => {
      if (!focusOn && screen === 'home') {
        const cycle = ['walk', 'jump', 'read', 'coffee'];
        runGuideActivity(cycle[Math.floor(Math.random() * cycle.length)], '', false);
      }
    }, 6500);
    return () => window.clearInterval(interval);
  }, [focusOn, screen]);

  if (entryPhase === 'splash' || entryPhase === 'splashAfterLogin') {
    return <SplashPage message={splashMsg} />;
  }

  if (entryPhase === 'login') {
    return (
      <LoginPage
        loginName={loginName}
        loginEmail={loginEmail}
        loginPassword={loginPassword}
        loginSignup={loginSignup}
        loginRemember={loginRemember}
        authStatus={authStatus}
        onSignupToggle={(value) => {
          setLoginSignup(value);
          setAuthStatus(getFirebaseConfigReady() ? (value ? 'Create once, verify inbox, then switch back to Login.' : 'Firebase login requires a verified email.') : 'Add Firebase config before signup.');
        }}
        onFormSubmit={authSubmit}
        onLoginNameChange={setLoginName}
        onLoginEmailChange={setLoginEmail}
        onLoginPasswordChange={setLoginPassword}
        onRememberChange={setLoginRemember}
      />
    );
  }

  if (loading) {
    return <LoadingScreen message={loadMsg} />;
  }

  return (
    <div className="app-shell">
      <Sidebar
        profile={profile}
        loginName={loginName}
        navItems={navItems}
        activeScreen={screen}
        iconSize={prefs.iconSize}
        icons={prefs.icons}
        onNavigate={(id) => {
          setScreen(id);
          setStudyTab(id === 'study' ? 'cards' : studyTab);
          runGuideActivity(guideActions[id] || 'wave', guideLines[id] || guideLines.home, true);
        }}
        onSettings={openSettings}
        onSignOut={signOut}
      />
      <main className="main-content">
        <SafeImage src={themeCornerAsset} alt="corner" className="decor-branch" fallback="star" />
        <div className="app-decorations">
          {prefs.decorations.map((decoration) => (
            <div key={decoration.id} className="decor-wrap" style={{ left: `${decoration.x}%`, top: `${decoration.y}%` }}>
              {decoration.emoji ? (
                <span className="deco-emoji" style={{ '--s': `${decoration.size}px` }}>{decoration.emoji}</span>
              ) : (
                <SafeImage src={decoration.src} alt="decoration" style={{ '--s': `${decoration.size}px` }} fallback="star" />
              )}
            </div>
          ))}
        </div>
        <div className="topbar">
          {screen !== 'home' && (
            <button type="button" className="back-btn" onClick={() => setScreen('home')}>
              ‹
            </button>
          )}
          <h2>{screen.charAt(0).toUpperCase() + screen.slice(1)}</h2>
          <button type="button" className="settings-trigger" onClick={openSettings}>
            <SafeImage src={assets.settings} alt="settings" fallback="settings" />
          </button>
        </div>
        <div className="screen-wrap">
          <ActiveScreen
            assets={assets}
            profile={profile}
            prefs={prefs}
            topic={topic}
            notes={notes}
            savedNotes={savedNotes}
            selectedNoteId={selectedNoteId}
            uploadedSrc={uploadedSrc}
            urlIn={urlIn}
            diff={diff}
            studyTab={studyTab}
            cards={cards}
            cardIdx={cardIdx}
            flipped={flipped}
            cardRatings={cardRatings}
            quiz={quiz}
            answers={answers}
            submitted={submitted}
            qtab={qtab}
            score={score}
            viva={viva}
            vivaIn={vivaIn}
            vivaLoading={vivaLoading}
            practiceQs={practiceQs}
            practiceIdx={practiceIdx}
            practiceDone={practiceDone}
            practiceResults={practiceResults}
            speechOn={speechOn}
            speechSupported={speechSupported}
            speechStatus={speechStatus}
            focusSec={focusSec}
            focusOn={focusOn}
            breakType={breakType}
            breakSec={breakSec}
            progress={progress}
            todayData={todayData}
            avgQ={avgQ}
            calDate={calDate}
            selDay={selDay}
            calNoteDate={calNoteDate}
            calNoteText={calNoteText}
            displayedSources={displayedSources}
            onTopicChange={setTopic}
            onNotesChange={setNotes}
            onUrlChange={setUrlIn}
            onDiffChange={setDiff}
            onStudyTabChange={setStudyTab}
            onCardIdxChange={setCardIdx}
            onFlippedChange={setFlipped}
            onLoadNote={() => loadNoteSet(selectedNoteId, false)}
            onSaveNote={saveNoteSet}
            onNewNote={() => { setSelectedNoteId(''); setTopic(''); setNotes(''); setUploadedSrc([]); }}
            onUploadFile={handleFile}
            onFetchUrl={handleURL}
            onSelectNote={loadNoteSet}
            onDeleteNote={deleteNoteSet}
            onGenerateCards={genCards}
            onGenerateQuiz={genQuiz}
            onStartOral={startOral}
            onSubmitQuiz={submitQuiz}
            onSendViva={sendViva}
            onToggleSpeech={toggleSpeechAnswer}
            onCompleteTopic={completeTopic}
            onStartBreak={startBreak}
            onEndBreak={endBreak}
            onVivaChange={setVivaIn}
            onAnswerChange={onAnswerChange}
            onFlip={flipCard}
            onPrev={prevCard}
            onNext={nextCard}
            onRate={rateCard}
            onPasteNote={() => {
              if (!calNoteDate || !calNoteText.trim()) {
                showToast('Choose a date and write a note first', 'err');
                return;
              }
              updateProgress((draft) => {
                const current = draft[calNoteDate] || { studyMin: 0, cards: 0, quizScores: [], topics: [], completed: false };
                return { ...draft, [calNoteDate]: { ...current, note: calNoteText.trim() } };
              });
              setCalNoteText('');
              showToast('Sticky note pasted');
            }}
            onSettingsOpen={openSettings}
            onScreenChange={setScreen}
          />
        </div>
        <GuideCompanion guideLine={guideLine} guideState={guideState} focusOn={focusOn || screen === 'focus'} docked={companionsDocked} assets={assets} onAction={runGuideActivity} onDockToggle={() => setCompanionsDocked((value) => !value)} />
        <GhostCompanion ghostState={{ ghostBurst, ghostHidden, ghostDir, companionsDocked }} ghostRef={ghostElRef} onBurst={() => setGhostBurst(true)} />
      </main>
      <BottomNav items={navItems} activeScreen={screen} onNavigate={(id) => setScreen(id)} icons={prefs.icons} iconSize={prefs.iconSize} />
      {showSettings && (
        <SettingsModal
          visible={showSettings}
          tabs={['theme', 'account', 'icons', 'deco', 'api']}
          currentTab={settingsTab}
          onTabChange={setSettingsTab}
          themeCards={themeCards}
          draftPrefs={settingsDraft || prefs}
          profileDraft={profileDraft}
          displayNameDraft={displayNameDraft}
          onThemeChange={(theme) => setSettingsDraft((draft) => ({ ...mergePrefs(draft || prefs), theme }))}
          onProfileChange={(key, value) => {
            setProfileDraft((draft) => ({ ...draft, [key]: value }));
            if (key === 'displayName') setDisplayNameDraft(value);
          }}
          onUploadPhoto={(file) => {
            const reader = new FileReader();
            reader.onload = () => {
              setProfileDraft((draft) => ({ ...draft, photo: reader.result || '' }));
            };
            reader.readAsDataURL(file);
          }}
          onSave={confirmSettings}
          onClose={closeSettings}
          onLogout={signOut}
          onDeleteAccount={deleteAccount}
          onIconChange={(slot, value) => setSettingsDraft((draft) => ({ ...mergePrefs(draft || prefs), icons: { ...mergePrefs(draft || prefs).icons, [slot]: value } }))}
          onDecorationSizeChange={setDecoSize}
          onAddDecoration={(name, src) => setSettingsDraft((draft) => ({ ...mergePrefs(draft || prefs), decorations: [...(mergePrefs(draft || prefs).decorations || []), { id: Date.now(), emoji: src?.length <= 2 ? src : null, src: src?.length > 2 ? src : null, x: 12, y: 16, size: decoSize }] }))}
          onClearDecorations={() => setSettingsDraft((draft) => ({ ...mergePrefs(draft || prefs), decorations: [] }))}
        />
      )}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}

export default App;
