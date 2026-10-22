/**
 * Wraps every study mode: scope toggle (due / all), reverse toggle, progress bar,
 * and the empty / caught-up / session-complete screens.
 */
import React, { useState } from "react";
import { ArrowLeftRight, BookOpen, CalendarClock, ListChecks, Plus, RotateCcw, Trophy, Upload } from "lucide-react";
import { useStudySession } from "../../hooks/useStudySession.js";
import { relativeDay } from "../../lib/leitner.js";
import { EmptyPanel, Switch } from "../ui.jsx";
import FlashcardMode from "./FlashcardMode.jsx";
import QuizMode from "./QuizMode.jsx";
import WriteMode from "./WriteMode.jsx";
import { cx } from "../../lib/utils.js";

function Stat({ label, value, tone }) {
  return (
    <div className="fc-surface2 rounded-xl py-3">
      <div className={cx("fc-mono text-2xl font-bold", tone === "good" && "fc-good", tone === "warn" && "fc-warn")}>{value}</div>
      <div className="text-xs fc-muted">{label}</div>
    </div>
  );
}

export default function StudyShell({
  mode,
  deck,
  stats,
  now,
  scope,
  setScope,
  reverse,
  setReverse,
  keyboardEnabled,
  onGrade,
  onLog,
  onComplete,
  onSpeak,
  goManage,
  onPaste,
}) {
  const [restartKey, setRestartKey] = useState(0);
  const { session, card, answer, done, seenCount, retries } = useStudySession(deck, scope, `${mode}-${restartKey}`, {
    onGrade,
    onLog,
    onComplete,
  });

  if (deck.cards.length === 0) {
    return (
      <EmptyPanel
        icon={BookOpen}
        title="This deck has no cards yet"
        body="Paste a word list or add cards one by one."
        actions={
          <>
            <button type="button" className="fc-btn fc-btn-primary px-4 py-2.5" onClick={onPaste}>
              <Upload size={16} /> Paste a list
            </button>
            <button type="button" className="fc-btn fc-btn-ghost px-4 py-2.5" onClick={goManage}>
              <Plus size={16} /> Add cards
            </button>
          </>
        }
      />
    );
  }
  if (mode === "quiz" && deck.cards.length < 2) {
    return (
      <EmptyPanel
        icon={ListChecks}
        title="Quiz needs at least 2 cards"
        body="Wrong answers are taken from other cards in the deck."
        actions={
          <button type="button" className="fc-btn fc-btn-primary px-4 py-2.5" onClick={goManage}>
            <Plus size={16} /> Add cards
          </button>
        }
      />
    );
  }

  const toolbar = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 justify-between">
      <div className="fc-seg inline-flex" role="group" aria-label="Which cards to study">
        <button type="button" aria-pressed={scope === "due"} className="px-2.5 sm:px-3 py-1.5 text-sm" onClick={() => setScope("due")}>
          Due today <span className="fc-mono ml-1">{stats.due}</span>
        </button>
        <button type="button" aria-pressed={scope === "all"} className="px-2.5 sm:px-3 py-1.5 text-sm" onClick={() => setScope("all")}>
          All cards <span className="fc-mono ml-1">{stats.total}</span>
        </button>
      </div>
      <label htmlFor="reverse-switch" className="inline-flex items-center gap-2.5 text-sm font-bold cursor-pointer select-none">
        <ArrowLeftRight size={15} className="fc-muted" />
        <span>
          <span className="sr-only">Reverse mode. Currently: </span>
          <span className="sm:hidden">Reverse</span>
          <span className="hidden sm:inline">{reverse ? "Definition → Term" : "Term → Definition"}</span>
        </span>
        <Switch id="reverse-switch" checked={reverse} onChange={setReverse} label="Reverse mode: study definition first" />
      </label>
    </div>
  );

  let body = null;
  if (session.total === 0) {
    body = (
      <EmptyPanel
        icon={CalendarClock}
        tone="good"
        title="Nothing due today"
        body={
          stats.nextDue
            ? `Next review ${relativeDay(stats.nextDue, now)}: ${stats.nextDueCount} card${stats.nextDueCount === 1 ? "" : "s"}. You can still practise without changing the schedule.`
            : "Every card in this deck is mastered. You can still practise them."
        }
        actions={
          <button type="button" className="fc-btn fc-btn-primary px-4 py-2.5" onClick={() => setScope("all")}>
            <RotateCcw size={16} /> Practise all cards
          </button>
        }
      />
    );
  } else if (done) {
    const accuracy = session.total ? Math.round((session.know / session.total) * 100) : 0;
    body = (
      <div className="fc-panel p-6 sm:p-8 text-center fc-in">
        <div className="fc-pop mx-auto w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "var(--good-soft)" }}>
          <Trophy size={26} className="fc-good" />
        </div>
        <h2 className="fc-display text-2xl font-extrabold mt-4">{session.tracked ? "Today's reviews are done" : "Practice round complete"}</h2>
        <p className="fc-muted mt-1 max-w-md mx-auto">
          {session.tracked
            ? "Cards you knew moved up a box. Missed cards are back in Box 1 for tomorrow."
            : "Practice doesn't change the schedule. Switch to Due today for tracked reviews."}
        </p>
        <div className="grid grid-cols-3 gap-2 sm:gap-3 max-w-sm mx-auto mt-6">
          <Stat label="Knew" value={session.know} tone="good" />
          <Stat label="Almost" value={session.almost} />
          <Stat label="Learning" value={session.again} tone="warn" />
        </div>
        <div className="fc-meter max-w-sm mx-auto mt-4" aria-hidden="true">
          <span style={{ width: `${accuracy}%`, background: "var(--good)" }} />
        </div>
        <div className="text-xs fc-muted mt-1.5 fc-mono">{accuracy}% right on the first try</div>
        <div className="flex flex-wrap gap-2 justify-center mt-6">
          <button type="button" className="fc-btn fc-btn-primary px-4 py-2.5" onClick={() => setRestartKey((k) => k + 1)}>
            <RotateCcw size={16} /> {session.tracked ? "Check for more" : "Practise again"}
          </button>
          {session.tracked ? (
            <button type="button" className="fc-btn fc-btn-ghost px-4 py-2.5" onClick={() => setScope("all")}>
              Practise all cards
            </button>
          ) : null}
        </div>
      </div>
    );
  } else if (card) {
    const props = { card, reverse, onAnswer: answer, keyboardEnabled, onSpeak, tracked: session.tracked };
    const viewKey = `${card.id}-${session.pos}-${reverse}`;
    body =
      mode === "quiz" ? (
        <QuizMode key={viewKey} {...props} deck={deck} />
      ) : mode === "write" ? (
        <WriteMode key={viewKey} {...props} />
      ) : (
        <FlashcardMode key={viewKey} {...props} />
      );
  }

  const pct = session.total ? Math.round((seenCount / session.total) * 100) : 0;
  return (
    <div className="flex flex-col gap-4">
      {toolbar}
      {session.total > 0 && !done ? (
        <div className="flex items-center gap-3">
          <div className="fc-meter flex-1" role="progressbar" aria-label="Session progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <span style={{ width: `${pct}%`, background: "var(--accent)" }} />
          </div>
          <span className="fc-mono text-xs fc-muted whitespace-nowrap">
            {seenCount}/{session.total}
            {retries ? ` · ${retries} to retry` : ""}
          </span>
          {!session.tracked ? <span className="fc-chip fc-chip-muted">Practice</span> : null}
        </div>
      ) : null}
      {body}
    </div>
  );
}
