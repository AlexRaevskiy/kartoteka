/**
 * Mode: multiple-choice test. Wrong options are drawn from the other cards of the session
 * (a folder session mixes several decks). Keys 1–4 answer, Enter continues.
 * The example sentence appears after answering.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import { BoxBadge, ExampleSentence, SpeakButton } from "../ui.jsx";
import RatingHint from "./RatingHint.jsx";
import { cx, isTypingTarget, shuffle } from "../../lib/utils.js";
import { tidy } from "../../lib/levenshtein.js";
import { speechLang } from "../../lib/languages.js";

const OPTION_COUNT = 4;

function buildOptions(card, cards, reverse) {
  const answerOf = (c) => (reverse ? c.term : c.definition);
  const correct = answerOf(card);
  const seen = new Set([tidy(correct).toLowerCase()]);
  const distractors = [];
  for (const c of shuffle(cards.filter((x) => x.id !== card.id))) {
    const text = answerOf(c);
    const k = tidy(text).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    distractors.push(text);
    if (distractors.length === OPTION_COUNT - 1) break;
  }
  return shuffle([{ text: correct, correct: true }, ...distractors.map((text) => ({ text, correct: false }))]);
}

export default function QuizMode({ card, deck, pool, reverse, onAnswer, keyboardEnabled, onSpeak, tracked, goal }) {
  const { t } = useTranslation();
  const prompt = reverse ? card.definition : card.term;
  const promptLang = speechLang(deck, reverse ? "definition" : "term", prompt);
  // Options are fixed for this card (the component is re-mounted per card).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const options = useMemo(() => buildOptions(card, pool || deck.cards, reverse), [card.id, reverse]);
  const [picked, setPicked] = useState(null);
  const timer = useRef(null);
  const answered = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);

  const finish = useCallback(
    (correct) => {
      if (answered.current) return;
      answered.current = true;
      clearTimeout(timer.current);
      onAnswer(correct ? "know" : "again");
    },
    [onAnswer]
  );

  const choose = useCallback(
    (i) => {
      if (picked !== null || !options[i]) return;
      setPicked(i);
      // Auto-advance on a correct answer; give time to read the example if there is one.
      if (options[i].correct) timer.current = setTimeout(() => finish(true), card.exampleSentence ? 1600 : 800);
    },
    [picked, options, finish, card.exampleSentence]
  );

  useEffect(() => {
    if (!keyboardEnabled) return undefined;
    const handler = (e) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= options.length) {
        e.preventDefault();
        choose(n - 1);
      } else if (e.key === "Enter" && picked !== null) {
        e.preventDefault();
        finish(options[picked].correct);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [keyboardEnabled, options, picked, choose, finish]);

  const isRight = picked !== null && options[picked].correct;

  return (
    <div className="flex flex-col gap-4 w-full max-w-2xl mx-auto fc-in">
      <div className="fc-panel p-5 sm:p-7">
        <div className="flex items-center justify-between gap-2">
          <span className="fc-eyebrow">{reverse ? t("quiz.pickTerm") : t("quiz.pickDefinition")}</span>
          <div className="flex items-center gap-1">
            <BoxBadge box={card.box} />
            <SpeakButton text={prompt} lang={promptLang} onSpeak={onSpeak} />
          </div>
        </div>
        <div className="fc-term text-headline-md sm:text-headline-lg mt-3 mb-1">{prompt}</div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {options.map((o, i) => {
          const state = picked === null ? null : o.correct ? "is-correct" : picked === i ? "is-wrong" : null;
          return (
            <button
              key={`${i}-${o.text}`}
              type="button"
              disabled={picked !== null}
              className={cx("fc-opt fc-focus p-3.5 flex items-center gap-3 min-w-0", state)}
              onClick={() => choose(i)}
            >
              <span className="fc-num">{i + 1}</span>
              <span className="flex-1 min-w-0 text-body-lg font-medium" style={{ overflowWrap: "anywhere" }}>
                {o.text}
              </span>
              {state === "is-correct" ? <Check size={18} className="fc-good shrink-0" /> : null}
              {state === "is-wrong" ? <X size={18} className="fc-bad shrink-0" /> : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3" style={{ minHeight: "3rem" }} aria-live="polite">
        {picked === null ? (
          <p className="text-body-sm text-on-surface-variant">
            <span className="hidden sm:inline">
              {t("quiz.keys")} <span className="fc-kbd">1</span>–<span className="fc-kbd">{options.length}</span> — {t("quiz.keysAnswer")}{" "}
            </span>
            <RatingHint card={card} tracked={tracked} goal={goal} />
          </p>
        ) : (
          <>
            {card.exampleSentence ? (
              <div className="bg-surface-container-high rounded-2xl px-4 py-3 fc-in">
                <ExampleSentence sentence={card.exampleSentence} term={card.term} />
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {isRight ? (
                <p className="fc-good font-medium inline-flex items-center gap-2">
                  <Check size={18} /> {t("quiz.right")}
                </p>
              ) : (
                <p className="fc-bad font-medium">{t("quiz.wrong")}</p>
              )}
              <button type="button" className="fc-btn fc-btn-primary px-4 py-2.5" onClick={() => finish(isRight)} autoFocus={!isRight}>
                {t("common.next")} <span className="fc-kbd hidden sm:inline">Enter</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
