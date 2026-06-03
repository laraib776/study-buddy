import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, serverTimestamp, enableIndexedDbPersistence, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ''
};

let app = null;
let auth = null;
let db = null;
let functions = null;
let persistenceEnabled = false;

export function initFirebase() {
  if (!app && firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    if (!persistenceEnabled) {
      persistenceEnabled = true;
      enableIndexedDbPersistence(db).catch(() => {
        // Another tab may already own persistence; localStorage cache still keeps the app fast.
      });
    }
    functions = getFunctions(app);
    if (import.meta.env.VITE_USE_FUNCTIONS_EMULATOR === 'true') {
      connectFunctionsEmulator(functions, 'localhost', 5001);
    }
  }
  return { auth, db, functions };
}

export async function loginUser(email, password) {
  await setPersistence(auth, browserLocalPersistence);
  return signInWithEmailAndPassword(auth, email, password);
}

export async function registerUser(email, password) {
  await setPersistence(auth, browserLocalPersistence);
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function logoutUser() {
  return firebaseSignOut(auth);
}

export async function saveUserProfile(uid, profile) {
  if (!db) return null;
  const userDoc = doc(db, 'studybuddyUsers', uid);
  return setDoc(userDoc, { profile, updatedAt: serverTimestamp() }, { merge: true });
}

export async function saveUserCloudData(uid, appData, progress) {
  if (!db) return null;
  const userDoc = doc(db, 'studybuddyUsers', uid);
  return setDoc(userDoc, {
    app: appData,
    progress,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function loadUserCloudData(uid) {
  if (!db) return null;
  const userDoc = doc(db, 'studybuddyUsers', uid);
  const snapshot = await getDoc(userDoc);
  return snapshot.exists() ? snapshot.data() : null;
}

export function listenUserCloudData(uid, onData, onError) {
  if (!db) return () => {};
  const userDoc = doc(db, 'studybuddyUsers', uid);
  return onSnapshot(userDoc, (snapshot) => {
    if (snapshot.exists()) onData(snapshot.data());
  }, onError);
}

export async function callStudyBuddyFunction(payload) {
  if (!functions) throw new Error('Firebase functions not initialized');
  const callable = httpsCallable(functions, 'studyBuddyAi');
  const result = await callable(payload);
  return result.data;
}
