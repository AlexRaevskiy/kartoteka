/**
 * Mode: Blitz — true or false, fast.
 *
 * The word and a translation: half the time its own, half the time the translation of another
 * card of this session (src/lib/games.js). Answer with the big buttons or ← (false) / → (true).
 *   right → green flash, the next word right away;
 *   wrong → red flash + the right translation (read aloud per the audio settings), then the
 *           next word after a moment — or at once with Next / Enter.
 * Leitner: right = "know" (up a box), wrong = "again" (box 1) — the same flow as the other modes.
 * Auto-play reads the word when it appears (the word is not the answer here).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check, X } from "lucide-react";
import { BoxBadge, ExampleBlock, SpeakButton } from "../ui.jsx";
import RatingHint from "./RatingHint.jsx";
import { TapToListen } from "./AutoAudio.jsx";
import { afterSpeech, useAutoSpeak } from "../../hooks/useAutoSpeak.js";
import { blitzGrade, blitzPrompt } from "../../lib/games.js";
import { speechLang } from "../../lib/languages.js";
import { cx, isTypingTarget } from "../../lib/utils.js";

const RIGHT_PAUSE_MS = 650;
const WRONG_PAUSE_MS = 2200;

export default function BlitzMode({ card, deck, pool, onAnswer, keyboardEnabled, onSpeak, tracked, goal }) {
  const { t } = useTranslation();
  // Fixed for this card (the component is re-mounted per card).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shown = useMemo(() => blitzPrompt(card, pool || deck.cards), [card.id]);
  const [said, setSaid] = useState(null); // null | true ("true" pressed) | false
  const saidRef = useRef(null);
  const answered = useRef(false);
  const alive = useRef(true);
  const speech = useAutoSpeak({ promptSide: "term" });
  const { speakStage } = speech;

  useEffect(() => {
    alive.current = true;
    speakStage(card, deck, "prompt");
    return () => {
      alive.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const grade = said === null ? null : blitzGrade(said, shown.isCorrect);

  const finish = useCallback(
    (g) => {
      if (answered.current) return;
      answered.current = true;
      onAnswer(g);
    },
    [onAnswer]
  );

  const choose = useCallback(
    (saysTrue) => {
      if (saidRef.current !== null) return;
      saidRef.current = saysTrue;
      setSaid(saysTrue);
      const g = blitzGrade(saysTrue, shown.isCorrect);
      // A mistake: read the right translation / example (inside the tap) and let it be heard.
      const spoken = g === "again" ? speakStage(card, deck, "answer") : null;
      afterSpeech(spoken, g === "know" ? RIGHT_PAUSE_MS : WRONG_PAUSE_MS).then(() => alive.current && finish(g));
    },
    [shown.isCorrect, speakStage, card, deck, finish]
  );

  useEffect(() => {
    if (!keyboardEnabled) return undefined;
    const handler = (e) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        choose(false);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        choose(true);
      } else if (e.key === "Enter" && saidRef.current !== null) {
        e.preventDefault();
        finish(blitzGrade(saidRef.current, shown.isCorrect));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [keyboardEnabled, choose, finish, shown.isCorrect]);

  const termLang = speechLang(deck, "term", card.term);

  return (
    <div className="flex flex-col gap-4 w-full max-w-2xl mx-auto fc-in">
      <div
        className={cx(
          "fc-panel p-5 sm:p-7 flex flex-col gap-3",
          grade === "know" && "fc-flash-good",
          grade === "again" && "fc-flash-bad fc-shake"
        )}
        style={{ minHeight: "clamp(16rem, 46vh, 24rem)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="fc-eyebrow">{t("blitz.question")}</span>
          <div className="flex items-center gap-1">
            <BoxBadge box={card.box} />
            <SpeakButton text={card.term} lang={termLang} onSpeak={onSpeak} />
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center py-2">
          <div className="fc-term text-headline-lg sm:text-[2.5rem]" lang={deck.termLang !== "auto" ? deck.termLang : undefined}>
            {card.term}
          </div>
          <div className="w-12 border-t-2 border-outline-variant" aria-hidden="true" />
          <div
            className={cx("text-headline-sm", grade === "again" && !shown.isCorrect ? "line-through opacity-60" : "text-on-surface-variant")}
            style={{ overflowWrap: "anywhere" }}
          >
            {shown.definition}
          </div>
          {grade === "again" ? (
            <div className="flex flex-col items-center gap-2 fc-in">
              <p className="text-body-md">{shown.isCorrect ? t("blitz.wasCorrect") : t("blitz.correctIs")}</p>
              {!shown.isCorrect ? (
                <p className="text-headline-sm font-medium" style={{ overflowWrap: "anywhere" }}>
                  {card.definition}
                </p>
              ) : null}
              <ExampleBlock sentence={card.exampleSentence} term={card.term} deck={deck} onSpeak={onSpeak} center className="max-w-lg mt-1" />
            </div>
          ) : null}
        </div>
      </div>

      {speech.needsTap ? <TapToListen onClick={speech.retry} /> : null}

      <p className="sr-only" aria-live="polite">
        {grade === "know" ? t("blitz.right") : grade === "again" ? t("blitz.wrong") : ""}
      </p>

      {grade === "again" ? (
        <button type="button" className="fc-btn fc-btn-filled fc-btn-lg w-full" onClick={() => finish("again")} autoFocus>
          {t("common.next")} <ArrowRight size={20} /> <span className="fc-kbd hidden sm:inline">Enter</span>
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className="fc-btn fc-btn-danger fc-btn-lg" disabled={said !== null} onClick={() => choose(false)}>
            <X size={22} /> {t("blitz.false")} <span className="fc-kbd hidden sm:inline">←</span>
          </button>
          <button type="button" className="fc-btn fc-btn-good fc-btn-lg" disabled={said !== null} onClick={() => choose(true)}>
            <Check size={22} /> {t("blitz.true")} <span className="fc-kbd hidden sm:inline">→</span>
          </button>
        </div>
      )}
      <p className="text-body-sm text-on-surface-variant text-center">
        <RatingHint card={card} tracked={tracked} goal={goal} />
      </p>
    </div>
  );
}
