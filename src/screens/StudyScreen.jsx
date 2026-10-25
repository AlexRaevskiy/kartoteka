/**
 * /deck/:id/study and /folder/:id/study — full-screen study session.
 *
 * Nothing but the lesson: a close button, round progress and the card. The session runs in
 * rounds (Profile → round size, default 20 cards). After each round: the round summary with
 * praise, stats, the list of mistakes, and two buttons — "Finish" and "Continue"
 * (a new round with only the missed cards; if there were none — the next batch).
 *
 * Query: ?mode=flashcards|learn|quiz|write  &goal=memorize|cram  &starred=1  &tag=<folderTagId>
 *   memorize → Leitner: only cards due today
 *   cram     → every card, ignoring the long intervals ("Cram for a test")
 */
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeftRight, Brain, CalendarCheck, GraduationCap, Layers, ListChecks, Lock, PenLine, SearchX, Sparkles, Timer, X } from "lucide-react";
import { useLibrary } from "../data/LibraryProvider.jsx";
import { useDeckResource, useDeckSet, useFolderResource } from "../data/useRemote.js";
import { useToast } from "../components/providers.jsx";
import { EmptyPanel, Menu, ProgressBar, Spinner } from "../components/ui.jsx";
import SEO from "../components/SEO.jsx";
import FlashcardMode from "../components/study/FlashcardMode.jsx";
import QuizMode from "../components/study/QuizMode.jsx";
import WriteMode from "../components/study/WriteMode.jsx";
import LearnMode from "../components/study/LearnMode.jsx";
import RoundSummary from "../components/study/RoundSummary.jsx";
import { useRounds } from "../hooks/useRounds.js";
import { useStudyTimer } from "../hooks/useStudyTimer.js";
import { toItems } from "../lib/rounds.js";
import { deckStats } from "../lib/leitner.js";
import { relativeDay } from "../i18n/format.js";
import { celebrate } from "../lib/celebrate.js";
import { speak } from "../lib/speech.js";

// Labels: modes.<id>.label / modes.<id>.hint in the locale files.
export const MODES = [
  { id: "flashcards", icon: Layers },
  { id: "learn", icon: GraduationCap },
  { id: "quiz", icon: ListChecks },
  { id: "write", icon: PenLine },
];
const MODE_COMPONENTS = { flashcards: FlashcardMode, learn: LearnMode, quiz: QuizMode, write: WriteMode };

export default function StudyScreen({ kind }) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const opts = {
    mode: MODE_COMPONENTS[params.get("mode")] ? params.get("mode") : "flashcards",
    goal: params.get("goal") === "cram" ? "cram" : "memorize",
    starred: params.get("starred") === "1",
    tag: params.get("tag"),
  };
  return kind === "folder" ? <FolderStudy id={id} opts={opts} /> : <DeckStudy id={id} opts={opts} />;
}

function Blocked({ icon, title, body, backPath }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <div className="fc-gutter min-h-screen flex items-center justify-center">
      <EmptyPanel icon={icon} title={title} body={body} className="max-w-md w-full" actions={<button type="button" className="fc-btn fc-btn-filled" onClick={() => navigate(backPath, { replace: true })}>{t("common.back")}</button>} />
    </div>
  );
}

function Loading() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center" role="status" aria-label={t("common.loading")}>
      <Spinner size={28} />
    </div>
  );
}

/**
 * Keeps the last ready value while a session is running. Grading writes progress, and the
 * resulting snapshots can briefly report "loading"; unmounting the session then would throw the
 * learner out of the round (e.g. right after "Continue").
 */
function useStickyReady(ready, value) {
  const last = useRef(null);
  if (ready) last.current = value;
  return last.current;
}

function DeckStudy({ id, opts }) {
  const { t } = useTranslation();
  const res = useDeckResource(id);
  const deck = res.deck;
  const items = useMemo(() => {
    if (!deck) return [];
    const cards = opts.starred ? deck.cards.filter((c) => deck.starred.has(c.id)) : deck.cards;
    return toItems(deck, cards);
  }, [deck, opts.starred]);
  const live = useStickyReady(res.status === "ready" && !!deck, { deck, items });
  if (!live) {
    if (res.status === "loading") return <Loading />;
    return <Blocked icon={res.status === "locked" || res.status === "private" ? Lock : SearchX} title={t("study.deckUnavailable")} backPath={`/deck/${id}`} />;
  }
  return <Session key={`${opts.mode}-${opts.goal}-${opts.starred}`} items={live.items} source={{ kind: "deck", id, title: live.deck.title }} backPath={`/deck/${id}`} opts={opts} />;
}

function FolderStudy({ id, opts }) {
  const { t } = useTranslation();
  const fres = useFolderResource(id);
  const folder = fres.folder;
  const tag = folder?.tags.find((tg) => tg.id === opts.tag);
  const ids = useMemo(() => (folder ? (tag ? folder.deckIds.filter((d) => tag.deckIds.includes(d)) : folder.deckIds) : []), [folder, tag]);
  const set = useDeckSet(ids);
  const items = useMemo(() => set.decks.flatMap((d) => toItems(d, opts.starred ? d.cards.filter((c) => d.starred.has(c.id)) : d.cards)), [set.decks, opts.starred]);
  const live = useStickyReady(fres.status === "ready" && !!folder && !set.loading, { items, title: tag ? `${folder?.name} · ${tag.name}` : folder?.name });
  if (!live) {
    if (fres.status === "loading" || set.loading) return <Loading />;
    return <Blocked icon={Lock} title={t("study.folderUnavailable")} backPath={`/folder/${id}`} />;
  }
  return (
    <Session
      key={`${opts.mode}-${opts.goal}-${opts.tag}`}
      items={live.items}
      source={{ kind: "folder", id, title: live.title }}
      backPath={`/folder/${id}`}
      opts={opts}
    />
  );
}

function Session({ items, source, backPath, opts }) {
  const lib = useLibrary();
  const toast = useToast();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [, setParams] = useSearchParams();
  const { mode, goal } = opts;
  const reverse = !!lib.settings.reverse;

  useEffect(() => {
    lib.actions.setLastStudy({ kind: source.kind, id: source.id, title: source.title, mode, goal });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const goalCelebration = useCallback(
    (res) => {
      if (res?.justMetGoal) {
        celebrate("mastery");
        toast(t("study.goalMet"), { icon: Sparkles, duration: 5000 });
        return true;
      }
      return false;
    },
    [toast]
  );

  const onGrade = useCallback(
    (item, grade) => {
      const res = lib.actions.grade(item.deck, item.card.id, grade, { goal });
      lib.actions.logReview();
      if (res?.after?.box === 5 && res.before.box === 4) {
        celebrate("card");
        toast(t("study.cardMastered", { term: item.card.term }), { icon: Sparkles });
      }
    },
    [lib.actions, goal, toast]
  );

  const onRoundEnd = useCallback(
    (summary) => {
      const res = lib.actions.recordActivity({ rounds: 1, cards: summary.total });
      if (!goalCelebration(res) && summary.accuracy === 100) celebrate("due");
    },
    [lib.actions, goalCelebration]
  );

  useStudyTimer((seconds) => {
    // Also runs while the screen unmounts ("Finish"), so it must never throw.
    try {
      goalCelebration(lib.actions.recordActivity({ seconds }));
    } catch (err) {
      console.error("[Kartoteka] study time not saved", err);
    }
  });

  const rounds = useRounds({ items, goal, roundSize: lib.settings.roundSize || 20, onGrade, onRoundEnd });
  const pool = useMemo(() => items.map((i) => i.card), [items]);

  // Always leave to a known screen: going "back" in history could land outside the app or on a stale entry.
  const exit = useCallback(() => navigate(backPath, { replace: true }), [navigate, backPath]);
  const setQuery = (patch) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      Object.entries(patch).forEach(([k, v]) => next.set(k, v));
      return next;
    }, { replace: true });

  const onSpeak = useCallback(
    (text, lang) =>
      speak(text, lang).then((r) => {
        if (r.message) toast(r.message, { duration: 5000 });
      }),
    [toast]
  );

  const menu = [
    ...MODES.map((m) => ({ label: `${m.id === mode ? "✓ " : ""}${t(`modes.${m.id}.label`)}`, icon: m.icon, onClick: () => m.id !== mode && setQuery({ mode: m.id }) })),
    { divider: true },
    { label: reverse ? t("study.termFirst") : t("study.definitionFirst"), icon: ArrowLeftRight, onClick: () => lib.actions.updateSettings({ reverse: !reverse }) },
    goal === "memorize"
      ? { label: t("study.switchToCram"), icon: Timer, onClick: () => setQuery({ goal: "cram" }) }
      : { label: t("study.switchToMemorize"), icon: Brain, onClick: () => setQuery({ goal: "memorize" }) },
  ];

  const total = rounds.items?.length || 0;
  const done = rounds.phase === "playing" ? rounds.pos : total;
  const ModeComponent = MODE_COMPONENTS[mode === "quiz" && pool.length < 2 ? "flashcards" : mode];
  const stats = useMemo(() => deckStats({ cards: pool }, Date.now()), [pool]);

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <SEO title={`${source.title} · ${t("study.seo")} | Kartoteka`} noindex />
      {/* Minimal top bar: exit · title/round · menu */}
      <header className="fc-topbar sticky top-0 z-30">
        <div className="fc-gutter">
          <div className="mx-auto max-w-2xl flex items-center gap-2 h-16">
            <button type="button" className="fc-btn fc-icon-btn -ml-3 text-on-surface" aria-label={t("study.exit")} onClick={exit}>
              <X size={24} />
            </button>
            <div className="flex-1 min-w-0 text-center">
              <div className="text-title-sm truncate">{source.title}</div>
              <div className="text-label-md text-on-surface-variant fc-tabular">
                {rounds.phase === "summary"
                  ? t("study.summary")
                  : rounds.phase === "empty"
                  ? goal === "cram"
                    ? t("study.cram")
                    : t("study.leitner")
                  : `${rounds.kind === "retry" ? t("study.retryRound") : t("study.round", { n: rounds.roundNo })} · ${Math.min(done + 1, total)}/${total}`}
              </div>
            </div>
            <div className="-mr-3">
              <Menu items={menu} label={t("study.menu")} />
            </div>
          </div>
        </div>
        <div className="fc-gutter pb-2">
          <ProgressBar value={total ? (done / total) * 100 : 0} className="mx-auto max-w-2xl" label={t("study.roundProgress")} color={rounds.kind === "retry" ? "var(--md-warning)" : "var(--md-primary)"} />
        </div>
      </header>

      <main className="fc-gutter flex-1 pt-4 pb-8" style={{ overflowX: "clip", paddingBottom: "calc(32px + env(safe-area-inset-bottom, 0px))" }}>
        <div className="mx-auto max-w-2xl">
          {rounds.phase === "playing" && rounds.current ? (
            <ModeComponent
              key={`${rounds.roundNo}-${rounds.pos}-${rounds.current.key}`}
              card={rounds.current.card}
              deck={rounds.current.deck}
              pool={pool}
              reverse={reverse}
              goal={goal}
              tracked={rounds.kind === "normal"}
              keyboardEnabled
              onAnswer={rounds.answer}
              onSpeak={onSpeak}
            />
          ) : null}

          {rounds.phase === "summary" ? (
            <RoundSummary
              summary={rounds.summary}
              kind={rounds.kind}
              hasMore={rounds.hasMore}
              onFinish={exit}
              onContinueMistakes={rounds.continueMistakes}
              onNextRound={rounds.nextRound}
              onSpeak={onSpeak}
            />
          ) : null}

          {rounds.phase === "empty" ? (
            items.length === 0 ? (
              <EmptyPanel icon={SearchX} title={opts.starred ? t("study.noStarred") : t("study.noCards")} actions={<button type="button" className="fc-btn fc-btn-filled" onClick={exit}>{t("common.back")}</button>} />
            ) : goal === "memorize" ? (
              <EmptyPanel
                icon={CalendarCheck}
                tone="good"
                title={rounds.roundNo > 1 ? t("study.allDoneToday") : t("study.allReviewedToday")}
                body={
                  stats.nextDue
                    ? t("study.nextReview", { when: relativeDay(t, stats.nextDue), cards: t("deck.cardCount", { count: stats.nextDueCount }) })
                    : t("study.allMastered")
                }
                actions={
                  <>
                    <button type="button" className="fc-btn fc-btn-filled" onClick={() => setQuery({ goal: "cram" })}>
                      <Timer size={18} /> {t("study.cramAll")}
                    </button>
                    <button type="button" className="fc-btn fc-btn-outlined" onClick={exit}>
                      {t("study.finish")}
                    </button>
                  </>
                }
              />
            ) : (
              <EmptyPanel
                icon={CalendarCheck}
                tone="good"
                title={t("study.passedAll")}
                body={t("study.passedAllBody")}
                actions={
                  <>
                    <button type="button" className="fc-btn fc-btn-filled" onClick={rounds.restart}>
                      {t("study.again")}
                    </button>
                    <button type="button" className="fc-btn fc-btn-outlined" onClick={exit}>
                      {t("study.finish")}
                    </button>
                  </>
                }
              />
            )
          ) : null}
        </div>
      </main>
    </div>
  );
}
