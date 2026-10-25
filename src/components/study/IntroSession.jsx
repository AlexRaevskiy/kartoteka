/**
 * Mode "Intro" (familiarization): meet the words before studying them.
 *
 *   - No flipping: word, translation and example are visible at once. Nothing is graded and
 *     Leitner progress doesn't change.
 *   - Next / Back buttons, ← / → keys or a horizontal swipe. Space replays the card.
 *   - Auto-play on every new card: word (on by default), translation, example — the gear opens
 *     the toggles (saved in the profile: settings.introAudio).
 *   - The cards: the next portion of new cards (MAX_NEW_PER_SESSION, the same ones the next
 *     study session takes); if every card was studied already — the whole deck.
 *   - The end screen links to Flashcards / Test / Write or back to the deck.
 *
 * iOS starts audio only from a tap, so playback starts synchronously inside the Next / Back /
 * swipe handlers. The very first card has no tap: if iOS refuses, a "Tap to listen" hint appears.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Layers, ListChecks, PenLine, Play, Settings, Sparkles, X } from "lucide-react";
import { useLibrary } from "../../data/LibraryProvider.jsx";
import { useToast } from "../providers.jsx";
import { ExampleBlock, ProgressBar, Sheet, SpeakButton, Switch } from "../ui.jsx";
import SEO from "../SEO.jsx";
import { MAX_NEW_PER_SESSION, isNewCard } from "../../lib/rounds.js";
import { speechLang } from "../../lib/languages.js";
import { speak, speakSequence, stopSpeech } from "../../lib/speech.js";
import { cx, isTypingTarget } from "../../lib/utils.js";

const DEFAULT_AUDIO = { term: true, definition: false, example: false };
const SWIPE = 60; // px

/** The texts to read for a card, in order, per the user's toggles. */
function sequenceFor(item, audio) {
  const { card, deck } = item;
  return [
    audio.term && { text: card.term, lang: speechLang(deck, "term", card.term) },
    audio.definition && { text: card.definition, lang: speechLang(deck, "definition", card.definition) },
    audio.example && card.exampleSentence && { text: card.exampleSentence, lang: speechLang(deck, "term", card.exampleSentence) },
  ].filter(Boolean);
}

export default function IntroSession({ items, source, backPath }) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const toast = useToast();
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const audio = { ...DEFAULT_AUDIO, ...(lib.settings.introAudio || {}) };
  const audioRef = useRef(audio);
  audioRef.current = audio;

  // Fixed for the whole session (progress snapshots must not reshuffle the list).
  const [cards] = useState(() => {
    const fresh = items.filter(isNewCard).slice(0, MAX_NEW_PER_SESSION);
    return fresh.length ? fresh : items;
  });
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const drag = useRef(null);
  const [dx, setDx] = useState(0);

  const play = useCallback(
    (i) => {
      const item = cards[i];
      if (!item) return;
      const seq = sequenceFor(item, audioRef.current);
      if (!seq.length) return;
      speakSequence(seq).then((r) => {
        if (r.blocked) setNeedsTap(true);
        else if (r.message) toast(r.message, { duration: 5000 });
      });
    },
    [cards, toast]
  );

  // First card: no tap to unlock audio — iOS may refuse, then the "Tap to listen" hint shows.
  useEffect(() => {
    play(0);
    return () => stopSpeech();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Called from tap / key / swipe handlers, so the audio starts within the user's gesture.
  const go = useCallback(
    (next) => {
      if (next < 0) return;
      if (next >= cards.length) {
        stopSpeech();
        setDone(true);
        return;
      }
      setNeedsTap(false);
      setIndex(next);
      play(next);
    },
    [cards.length, play]
  );

  useEffect(() => {
    if (done || settingsOpen) return undefined;
    const onKey = (e) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.key === "ArrowRight" || e.key === "Enter") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key === " ") {
        e.preventDefault();
        setNeedsTap(false);
        play(index);
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, settingsOpen, go, index, play]);

  const exit = () => navigate(backPath, { replace: true });
  const toMode = (mode) => setParams((p) => {
    const next = new URLSearchParams(p);
    next.set("mode", mode);
    return next;
  }, { replace: true });
  const onSpeak = (text, lang) =>
    speak(text, lang).then((r) => {
      if (r.message) toast(r.message, { duration: 5000 });
    });
  const setAudio = (patch) => lib.actions.updateSettings({ introAudio: { ...audio, ...patch } });

  const item = cards[index];
  const total = cards.length;

  const onPointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerMove = (e) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    const ddx = e.clientX - drag.current.x;
    if (Math.abs(ddx) > Math.abs(e.clientY - drag.current.y)) setDx(ddx);
  };
  const onPointerUp = (e) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    const ddx = e.clientX - drag.current.x;
    drag.current = null;
    setDx(0);
    if (ddx <= -SWIPE) go(index + 1);
    else if (ddx >= SWIPE) go(index - 1);
  };

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <SEO title={`${source.title} · ${t("modes.intro.label")} | Kartoteka`} noindex />
      <header className="fc-topbar sticky top-0 z-30">
        <div className="fc-gutter">
          <div className="mx-auto max-w-2xl flex items-center gap-2 h-16">
            <button type="button" className="fc-btn fc-icon-btn -ml-3 text-on-surface" aria-label={t("study.exit")} onClick={exit}>
              <X size={24} />
            </button>
            <div className="flex-1 min-w-0 text-center">
              <div className="text-title-sm truncate">{source.title}</div>
              <div className="text-label-md text-on-surface-variant fc-tabular">
                {done ? t("intro.doneShort") : `${t("modes.intro.label")} · ${index + 1}/${total}`}
              </div>
            </div>
            <button type="button" className="fc-btn fc-icon-btn -mr-3" aria-label={t("intro.settings")} title={t("intro.settings")} onClick={() => setSettingsOpen(true)}>
              <Settings size={22} />
            </button>
          </div>
        </div>
        <div className="fc-gutter pb-2">
          <ProgressBar value={done ? 100 : ((index + 1) / total) * 100} className="mx-auto max-w-2xl" label={t("study.roundProgress")} />
        </div>
      </header>

      <main className="fc-gutter flex-1 pt-4" style={{ paddingBottom: "calc(32px + env(safe-area-inset-bottom, 0px))" }}>
        <div className="mx-auto max-w-2xl flex flex-col gap-4">
          {done ? (
            <section className="flex flex-col items-center text-center gap-4 pt-6 fc-in" aria-labelledby="intro-done">
              <div className="fc-pop w-20 h-20 rounded-3xl bg-success-container text-success flex items-center justify-center">
                <Sparkles size={40} />
              </div>
              <h1 id="intro-done" className="text-headline-sm text-balance">
                {t("intro.doneTitle")}
              </h1>
              <p className="text-body-lg text-on-surface-variant">{t("intro.doneBody", { count: total })}</p>
              <div className="grid gap-3 w-full mt-2">
                {[
                  ["flashcards", Layers],
                  ["quiz", ListChecks],
                  ["write", PenLine],
                ].map(([mode, Icon]) => (
                  <button key={mode} type="button" className="fc-btn fc-btn-tonal fc-btn-lg w-full justify-start" onClick={() => toMode(mode)}>
                    <Icon size={20} /> {t(`modes.${mode}.label`)}
                    <span className="ml-auto text-body-sm opacity-70">{t(`modes.${mode}.hint`)}</span>
                  </button>
                ))}
                <button type="button" className="fc-btn fc-btn-outlined fc-btn-lg w-full" onClick={exit}>
                  {t("intro.backToDeck")}
                </button>
              </div>
            </section>
          ) : item ? (
            <>
              <div
                key={item.key}
                className="fc-panel p-5 sm:p-7 flex flex-col gap-4 fc-in select-none"
                style={{ minHeight: "clamp(18rem, 52vh, 26rem)", transform: dx ? `translateX(${dx}px)` : undefined, touchAction: "pan-y" }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => {
                  drag.current = null;
                  setDx(0);
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="fc-term text-headline-lg sm:text-[2.5rem] min-w-0" style={{ overflowWrap: "anywhere" }} lang={item.deck.termLang !== "auto" ? item.deck.termLang : undefined}>
                    {item.card.term}
                  </div>
                  <SpeakButton text={item.card.term} lang={speechLang(item.deck, "term", item.card.term)} onSpeak={onSpeak} />
                </div>
                <div className="flex items-start justify-between gap-2 border-t border-outline-variant pt-4">
                  <div className="text-headline-sm text-on-surface-variant min-w-0" style={{ overflowWrap: "anywhere" }}>
                    {item.card.definition}
                  </div>
                  <SpeakButton text={item.card.definition} lang={speechLang(item.deck, "definition", item.card.definition)} onSpeak={onSpeak} />
                </div>
                <ExampleBlock sentence={item.card.exampleSentence} term={item.card.term} deck={item.deck} onSpeak={onSpeak} textClassName="text-body-lg" />
              </div>

              {needsTap ? (
                <button
                  type="button"
                  className="fc-btn fc-btn-tonal self-center fc-in"
                  onClick={() => {
                    setNeedsTap(false);
                    play(index);
                  }}
                >
                  <Play size={18} fill="currentColor" /> {t("intro.tapToListen")}
                </button>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <button type="button" className="fc-btn fc-btn-outlined fc-btn-lg" disabled={index === 0} onClick={() => go(index - 1)}>
                  <ArrowLeft size={20} /> {t("common.back")} <span className="fc-kbd hidden sm:inline">←</span>
                </button>
                <button type="button" className="fc-btn fc-btn-filled fc-btn-lg" onClick={() => go(index + 1)}>
                  {index === total - 1 ? t("intro.finish") : t("common.next")} <ArrowRight size={20} /> <span className="fc-kbd hidden sm:inline">→</span>
                </button>
              </div>
              <p className="text-body-sm text-on-surface-variant text-center">{t("intro.hint")}</p>
            </>
          ) : null}
        </div>
      </main>

      {settingsOpen ? (
        <Sheet
          title={t("intro.settings")}
          subtitle={t("intro.settingsHint")}
          onClose={() => setSettingsOpen(false)}
          labelId="intro-settings-title"
          footer={
            <button type="button" className="fc-btn fc-btn-filled" onClick={() => setSettingsOpen(false)}>
              {t("common.done")}
            </button>
          }
        >
          {[
            ["term", t("intro.audio.term")],
            ["definition", t("intro.audio.definition")],
            ["example", t("intro.audio.example")],
          ].map(([key, label]) => (
            <div key={key} className={cx("flex items-center gap-4")}>
              <span className="flex-1 text-body-lg">{label}</span>
              <Switch checked={!!audio[key]} onChange={(on) => setAudio({ [key]: on })} label={label} />
            </div>
          ))}
        </Sheet>
      ) : null}
    </div>
  );
}
