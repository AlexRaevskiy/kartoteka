/**
 * Mode 3 — Smart Write / spelling.
 *
 * The typed answer is graded with Levenshtein distance (src/lib/levenshtein.js):
 *
 *   correct → "Know" (moves up a box). If the learner used a hint or needed a retry → partial credit.
 *   almost  → within the typo tolerance (1–2 letters in a longer word):
 *               1st time: "Almost!" + Retry (find your own typo) or "Show the difference"
 *               after reveal / 2nd miss: letter-by-letter diff + "Accept with partial credit" or "Count as wrong"
 *   wrong   → shows the correct answer (with a diff when it's close enough to be useful),
 *             "Continue" or "I was right" (override).
 *
 * Partial credit = Leitner grade "almost" (card keeps its box; see PARTIAL_CREDIT_POLICY).
 */
import React, { useEffect, useRef, useState } from "react";
import { Check, Eye, Lightbulb, Quote, RotateCcw, X } from "lucide-react";
import { BoxBadge, ExampleSentence, SpeakButton } from "../ui.jsx";
import DiffView from "./DiffView.jsx";
import RatingHint from "./RatingHint.jsx";
import { evaluateAnswer, diffIsUseful } from "../../lib/levenshtein.js";
import { detectLang } from "../../lib/speech.js";
import { nextBox } from "../../lib/leitner.js";
import { cx } from "../../lib/utils.js";

export default function WriteMode({ card, reverse, onAnswer, onSpeak, tracked }) {
  const prompt = reverse ? card.definition : card.term;
  const expected = reverse ? card.term : card.definition;
  const answerIsTerm = reverse; // then the example sentence must hide the term

  const [value, setValue] = useState("");
  const [phase, setPhase] = useState("input"); // input | correct | almost | wrong
  const [attempt, setAttempt] = useState(1);
  const [result, setResult] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [hintLetters, setHintLetters] = useState(0);
  const [showExample, setShowExample] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  const inputRef = useRef(null);
  const timer = useRef(null);
  const answered = useRef(false);
  const lang = detectLang(expected);
  const letters = Array.from(expected);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    return () => clearTimeout(timer.current);
  }, []);

  const finish = (grade) => {
    if (answered.current) return;
    answered.current = true;
    clearTimeout(timer.current);
    onAnswer(grade);
  };

  // Grade for a correct answer: full credit only on a clean first try.
  const correctGrade = attempt === 1 && hintLetters === 0 ? "know" : "almost";

  const check = () => {
    if (!value.trim()) return;
    const r = evaluateAnswer(value, expected);
    setResult(r);
    if (r.verdict === "correct") {
      setPhase("correct");
      timer.current = setTimeout(() => finish(correctGrade), correctGrade === "know" ? 900 : 1600);
    } else if (r.verdict === "almost") {
      setPhase("almost");
      setRevealed(attempt > 1); // second miss: show the diff straight away
      setShakeKey((k) => k + 1);
    } else {
      setPhase("wrong");
      setShakeKey((k) => k + 1);
    }
  };

  const retry = () => {
    setAttempt(2);
    setPhase("input");
    setRevealed(false);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  // Enter always triggers the main action of the current phase.
  const onSubmit = (e) => {
    e.preventDefault();
    if (phase === "input") check();
    else if (phase === "correct") finish(correctGrade);
    else if (phase === "almost") (revealed ? finish("almost") : attempt === 1 ? retry() : setRevealed(true));
    else finish("again");
  };

  const giveUp = () => {
    setResult(evaluateAnswer("", expected));
    setValue("");
    setPhase("wrong");
  };

  const borderStyle =
    phase === "correct"
      ? { borderColor: "var(--good)", boxShadow: "0 0 0 3px var(--good-soft)" }
      : phase === "almost"
      ? { borderColor: "var(--warn)", boxShadow: "0 0 0 3px var(--warn-soft)" }
      : phase === "wrong"
      ? { borderColor: "var(--bad)", boxShadow: "0 0 0 3px var(--bad-soft)" }
      : undefined;

  const typoCount = result && Number.isFinite(result.distance) ? result.distance : 0;
  const hintText = hintLetters ? `${letters.slice(0, hintLetters).join("")}…` : "";

  return (
    <form className="flex flex-col gap-4 w-full max-w-2xl mx-auto fc-in" onSubmit={onSubmit} noValidate>
      {/* Prompt */}
      <div className="fc-panel p-5 sm:p-7">
        <div className="flex items-center justify-between gap-2">
          <span className="fc-eyebrow">{reverse ? "Type the term" : "Type the definition"}</span>
          <div className="flex items-center gap-1">
            <BoxBadge box={card.box} />
            <SpeakButton text={prompt} onSpeak={onSpeak} />
          </div>
        </div>
        <div className="fc-term text-3xl sm:text-4xl mt-3">{prompt}</div>
        {card.exampleSentence && (showExample || phase !== "input") ? (
          <div className="mt-4 pt-3 fc-border-t fc-in">
            <ExampleSentence
              sentence={card.exampleSentence}
              term={card.term}
              mode={answerIsTerm && phase === "input" ? "mask" : "highlight"}
            />
          </div>
        ) : null}
      </div>

      {/* Answer field */}
      <div className="flex flex-col gap-2">
        <label htmlFor={`write-${card.id}`} className="sr-only">
          Your answer
        </label>
        <div key={shakeKey} className={cx("flex gap-2", shakeKey > 0 && phase !== "input" && phase !== "correct" && "fc-shake")}>
          <input
            id={`write-${card.id}`}
            ref={inputRef}
            className="fc-input text-lg"
            style={borderStyle}
            value={value}
            readOnly={phase !== "input"}
            onChange={(e) => setValue(e.target.value)}
            placeholder={hintText || (attempt > 1 ? "Fix the typo and check again" : "Your answer")}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="done"
            lang={lang}
          />
          {phase === "input" ? (
            <button type="submit" className="fc-btn fc-btn-primary px-5" disabled={!value.trim()}>
              Check
            </button>
          ) : null}
        </div>

        {phase === "input" ? (
          <div className="flex flex-wrap items-center gap-1 text-xs fc-muted">
            <button
              type="button"
              className="fc-btn fc-btn-quiet px-2 py-1 text-xs"
              onClick={() => setHintLetters((h) => Math.min(h + 1, Math.max(1, letters.length - 1)))}
            >
              <Lightbulb size={14} /> {hintLetters ? "Another letter" : "Hint"}
            </button>
            {card.exampleSentence && !showExample ? (
              <button type="button" className="fc-btn fc-btn-quiet px-2 py-1 text-xs" onClick={() => setShowExample(true)}>
                <Quote size={14} /> Show example
              </button>
            ) : null}
            <button type="button" className="fc-btn fc-btn-quiet px-2 py-1 text-xs" onClick={giveUp}>
              <Eye size={14} /> I don't know
            </button>
            <span className="ml-auto">
              {attempt > 1 ? "Second try: partial credit if correct. " : hintLetters ? "Hint used: partial credit. " : ""}
              {lang === "ka-GE" ? "Use a Georgian keyboard." : "Not case-sensitive."}
            </span>
          </div>
        ) : null}
      </div>

      {/* Feedback */}
      <div aria-live="polite">
        {phase === "input" ? (
          <p className="text-xs fc-muted">
            <RatingHint card={card} tracked={tracked} showAlmost />
          </p>
        ) : null}

        {phase === "correct" ? (
          <div className="fc-feedback-good rounded-xl p-4 flex flex-wrap items-center gap-3 fc-in">
            <Check size={20} />
            <div className="flex-1 min-w-0">
              <div className="font-bold">{correctGrade === "know" ? "Correct!" : "Correct, with partial credit"}</div>
              {correctGrade === "almost" ? (
                <div className="text-sm fc-fg mt-0.5">
                  {attempt > 1 ? "You fixed it on the second try." : "You used a hint."}{" "}
                  {tracked ? `The card stays in Box ${nextBox(card.box, "almost")}.` : ""}
                </div>
              ) : null}
            </div>
            <button type="submit" className="fc-btn fc-btn-good px-4 py-2">
              Next <span className="fc-kbd hidden sm:inline">Enter</span>
            </button>
          </div>
        ) : null}

        {phase === "almost" ? (
          <div className="fc-feedback-warn rounded-xl p-4 fc-in flex flex-col gap-3">
            <div>
              <div className="font-bold">Almost! {typoCount === 1 ? "One letter is" : `${typoCount} letters are`} off.</div>
              {!revealed ? (
                <div className="text-sm fc-fg mt-0.5">Find the typo and try again, or show the difference.</div>
              ) : null}
            </div>
            {revealed ? (
              <div className="fc-surface rounded-lg p-3">
                <DiffView ops={result.ops} />
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {!revealed ? (
                <>
                  <button type="submit" className="fc-btn fc-btn-primary px-4 py-2.5" autoFocus>
                    <RotateCcw size={16} /> Retry <span className="fc-kbd hidden sm:inline">Enter</span>
                  </button>
                  <button type="button" className="fc-btn fc-btn-ghost px-4 py-2.5" onClick={() => setRevealed(true)}>
                    <Eye size={16} /> Show the difference
                  </button>
                </>
              ) : (
                <>
                  <button type="submit" className="fc-btn fc-btn-primary px-4 py-2.5" autoFocus>
                    <Check size={16} /> Accept with partial credit <span className="fc-kbd hidden sm:inline">Enter</span>
                  </button>
                  <button type="button" className="fc-btn fc-btn-ghost px-4 py-2.5" onClick={() => finish("again")}>
                    <X size={16} /> Count as wrong
                  </button>
                </>
              )}
            </div>
          </div>
        ) : null}

        {phase === "wrong" ? (
          <div className="fc-feedback-bad rounded-xl p-4 fc-in flex flex-col gap-3">
            <div className="font-bold">{value.trim() ? "Not quite." : "Here's the answer."}</div>
            {value.trim() && result && diffIsUseful(result) ? (
              <div className="fc-surface rounded-lg p-3">
                <DiffView ops={result.ops} />
              </div>
            ) : null}
            <div className="flex items-center gap-1 fc-fg text-sm flex-wrap">
              Correct answer: <b className="fc-term text-lg ml-1">{expected}</b>
              <SpeakButton text={expected} onSpeak={onSpeak} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="fc-btn fc-btn-primary px-4 py-2.5" autoFocus>
                Continue <span className="fc-kbd hidden sm:inline">Enter</span>
              </button>
              {value.trim() ? (
                <button type="button" className="fc-btn fc-btn-ghost px-4 py-2.5" onClick={() => finish("know")}>
                  I was right
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </form>
  );
}
