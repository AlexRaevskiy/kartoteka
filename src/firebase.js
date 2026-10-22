/**
 * Firebase setup.
 *
 * Reads the web-app config from Vite env variables (VITE_FIREBASE_*), see .env.example.
 * If any are missing, `firebaseConfigured` is false and the app shows a setup screen
 * instead of crashing.
 *
 * Offline support:
 *   - Auth session is kept in IndexedDB, so users stay signed in (also inside the installed PWA).
 *   - Firestore uses a persistent local cache (IndexedDB) shared across tabs, so the library
 *     loads instantly, works offline, and queued writes sync automatically when back online.
 */
import { initializeApp } from "firebase/app";
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
} from "firebase/auth";
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** Names of env variables that still need a value (shown on the setup screen). */
export const missingConfig = Object.entries({
  VITE_FIREBASE_API_KEY: firebaseConfig.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: firebaseConfig.authDomain,
  VITE_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
  VITE_FIREBASE_APP_ID: firebaseConfig.appId,
})
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const firebaseConfigured = missingConfig.length === 0;

export const app = firebaseConfigured ? initializeApp(firebaseConfig) : null;

export const auth = app
  ? initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    })
  : null;

function createDb() {
  if (!app) return null;
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (err) {
    // e.g. IndexedDB unavailable in a private window → fall back to the in-memory cache.
    console.warn("[firebase] Persistent cache unavailable, using memory cache.", err);
    return getFirestore(app);
  }
}

export const db = createDb();

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
