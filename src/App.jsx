/**
 * Kartoteka — app root & routes
 * ============================================================================
 *
 *  /                     Home        streak widget · continue studying · folders · my sets   (bottom nav)
 *  /profile              Profile     account · daily goal · reminders · theme · backup       (bottom nav)
 *  /create               Editor      new flashcard set (full screen)
 *  /deck/:id             Deck        carousel · modes · progress · terms list (shareable link)
 *  /deck/:id/edit        Editor      edit set
 *  /deck/:id/study       Study       full-screen rounds (?mode=flashcards|quiz|write|learn&goal=memorize|cram&starred=1)
 *  /folder/:id           Folder      search · tags · sort · Study All (shareable link)
 *  /folder/:id/study     Study       all cards of the folder in one session (?tag=<tagId>)
 *
 *  Auth gate: Setup (no Firebase env) → Splash → Sign-in → LibraryProvider (live Firestore data).
 *  Shared links work after sign-in: the URL is kept while the user logs in.
 */
import React, { useCallback, useEffect, useRef } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { AlertTriangle, BellRing, Info } from "lucide-react";

import { AuthContext, useAuth } from "./data/useAuth.js";
import { LibraryProvider, useLibrary } from "./data/LibraryProvider.jsx";
import { mergeGuestInto } from "./data/merge.js";
import { DialogProvider, ToastProvider, useToast } from "./components/providers.jsx";
import { IOSInstallHint, UpdatePrompt } from "./components/PwaPrompts.jsx";
import { AuthScreen, LibraryError, SetupScreen, Splash } from "./components/screens.jsx";
import BottomNav from "./components/BottomNav.jsx";
import { onForegroundPush } from "./lib/push.js";
import { warmUpVoices } from "./lib/speech.js";

import HomeScreen from "./screens/HomeScreen.jsx";
import ProfileScreen from "./screens/ProfileScreen.jsx";
import DeckScreen from "./screens/DeckScreen.jsx";
import FolderScreen from "./screens/FolderScreen.jsx";
import EditorScreen from "./screens/EditorScreen.jsx";
import StudyScreen from "./screens/StudyScreen.jsx";

export default function App() {
  const auth = useAuth();
  return (
    <AuthContext.Provider value={auth}>
      <ToastProvider>
        <DialogProvider>
          <Gate auth={auth} />
          <UpdatePrompt />
        </DialogProvider>
      </ToastProvider>
    </AuthContext.Provider>
  );
}

function Gate({ auth }) {
  const toast = useToast();
  const onError = useCallback((message, opts) => toast(message, { icon: opts?.info ? Info : AlertTriangle, duration: 7000 }), [toast]);

  useEffect(() => {
    if (auth.error) toast(auth.error, { icon: AlertTriangle, duration: 7000 });
  }, [auth.error, toast]);

  if (auth.status === "unconfigured") return <SetupScreen />;
  if (auth.status === "loading") return <Splash />;
  if (auth.status === "signedOut") return <AuthScreen auth={auth} />;
  return (
    <LibraryProvider key={auth.user.uid} user={auth.user} onError={onError}>
      <Workspace auth={auth} />
    </LibraryProvider>
  );
}

/* ---------- theme: <html data-theme> + status bar colour ---------- */
function useThemeSync(theme) {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme");
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      const dark = theme === "dark" || (theme !== "light" && m.media.includes("dark"));
      m.setAttribute("content", dark ? "#121318" : "#FBF8FF");
    });
  }, [theme]);
}

function Workspace({ auth }) {
  const lib = useLibrary();
  const toast = useToast();
  const location = useLocation();
  useThemeSync(lib.settings.theme);
  useEffect(() => {
    warmUpVoices();
  }, []);

  // Scroll to top on navigation (study screens manage their own scroll).
  // Braces matter: newer browsers return a Promise from scrollTo(), and React would treat a
  // returned value as the effect's cleanup and crash calling it ("… is not a function").
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // Reminders that arrive while the app is open → snackbar.
  useEffect(() => {
    let off = () => {};
    onForegroundPush((body) => body && toast(body, { icon: BellRing, duration: 8000 })).then((fn) => (off = fn));
    return () => off();
  }, [toast]);

  // Guest → existing Google account (redirect flow in the installed app).
  const merging = useRef(false);
  useEffect(() => {
    if (!auth.pendingMerge || lib.status !== "ready" || !auth.user.isAnonymous || merging.current) return;
    merging.current = true;
    mergeGuestInto(auth, lib, auth.pendingMerge, toast);
  }, [auth, lib, toast]);

  if (lib.status === "error") return <LibraryError message={lib.error} />;
  if (lib.status !== "ready") return <Splash label="Загружаем ваши наборы…" />;

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<HomeScreen />} />
        <Route path="profile" element={<ProfileScreen />} />
      </Route>
      <Route path="create" element={<EditorScreen />} />
      <Route path="deck/:id" element={<DeckScreen />} />
      <Route path="deck/:id/edit" element={<EditorScreen />} />
      <Route path="deck/:id/study" element={<StudyScreen kind="deck" />} />
      <Route path="folder/:id" element={<FolderScreen />} />
      <Route path="folder/:id/study" element={<StudyScreen kind="folder" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/** Top-level destinations get the bottom navigation bar (M3 pattern). */
function Shell() {
  return (
    <div className="min-h-screen" style={{ paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}>
      <Outlet />
      <IOSInstallHint />
      <BottomNav />
    </div>
  );
}
