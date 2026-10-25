/**
 * Mode: Leitner flashcards.
 * Tap / Space flips. Rate with the buttons, ← / → keys, or by swiping the card
 * (right = know, left = still learning). The example sentence is on the back.
 */
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Undo2 } from "lucide-react";
import { BoxBadge, ExampleSentence, SpeakButton } from "../ui.jsx";
import RatingHint from "./RatingHint.jsx";
import { cx, isTypingTarget } from "../../lib/utils.js";
import { speechLang } from "../../lib/languages.js";

const SWIPE_THRESHOLD = 90; // px
const TAP_SLOP = 8; // px

export default function FlashcardMode({ card, deck, reverse, onAnswer, keyboardEnabled, onSpeak, tracked, goal }) {
  const { t } = useTranslation();
  const [flipped, setFlipped] = useState(false);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef(null);

  const front = reverse ? card.definition : card.term;
  const back = reverse ? card.term : card.definition;
  const frontLang = speechLang(deck, reverse ? "definition" : "term", front);
  const backLang = speechLang(deck, reverse ? "term" : "definition", back);

  useEffect(() => {
    if (!keyboardEnabled) return undefined;
    const handler = (e) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onAnswer("know");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onAnswer("again");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [keyboardEnabled, onAnswer]);

  const onPointerDown = (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.moved && Math.abs(mx) > TAP_SLOP && Math.abs(mx) > Math.abs(my)) {
      d.moved = true;
      setDragging(true);
    }
    if (d.moved) setDx(mx);
  };
  const endDrag = (e, cancelled) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    if (!d.moved) {
      if (!cancelled) setFlipped((f) => !f);
      return;
    }
    const mx = e.clientX - d.x;
    if (!cancelled && mx > SWIPE_THRESHOLD) {
      setDx(window.innerWidth);
      setTimeout(() => onAnswer("know"), 160);
    } else if (!cancelled && mx < -SWIPE_THRESHOLD) {
      setDx(-window.innerWidth);
      setTimeout(() => onAnswer("again"), 160);
    } else setDx(0);
  };

  return (
    <div className="flex flex-col gap-5 fc-in">
      <div className="fc-scene w-full max-w-2xl mx-auto">
        <div className={cx("fc-swipe relative", dragging && "is-dragging")} style={{ transform: dx ? `translateX(${dx}px) rotate(${dx / 24}deg)` : undefined }}>
          <span className="fc-swipe-label fc-good" style={{ left: "1rem", opacity: Math.min(1, Math.max(0, dx / SWIPE_THRESHOLD)) }} aria-hidden="true">
            {t("rate.know")}
          </span>
          <span className="fc-swipe-label fc-warn" style={{ right: "1rem", opacity: Math.min(1, Math.max(0, -dx / SWIPE_THRESHOLD)) }} aria-hidden="true">
            {t("rate.again")}
          </span>
          <div
            role="button"
            tabIndex={0}
            aria-label={flipped ? t("flashcard.answerAria", { text: back }) : t("flashcard.questionAria", { text: front })}
            className={cx("fc-flip fc-focus", flipped && "is-flipped")}
            style={{ height: "clamp(18rem, 55vh, 28rem)" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => endDrag(e, false)}
            onPointerCancel={(e) => endDrag(e, true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setFlipped((f) => !f);
              }
            }}
          >
            <div className="fc-face" aria-hidden={flipped}>
              <div className="flex items-center justify-between p-3 sm:p-4">
                <BoxBadge box={card.box} />
                <SpeakButton text={front} lang={frontLang} onSpeak={onSpeak} />
              </div>
              <div className="flex-1 flex items-center justify-center px-6 text-center min-h-0 overflow-auto">
                <div className="fc-term text-headline-lg sm:text-[2.75rem]">{front}</div>
              </div>
              <div className="text-body-sm text-on-surface-variant text-center pb-4">
                {t("flashcard.tapToFlip")}{" "}
                <span className="hidden sm:inline">
                  · <span className="fc-kbd">{t("flashcard.space")}</span>
                </span>
                <span className="sm:hidden"> · {t("flashcard.swipeToRate")}</span>
              </div>
            </div>
            <div className="fc-face fc-back fc-ruled" aria-hidden={!flipped}>
              <div className="flex items-center justify-between gap-2 px-4 sm:px-5" style={{ height: "3.5rem" }}>
                <span className="text-body-md text-on-surface-variant truncate min-w-0">{front}</span>
                <SpeakButton text={back} lang={backLang} onSpeak={onSpeak} />
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 py-3 text-center min-h-0 overflow-auto">
                <div className="fc-term text-headline-md sm:text-headline-lg">{back}</div>
                <ExampleSentence sentence={card.exampleSentence} term={card.term} className="text-body-md sm:text-body-lg max-w-lg" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full max-w-2xl mx-auto">
        <button type="button" className="fc-btn fc-btn-warn fc-btn-lg" onClick={() => onAnswer("again")}>
          <Undo2 size={20} /> {t("rate.again")} <span className="fc-kbd hidden sm:inline">←</span>
        </button>
        <button type="button" className="fc-btn fc-btn-good fc-btn-lg" onClick={() => onAnswer("know")}>
          <Check size={20} /> {t("rate.know")} <span className="fc-kbd hidden sm:inline">→</span>
        </button>
      </div>
      <p className="text-body-sm text-on-surface-variant text-center max-w-2xl mx-auto">
        <RatingHint card={card} tracked={tracked} goal={goal} />
      </p>
    </div>
  );
}
