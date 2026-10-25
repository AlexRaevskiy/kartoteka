/**
 * Authentication hook: Google sign-in + anonymous "guest" mode.
 *
 * - Google: popup only (signInWithPopup / linkWithPopup), in the browser and in the installed PWA.
 *   No redirect flow: Safari partitions storage, so signInWithRedirect fails with "missing
 *   initial state", and in the iOS home-screen app a redirect opens in Safari and never returns.
 *   The popup must be opened synchronously inside the click handler — no `await` before
 *   signInWithPopup(), or iOS treats it as an unsolicited popup and blocks it. If it is blocked
 *   anyway, the user sees a message asking to allow popups.
 * - Persistence is set once in src/firebase.js (initializeAuth: IndexedDB, then localStorage),
 *   so the session survives PWA restarts without calling setPersistence() before each sign-in.
 * - Guest: anonymous account, data still syncs to Firestore. Guests can later "upgrade" to
 *   Google; the account is linked, so the uid and all decks are kept.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInAnonymously,
  linkWithPopup,
  signInWithCredential,
  signOut as fbSignOut,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth, googleProvider, firebaseConfigured } from "../firebase.js";

/** Human-readable messages for the errors users can actually hit. */
export function authErrorMessage(err) {
  const code = err?.code || "";
  if (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request")) return null; // user closed it: not an error
  if (code.includes("unauthorized-domain"))
    return `Этот домен ещё не разрешён для входа. Добавьте «${window.location.hostname}» в Firebase Console → Authentication → Settings → Authorized domains.`;
  if (code.includes("operation-not-allowed"))
    return "Этот способ входа выключен. Включите его в Firebase Console → Authentication → Sign-in method.";
  if (code.includes("network-request-failed")) return "Нет соединения. Проверьте интернет и попробуйте снова.";
  if (code.includes("too-many-requests")) return "Слишком много попыток. Подождите минуту.";
  if (code.includes("popup-blocked"))
    return "Окно входа Google заблокировано. Разрешите всплывающие окна для этого сайта и нажмите «Войти через Google» ещё раз.";
  if (code.includes("web-storage-unsupported"))
    return "Браузер блокирует хранилище, нужное для входа. Отключите приватный режим или блокировку cookie и попробуйте снова.";
  // Unknown: show the real reason, so problems are visible instead of a silent reset.
  return `Не удалось войти${code ? ` (${code})` : ""}. ${err?.message || "Попробуйте ещё раз."}`;
}

/** The useAuth() result, shared with every screen (Profile needs sign-out / link Google). */
export const AuthContext = createContext(null);
export const useAuthContext = () => useContext(AuthContext);

export function useAuth() {
  const [status, setStatus] = useState(firebaseConfigured ? "loading" : "unconfigured"); // loading | signedIn | signedOut | unconfigured
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Firebase mutates the same User object on link; bump this to re-render.
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (!auth) return undefined;
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setVersion((v) => v + 1);
      setStatus(u ? "signedIn" : "signedOut");
    });
  }, []);

  const run = useCallback(async (fn) => {
    setError(null);
    setBusy(true);
    try {
      return await fn();
    } catch (err) {
      setError(authErrorMessage(err));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const signInWithGoogle = useCallback(
    () =>
      // run() calls this synchronously, so signInWithPopup() opens within the user's tap.
      run(() => signInWithPopup(auth, googleProvider)),
    [run]
  );

  const signInAsGuest = useCallback(() => run(() => signInAnonymously(auth)), [run]);

  /**
   * Turn a guest account into a Google account.
   * Returns { linked: true } on success, or { conflict: credential } when that Google account
   * already exists (the caller then copies the guest's decks over — see App.jsx).
   */
  const linkGuestToGoogle = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      // Popup opened within the tap (see the note at the top of the file).
      await linkWithPopup(auth.currentUser, googleProvider);
      await auth.currentUser.reload();
      setUser(auth.currentUser);
      setVersion((v) => v + 1); // isAnonymous is now false
      return { linked: true };
    } catch (err) {
      if (err?.code === "auth/credential-already-in-use") {
        return { conflict: GoogleAuthProvider.credentialFromError(err) };
      }
      setError(authErrorMessage(err));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  /** Sign in with an existing Google credential (used after a link conflict). */
  const signInWithExistingCredential = useCallback((credential) => signInWithCredential(auth, credential), []);

  const signOut = useCallback(() => run(() => fbSignOut(auth)), [run]);

  return {
    status,
    user,
    error,
    busy,
    clearError: () => setError(null),
    signInWithGoogle,
    signInAsGuest,
    linkGuestToGoogle,
    signInWithExistingCredential,
    signOut,
  };
}
