/**
 * Authentication hook: Google, Apple, email + password, and anonymous "guest" mode.
 *
 * - Google / Apple: popup only (signInWithPopup / linkWithPopup / reauthenticateWithPopup),
 *   in the browser and in the installed PWA. No redirect flow: Safari partitions storage, so
 *   signInWithRedirect fails with "missing initial state", and in the iOS home-screen app a
 *   redirect opens in Safari and never returns.
 *   The popup must be opened synchronously inside the click handler — no `await` before
 *   signInWithPopup(), or iOS treats it as an unsolicited popup and blocks it. If it is blocked
 *   anyway, the user sees a message asking to allow popups.
 * - Email + password: sign in, sign up (with a display name) and "forgot password" e-mail.
 * - Profile: name and photo via updateProfile(); e-mail via verifyBeforeUpdateEmail() — the new
 *   address must be confirmed from a link (plain updateEmail() is rejected by projects with
 *   e-mail enumeration protection, the Firebase default). Sensitive changes can require a
 *   recent sign-in: reauthenticate() re-checks the password or opens the provider's popup.
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
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  linkWithPopup,
  signInWithCredential,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  updateProfile,
  verifyBeforeUpdateEmail,
  signOut as fbSignOut,
  EmailAuthProvider,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth, appleProvider, googleProvider, firebaseConfigured } from "../firebase.js";
import i18n from "../i18n/index.js";

const ERROR_KEYS = [
  ["unauthorized-domain", "unauthorizedDomain"],
  ["operation-not-allowed", "operationNotAllowed"],
  ["network-request-failed", "network"],
  ["too-many-requests", "tooManyRequests"],
  ["popup-blocked", "popupBlocked"],
  ["web-storage-unsupported", "storageBlocked"],
  ["invalid-credential", "wrongCredentials"],
  ["wrong-password", "wrongCredentials"],
  ["user-not-found", "wrongCredentials"],
  ["invalid-login-credentials", "wrongCredentials"],
  ["email-already-in-use", "emailInUse"],
  ["credential-already-in-use", "emailInUse"],
  ["account-exists-with-different-credential", "differentProvider"],
  ["invalid-email", "invalidEmail"],
  ["missing-email", "invalidEmail"],
  ["weak-password", "weakPassword"],
  ["missing-password", "weakPassword"],
  ["requires-recent-login", "recentLogin"],
  ["user-mismatch", "userMismatch"],
];

/** Human-readable messages for the errors users can actually hit (null = not worth showing). */
export function authErrorMessage(err) {
  const code = err?.code || "";
  if (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request")) return null; // user closed it: not an error
  const known = ERROR_KEYS.find(([part]) => code.includes(part));
  if (known) return i18n.t(`auth.errors.${known[1]}`, { host: window.location.hostname });
  // Unknown: show the real reason, so problems are visible instead of a silent reset.
  return i18n.t("auth.errors.unknown", { code: code ? ` (${code})` : "", message: err?.message || "" }).trim();
}

/** The useAuth() result, shared with every screen (Profile needs sign-out / link Google). */
export const AuthContext = createContext(null);
export const useAuthContext = () => useContext(AuthContext);

/** How the current user signs in: "password" | "google.com" | "apple.com" | null (guest). */
export function signInMethod(user) {
  const ids = (user?.providerData || []).map((p) => p.providerId);
  return ["password", "google.com", "apple.com"].find((id) => ids.includes(id)) || null;
}

export function useAuth() {
  const [status, setStatus] = useState(firebaseConfigured ? "loading" : "unconfigured"); // loading | signedIn | signedOut | unconfigured
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Firebase mutates the same User object on link / profile update; bump this to re-render.
  const [, setVersion] = useState(0);
  const refresh = useCallback(() => {
    setUser(auth.currentUser);
    setVersion((v) => v + 1);
  }, []);

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

  // run() calls fn synchronously, so the popup opens within the user's tap.
  const signInWithGoogle = useCallback(() => run(() => signInWithPopup(auth, googleProvider)), [run]);
  const signInWithApple = useCallback(() => run(() => signInWithPopup(auth, appleProvider)), [run]);

  const signInWithEmail = useCallback((email, password) => run(() => signInWithEmailAndPassword(auth, email.trim(), password)), [run]);

  const signUpWithEmail = useCallback(
    (email, password, displayName) =>
      run(async () => {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (displayName?.trim()) {
          await updateProfile(cred.user, { displayName: displayName.trim() });
          refresh();
        }
        return cred;
      }),
    [run, refresh]
  );

  /** "Forgot password": true when the e-mail was sent (errors go to `error`). */
  const resetPassword = useCallback((email) => run(async () => (await sendPasswordResetEmail(auth, email.trim()), true)), [run]);

  const signInAsGuest = useCallback(() => run(() => signInAnonymously(auth)), [run]);

  /**
   * Turn a guest account into a Google account.
   * Returns { linked: true } on success, or { conflict: credential } when that Google account
   * already exists (the caller then copies the guest's decks over — see src/data/merge.js).
   */
  const linkGuestToGoogle = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      // Popup opened within the tap (see the note at the top of the file).
      await linkWithPopup(auth.currentUser, googleProvider);
      await auth.currentUser.reload();
      refresh(); // isAnonymous is now false
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
  }, [refresh]);

  /** Sign in with an existing Google credential (used after a link conflict). */
  const signInWithExistingCredential = useCallback((credential) => signInWithCredential(auth, credential), []);

  /* ---------- profile (errors are thrown to the caller, which shows them in its form) ---------- */

  const updateUserProfile = useCallback(
    async ({ displayName, photoURL }) => {
      await updateProfile(auth.currentUser, { displayName: displayName.trim() || null, photoURL: photoURL.trim() || null });
      refresh();
    },
    [refresh]
  );

  /** Sends a confirmation link to the new address; the e-mail changes after it is opened. */
  const changeEmail = useCallback((newEmail) => verifyBeforeUpdateEmail(auth.currentUser, newEmail.trim()), []);

  /** Re-check who it is before a sensitive change (password, or the provider's popup). */
  const reauthenticate = useCallback((password) => {
    const u = auth.currentUser;
    const method = signInMethod(u);
    if (method === "password") return reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
    return reauthenticateWithPopup(u, method === "apple.com" ? appleProvider : googleProvider);
  }, []);

  const signOut = useCallback(() => run(() => fbSignOut(auth)), [run]);

  return {
    status,
    user,
    error,
    busy,
    clearError: () => setError(null),
    signInWithGoogle,
    signInWithApple,
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    signInAsGuest,
    linkGuestToGoogle,
    signInWithExistingCredential,
    updateUserProfile,
    changeEmail,
    reauthenticate,
    signOut,
  };
}
