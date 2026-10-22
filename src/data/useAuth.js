/**
 * Authentication hook: Google sign-in + anonymous "guest" mode.
 *
 * - Desktop / browser tab:  Google via popup (falls back to redirect if popups are blocked).
 * - Installed PWA (iOS/Android home-screen app): Google via redirect, because popups are
 *   unreliable in standalone mode. See netlify.toml for the optional auth-domain proxy that
 *   makes redirects reliable on Safari.
 * - Guest: anonymous account, data still syncs to Firestore. Guests can later "upgrade" to
 *   Google; the account is linked, so the uid and all decks are kept.
 */
import { useCallback, useEffect, useState } from "react";
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
    return `This domain isn't allowed to sign in yet. Add "${window.location.hostname}" in Firebase Console → Authentication → Settings → Authorized domains.`;
  if (code.includes("operation-not-allowed"))
    return "This sign-in method is turned off. Enable it in Firebase Console → Authentication → Sign-in method.";
  if (code.includes("network-request-failed")) return "No connection. Check your internet and try again.";
  if (code.includes("too-many-requests")) return "Too many attempts. Wait a minute and try again.";
  return err?.message || "Sign-in failed. Please try again.";
}

const POPUP_FALLBACK_CODES = ["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"];

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

    // Finish a redirect sign-in / link (PWA flow).
    getRedirectResult(auth).catch((err) => {
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
      run(async () => {
        if (isStandalone()) return signInWithRedirect(auth, googleProvider);
        try {
          return await signInWithPopup(auth, googleProvider);
        } catch (err) {
          if (POPUP_FALLBACK_CODES.includes(err?.code)) return signInWithRedirect(auth, googleProvider);
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
      if (isStandalone()) {
        await linkWithRedirect(auth.currentUser, googleProvider);
        return { redirecting: true };
      }
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
