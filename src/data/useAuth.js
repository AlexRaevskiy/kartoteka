/**
 * Authentication hook: Google sign-in + anonymous "guest" mode.
 *
 * - Google: popup everywhere, including the installed PWA. On iOS a redirect leaves the app's
 *   scope (firebaseapp.com → Google), so it opens in Safari, and Safari's third-party storage
 *   blocking makes getRedirectResult() come back empty → the user lands on the sign-in screen
 *   again. A popup stays attached to the app and reports back to it.
 *   The popup must be opened synchronously inside the click handler — no `await` before
 *   signInWithPopup(), or iOS treats it as an unsolicited popup and blocks it.
 * - Redirect is only a fallback when the popup is blocked, and only where it can come back:
 *   in a regular browser tab, or when the auth domain is proxied through our own domain
 *   (netlify.toml → /__/auth/*).
 * - Persistence is set once in src/firebase.js (initializeAuth: IndexedDB, then localStorage),
 *   so the session survives PWA restarts without calling setPersistence() before each sign-in.
 * - Guest: anonymous account, data still syncs to Firestore. Guests can later "upgrade" to
 *   Google; the account is linked, so the uid and all decks are kept.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInAnonymously,
  linkWithPopup,
  linkWithRedirect,
  signInWithCredential,
  signOut as fbSignOut,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth, googleProvider, firebaseConfigured } from "../firebase.js";
import { isStandalone } from "../lib/utils.js";

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
  if (code === REDIRECT_LOST)
    return "Вход через Google не завершился: браузер не вернул результат. Попробуйте ещё раз — окно входа откроется поверх приложения.";
  // Unknown: show the real reason, so problems are visible instead of a silent reset.
  return `Не удалось войти${code ? ` (${code})` : ""}. ${err?.message || "Попробуйте ещё раз."}`;
}

/** The useAuth() result, shared with every screen (Profile needs sign-out / link Google). */
export const AuthContext = createContext(null);
export const useAuthContext = () => useContext(AuthContext);

const POPUP_FALLBACK_CODES = ["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"];

/** Pseudo error code: we started a redirect, but the app came back without a result. */
const REDIRECT_LOST = "app/redirect-result-lost";
const REDIRECT_FLAG = "kartoteka.authRedirectStarted";

/** Redirect can return to the app only from a browser tab, or when auth runs on our own domain. */
function redirectCanReturn() {
  return !isStandalone() || auth?.config?.authDomain === window.location.host;
}

function markRedirect(on) {
  try {
    if (on) sessionStorage.setItem(REDIRECT_FLAG, "1");
    else sessionStorage.removeItem(REDIRECT_FLAG);
  } catch {
    /* storage blocked: we just can't detect a lost redirect */
  }
}

function redirectWasStarted() {
  try {
    return sessionStorage.getItem(REDIRECT_FLAG) === "1";
  } catch {
    return false;
  }
}

export function useAuth() {
  const [status, setStatus] = useState(firebaseConfigured ? "loading" : "unconfigured"); // loading | signedIn | signedOut | unconfigured
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Set when a guest tried to link a Google account that already has its own data.
  const [pendingMerge, setPendingMerge] = useState(null);
  // Firebase mutates the same User object on link; bump this to re-render.
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (!auth) return undefined;

    // Finish a redirect sign-in / link (fallback flow) when the app reloads after it.
    const expectedRedirect = redirectWasStarted();
    markRedirect(false);
    getRedirectResult(auth)
      .then((result) => {
        // We sent the user to Google, but nothing came back and nobody is signed in:
        // say so instead of silently showing the sign-in screen again.
        if (expectedRedirect && !result && !auth.currentUser) setError(authErrorMessage({ code: REDIRECT_LOST }));
      })
      .catch((err) => {
        if (err?.code === "auth/credential-already-in-use") {
          setPendingMerge(GoogleAuthProvider.credentialFromError(err));
        } else {
          setError(authErrorMessage(err));
        }
      });

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
      run(async () => {
        try {
          return await signInWithPopup(auth, googleProvider);
        } catch (err) {
          if (POPUP_FALLBACK_CODES.includes(err?.code) && redirectCanReturn()) {
            markRedirect(true);
            return signInWithRedirect(auth, googleProvider);
          }
          throw err;
        }
      }),
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
      try {
        // Popup first, opened within the tap (see the note at the top of the file).
        await linkWithPopup(auth.currentUser, googleProvider);
      } catch (err) {
        if (!(POPUP_FALLBACK_CODES.includes(err?.code) && redirectCanReturn())) throw err;
        markRedirect(true);
        await linkWithRedirect(auth.currentUser, googleProvider);
        return { redirecting: true };
      }
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
  const signInWithExistingCredential = useCallback(async (credential) => {
    setPendingMerge(null);
    return signInWithCredential(auth, credential);
  }, []);

  const signOut = useCallback(() => run(() => fbSignOut(auth)), [run]);

  return {
    status,
    user,
    error,
    busy,
    pendingMerge,
    clearError: () => setError(null),
    signInWithGoogle,
    signInAsGuest,
    linkGuestToGoogle,
    signInWithExistingCredential,
    signOut,
  };
}
