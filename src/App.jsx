/**
 * Kartoteka — App shell
 * ============================================================================
 *
 *   App
 *    ├─ auth gate ............ SetupScreen | Splash | AuthScreen | Workspace   (src/data/useAuth.js)
 *    ├─ UpdatePrompt ......... "new version" bar from the service worker      (src/components/PwaPrompts.jsx)
 *    └─ Toasts ............... app-wide notifications (survive account switches)
 *
 *   Workspace (one signed-in user)
 *    ├─ useLibrary ........... decks + settings + log, live-synced with Firestore (src/data/useLibrary.js)
 *    ├─ Header ............... sync status, import, account menu (export / restore / theme / sign out)
 *    ├─ DeckRail ............. deck list
 *    ├─ BoxProgress .......... five Leitner compartments for the active deck
 *    └─ Tabs
 *         ├─ Flashcards / Quiz / Write → StudyShell (src/components/study/*)
 *         └─ Cards → CardsManager
 *
 * Where the logic lives:
 *   Leitner scheduling ........ src/lib/leitner.js
 *   Levenshtein + smart grading  src/lib/levenshtein.js   (used by study/WriteMode.jsx + DiffView.jsx)
 *   Quick-import parser ....... src/lib/parser.js
 *   JSON export / restore ..... src/lib/backup.js
 *   Firestore reads/writes .... src/data/store.js
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Layers, Library, ListChecks, PenLine, Sparkles } from "lucide-react";

import { useAuth } from "./data/useAuth.js";
import { useLibrary, copyDecksToUser } from "./data/useLibrary.js";
import { useInstallPrompt } from "./hooks/useInstallPrompt.js";

import { deckStats, dateKey, streakFrom } from "./lib/leitner.js";
import { celebrate } from "./lib/celebrate.js";
import { speak, warmUpVoices } from "./lib/speech.js";
import { buildBackup, backupFilename, downloadJSON, readBackup } from "./lib/backup.js";
import { uid as makeId } from "./lib/model.js";
import { isIOS } from "./lib/utils.js";

import Header from "./components/Header.jsx";
import DeckRail from "./components/DeckRail.jsx";
import BoxProgress from "./components/BoxProgress.jsx";
import StudyShell from "./components/study/StudyShell.jsx";
import CardsManager from "./components/CardsManager.jsx";
import ImportDialog from "./components/ImportDialog.jsx";
import { InstallBanner, UpdatePrompt } from "./components/PwaPrompts.jsx";
import { Modal, Toasts } from "./components/ui.jsx";
import { AuthScreen, EmptyLibrary, LibraryError, LibrarySkeleton, SetupScreen, Splash } from "./components/screens.jsx";

/* ------------------------------------------------------------------------- */
/* Toasts                                                                     */
/* ------------------------------------------------------------------------- */
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const toast = useCallback(
    (text, { icon, action, duration = 3600 } = {}) => {
      const id = makeId();
      setToasts((list) => [...list.slice(-2), { id, text, icon, action }]);
      if (duration) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );
  return { toasts, toast, dismiss };
}

/* ------------------------------------------------------------------------- */
/* Root                                                                       */
/* ------------------------------------------------------------------------- */
export default function App() {
  const auth = useAuth();
  const { toasts, toast, dismiss } = useToasts();

  let screen;
  if (auth.status === "unconfigured") screen = <SetupScreen />;
  else if (auth.status === "loading") screen = <Splash />;
  else if (auth.status === "signedOut") screen = <AuthScreen auth={auth} />;
  else screen = <Workspace key={auth.user.uid} auth={auth} toast={toast} />;

  return (
    <>
      {screen}
      <UpdatePrompt />
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </>
  );
}

/* ------------------------------------------------------------------------- */
/* Theme: <html data-theme> + browser UI colour                               */
/* ------------------------------------------------------------------------- */
function useTheme(theme) {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme");
    // Keep the status-bar colour in sync with the chosen theme.
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      if (theme === "light") m.setAttribute("content", "#EEF0F4");
      else if (theme === "dark") m.setAttribute("content", "#0E1117");
      else m.setAttribute("content", m.media.includes("dark") ? "#0E1117" : "#EEF0F4");
    });
  }, [theme]);
}

/** "now", refreshed every minute and when the app comes back to the foreground (midnight rollover). */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t = setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, []);
  return now;
}

const TABS = [
  { id: "flashcards", label: "Flashcards", icon: Layers },
  { id: "quiz", label: "Quiz", icon: ListChecks },
  { id: "write", label: "Write", icon: PenLine },
  { id: "cards", label: "Cards", icon: Library },
];

/* ------------------------------------------------------------------------- */
/* Workspace: everything for one signed-in user                               */
/* ------------------------------------------------------------------------- */
function Workspace({ auth, toast }) {
  const { user } = auth;
  const library = useLibrary(user, {
    onError: (message) => toast(message, { icon: AlertTriangle, duration: 7000 }),
  });
  const { decks, settings, log, actions, status, sync } = library;

  const now = useNow();
  const install = useInstallPrompt();
  useTheme(settings.theme);
  useEffect(warmUpVoices, []);

  const [tab, setTab] = useState("flashcards");
  const [scope, setScope] = useState("due");
  const [dialog, setDialog] = useState(null); // { kind: "new" | "append", focus } | { kind: "restore", backup }
  const [menuOpen, setMenuOpen] = useState(false);
  const [celebration, setCelebration] = useState(null);

  /* ----- active deck (remembered in Firestore so it follows you across devices) ----- */
  const activeId = decks.some((d) => d.id === settings.activeDeckId) ? settings.activeDeckId : decks[0]?.id ?? null;
  const deck = decks.find((d) => d.id === activeId) || null;
  const stats = useMemo(() => (deck ? deckStats(deck, now) : null), [deck, now]);

  const switchDeck = (id) => {
    if (id === activeId) return;
    actions.updateSettings({ activeDeckId: id });
    setScope("due");
  };

  /* ----- study callbacks ----- */
  const onGrade = useCallback(
    (cardId, grade) => {
      if (!deck) return;
      const res = actions.gradeCard(deck.id, cardId, grade);
      if (res && res.before.box === 4 && res.after.box === 5) {
        celebrate("card");
        toast(`“${res.before.term}” is mastered`, { icon: Sparkles });
      }
    },
    [deck, actions, toast]
  );
  const onLog = useCallback(() => actions.logReview(), [actions]);
  const onComplete = useCallback((session) => deck && setCelebration({ deckId: deck.id, tracked: session.tracked }), [deck]);

  // Celebrate after the last grade has landed in state.
  useEffect(() => {
    if (!celebration) return;
    const d = decks.find((x) => x.id === celebration.deckId);
    setCelebration(null);
    if (!d) return;
    const s = deckStats(d, Date.now());
    if (s.total > 0 && s.mastered === s.total) {
      celebrate("mastery");
      toast("Every card is in Box 5. Deck mastered!", { icon: Sparkles });
    } else if (celebration.tracked && s.due === 0) {
      celebrate("due");
      toast("All of today's reviews are done", { icon: Sparkles });
    } else {
      celebrate("card");
    }
  }, [celebration, decks, toast]);

  const onSpeak = useCallback(
    (text) => {
      const r = speak(text);
      if (r.message) toast(r.message, { duration: 5000 });
    },
    [toast]
  );

  /* ----- decks ----- */
  const createDeck = (name, cards) => {
    const id = actions.createDeck({ name, cards });
    actions.updateSettings({ activeDeckId: id });
    setScope("due");
    setTab(cards.length ? "flashcards" : "cards");
    toast(cards.length ? `Created “${name}” with ${cards.length} cards` : `Created “${name}”. Add some cards.`, { icon: Sparkles });
  };

  const appendCards = (cards) => {
    const added = actions.addCards(deck.id, cards);
    toast(`Added ${added} card${added === 1 ? "" : "s"}`);
  };

  const deleteDeck = () => {
    const name = deck.name;
    actions.deleteDeck(deck.id);
    setTab("flashcards");
    toast(`Deleted “${name}”`);
  };

  /* ----- backup: export ----- */
  const exportData = async () => {
    const data = buildBackup({ user, settings, log, decks });
    const filename = backupFilename();
    // iPhone/iPad (especially the installed app): the share sheet is the reliable way to save a file.
    if (isIOS() && navigator.canShare) {
      const file = new File([JSON.stringify(data, null, 2)], filename, { type: "application/json" });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "Kartoteka backup" });
          return;
        } catch (err) {
          if (err?.name === "AbortError") return;
        }
      }
    }
    downloadJSON(data, filename);
    const cards = decks.reduce((n, d) => n + d.cards.length, 0);
    toast(`Exported ${decks.length} deck${decks.length === 1 ? "" : "s"}, ${cards} cards`);
  };

  /* ----- backup: restore ----- */
  const pickRestoreFile = async (file) => {
    try {
      const backup = readBackup(JSON.parse(await file.text()));
      setDialog({ kind: "restore", backup, filename: file.name });
    } catch (err) {
      toast(err instanceof SyntaxError ? "That file isn't valid JSON." : err.message, { icon: AlertTriangle, duration: 6000 });
    }
  };
  const confirmRestore = async () => {
    const { backup } = dialog;
    setDialog(null);
    try {
      const n = await actions.importDecks(backup.decks, backup.log);
      toast(`Restored ${n} deck${n === 1 ? "" : "s"}`, { icon: Sparkles });
    } catch (err) {
      toast(err.message || "Restore failed.", { icon: AlertTriangle, duration: 6000 });
    }
  };

  /* ----- guest → Google ----- */
  const mergeGuestInto = useCallback(
    async (credential) => {
      // That Google account already exists: sign into it and copy this guest's decks over.
      const guestDecks = decks;
      const guestLog = log;
      try {
        const result = await auth.signInWithExistingCredential(credential);
        if (guestDecks.length) await copyDecksToUser(result.user.uid, guestDecks, guestLog, null);
        toast(guestDecks.length ? `Signed in. ${guestDecks.length} guest deck${guestDecks.length === 1 ? " was" : "s were"} added to your account.` : "Signed in.", {
          icon: Sparkles,
          duration: 6000,
        });
      } catch (err) {
        toast(err.message || "Couldn't switch accounts.", { icon: AlertTriangle, duration: 6000 });
      }
    },
    [auth, decks, log, toast]
  );

  const linkGoogle = async () => {
    const res = await auth.linkGuestToGoogle();
    if (res?.linked) toast("Saved. Sign in with Google on any device to see your decks.", { icon: Sparkles, duration: 6000 });
    else if (res?.conflict) await mergeGuestInto(res.conflict);
  };

  // Redirect flow (installed app): finish a pending merge once the guest's library has loaded.
  const mergeStarted = useRef(false);
  useEffect(() => {
    if (auth.pendingMerge && status === "ready" && user.isAnonymous && !mergeStarted.current) {
      mergeStarted.current = true;
      mergeGuestInto(auth.pendingMerge);
    }
  }, [auth.pendingMerge, status, user, mergeGuestInto]);

  useEffect(() => {
    if (auth.error) toast(auth.error, { icon: AlertTriangle, duration: 7000 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.error]);

  /* ----- render ----- */
  const streak = streakFrom(log, now);
  const today = log[dateKey(now)] || 0;
  const keyboardEnabled = !dialog && !menuOpen;

  let main;
  if (status === "error") main = <LibraryError message={library.error} />;
  else if (status !== "ready") main = <LibrarySkeleton />;
  else
    main = (
      <div className="mx-auto max-w-6xl grid gap-6 lg:grid-cols-12 py-5 lg:py-8">
        {!settings.installHintDismissed ? (
          <div className="lg:col-span-12 min-w-0">
            <InstallBanner install={install} onDismiss={() => actions.updateSettings({ installHintDismissed: true })} />
          </div>
        ) : null}

        <aside className="lg:col-span-4 xl:col-span-3 min-w-0">
          <DeckRail
            decks={decks}
            activeId={activeId}
            now={now}
            onSwitch={switchDeck}
            onNew={() => setDialog({ kind: "new", focus: "name" })}
            onPaste={() => setDialog({ kind: "new", focus: "text" })}
          />
        </aside>

        <section className="lg:col-span-8 xl:col-span-9 min-w-0 flex flex-col gap-5">
          {!deck ? (
            <EmptyLibrary onPaste={() => setDialog({ kind: "new", focus: "text" })} onNew={() => setDialog({ kind: "new", focus: "name" })} />
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <h1 className="fc-display text-2xl sm:text-3xl font-extrabold leading-tight" style={{ overflowWrap: "anywhere" }}>
                    {deck.name}
                  </h1>
                  {deck.description ? <p className="fc-muted text-sm mt-1 max-w-prose">{deck.description}</p> : null}
                </div>
                <div className="fc-muted text-sm fc-mono">{deck.cards.length} cards</div>
              </div>

              <BoxProgress stats={stats} />

              <div role="tablist" aria-label="Study mode" className="fc-seg flex gap-1">
                {TABS.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      role="tab"
                      type="button"
                      id={`tab-${t.id}`}
                      aria-selected={tab === t.id}
                      aria-controls="study-panel"
                      className="fc-tab flex-1 inline-flex items-center justify-center gap-2 px-2 py-2 text-sm whitespace-nowrap"
                      onClick={() => setTab(t.id)}
                    >
                      <Icon size={16} className="hidden sm:block" />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              <div id="study-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-w-0">
                {tab === "cards" ? (
                  <CardsManager
                    deck={deck}
                    now={now}
                    actions={actions}
                    onDeleteDeck={deleteDeck}
                    onPaste={() => setDialog({ kind: "append", focus: "text" })}
                    onSpeak={onSpeak}
                    toast={toast}
                  />
                ) : (
                  <StudyShell
                    key={`${tab}-${deck.id}`}
                    mode={tab}
                    deck={deck}
                    stats={stats}
                    now={now}
                    scope={scope}
                    setScope={setScope}
                    reverse={!!settings.reverse}
                    setReverse={(reverse) => actions.updateSettings({ reverse })}
                    keyboardEnabled={keyboardEnabled}
                    onGrade={onGrade}
                    onLog={onLog}
                    onComplete={onComplete}
                    onSpeak={onSpeak}
                    goManage={() => setTab("cards")}
                    onPaste={() => setDialog({ kind: "append", focus: "text" })}
                  />
                )}
              </div>
            </>
          )}
        </section>
      </div>
    );

  return (
    <div className="min-h-screen">
      <Header
        user={user}
        sync={status === "ready" ? sync : "connecting"}
        streak={streak}
        today={today}
        theme={settings.theme}
        onTheme={(theme) => actions.updateSettings({ theme })}
        onImport={() => setDialog({ kind: "new", focus: "text" })}
        onExport={exportData}
        onRestore={pickRestoreFile}
        onLinkGoogle={linkGoogle}
        onSignOut={auth.signOut}
        install={install}
        onMenuOpenChange={setMenuOpen}
      />
      {/* overflow-x: clip keeps a swiped card from creating sideways scroll (without breaking the sticky header) */}
      <main className="fc-gutter" style={{ overflowX: "clip" }}>
        {main}
      </main>

      {dialog && (dialog.kind === "new" || dialog.kind === "append") ? (
        <ImportDialog
          kind={dialog.kind === "append" && deck ? "append" : "new"}
          focus={dialog.focus}
          deck={deck}
          onClose={() => setDialog(null)}
          onCreate={(name, cards) => {
            createDeck(name, cards);
            setDialog(null);
          }}
          onAppend={(cards) => {
            appendCards(cards);
            setDialog(null);
          }}
        />
      ) : null}

      {dialog?.kind === "restore" ? (
        <Modal
          title="Restore from backup"
          subtitle={dialog.filename}
          labelId="restore-title"
          onClose={() => setDialog(null)}
          footer={
            <>
              <button type="button" className="fc-btn fc-btn-ghost px-4 py-2.5" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button type="button" className="fc-btn fc-btn-primary px-4 py-2.5" onClick={confirmRestore}>
                Add {dialog.backup.decks.length} deck{dialog.backup.decks.length === 1 ? "" : "s"}
              </button>
            </>
          }
        >
          <p className="text-sm">
            These decks will be <b>added</b> to your library with their Leitner progress. Nothing you have now is overwritten.
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {dialog.backup.decks.slice(0, 20).map((d, i) => (
              <li key={i} className="flex justify-between gap-3 fc-surface2 rounded-lg px-3 py-2">
                <span className="font-bold min-w-0 truncate">{d.name}</span>
                <span className="fc-mono fc-muted shrink-0">{d.cards.length} cards</span>
              </li>
            ))}
            {dialog.backup.decks.length > 20 ? <li className="fc-muted text-xs">…and {dialog.backup.decks.length - 20} more</li> : null}
          </ul>
        </Modal>
      ) : null}
    </div>
  );
}
