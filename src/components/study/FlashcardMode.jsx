/**
 * Mode 1 — Leitner flashcards.
 * Tap / Space flips. Rate with the buttons, ← / → keys, or by swiping the card on a phone
 * (swipe right = Know, swipe left = Still learning). The example sentence sits on the back.
 */
import React, { useEffect, useRef, useState } from "react";
import { Check, Undo2 } from "lucide-react";
import { BoxBadge, ExampleSentence, SpeakButton } from "../ui.jsx";
import RatingHint from "./RatingHint.jsx";
import { cx, isTypingTarget } from "../../lib/utils.js";

const SWIPE_THRESHOLD = 90; // px to count as a rating swipe
const TAP_SLOP = 8; // px of movement still treated as a tap

export default function FlashcardMode({ card, reverse, onAnswer, keyboardEnabled, onSpeak, tracked }) {
  const [flipped, setFlipped] = useState(false);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef(null);

  const front = reverse ? card.definition : card.term;
  const back = reverse ? card.term : card.definition;

  // Keyboard shortcuts
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

  /* ---- pointer: tap to flip, horizontal swipe to rate ---- */
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
    } else {
      setDx(0);
    }
  };

  const knowOpacity = Math.min(1, Math.max(0, dx / SWIPE_THRESHOLD));
  const againOpacity = Math.min(1, Math.max(0, -dx / SWIPE_THRESHOLD));

  return (
    <div className="flex flex-col gap-4 fc-in">
      <div className="fc-scene w-full max-w-2xl mx-auto">
        <div
          className={cx("fc-swipe relative", dragging && "is-dragging")}
          style={{ transform: dx ? `translateX(${dx}px) rotate(${dx / 24}deg)` : undefined }}
        >
          <span className="fc-swipe-label fc-good" style={{ left: "1rem", opacity: knowOpacity }} aria-hidden="true">
            Know
          </span>
          <span className="fc-swipe-label fc-warn" style={{ right: "1rem", opacity: againOpacity }} aria-hidden="true">
            Learning
          </span>
          <div
            role="button"
            tabIndex={0}
            aria-label={flipped ? `Answer: ${back}. Press Enter to show the question.` : `Question: ${front}. Press Enter to reveal the answer.`}
            className={cx("fc-flip fc-focus", flipped && "is-flipped")}
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
            {/* Front: blank index card */}
            <div className="fc-face" aria-hidden={flipped}>
              <div className="flex items-center justify-between p-3 sm:p-4">
                <BoxBadge box={card.box} />
                <SpeakButton text={front} onSpeak={onSpeak} />
              </div>
              <div className="flex-1 flex items-center justify-center px-6 text-center min-h-0 overflow-auto">
                <div className="fc-term text-3xl sm:text-5xl">{front}</div>
              </div>
              <div className="text-xs fc-muted text-center pb-3 sm:pb-4">
                Tap to flip <span className="hidden sm:inline">· <span className="fc-kbd">Space</span></span>
                <span className="sm:hidden"> · swipe to rate</span>
              </div>
            </div>

            {/* Back: ruled index card with the answer + example sentence */}
            <div className="fc-face fc-back fc-ruled" aria-hidden={!flipped}>
              <div className="flex items-center justify-between gap-2 px-4 sm:px-5" style={{ height: "3.5rem" }}>
                <span className="text-sm fc-muted truncate min-w-0">{front}</span>
                <SpeakButton text={back} onSpeak={onSpeak} />
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 py-3 text-center min-h-0 overflow-auto">
                <div className="fc-term text-2xl sm:text-4xl" style={{ fontWeight: 600 }}>
                  {back}
                </div>
                <ExampleSentence sentence={card.exampleSentence} term={card.term} className="text-sm sm:text-base max-w-lg" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full max-w-2xl mx-auto">
        <button type="button" className="fc-btn fc-btn-warn px-4 py-3.5" onClick={() => onAnswer("again")}>
          <Undo2 size={18} /> Still learning <span className="fc-kbd hidden sm:inline">←</span>
        </button>
        <button type="button" className="fc-btn fc-btn-good px-4 py-3.5" onClick={() => onAnswer("know")}>
          <Check size={18} /> Know <span className="fc-kbd hidden sm:inline">→</span>
        </button>
      </div>
      <p className="text-xs fc-muted text-center max-w-2xl mx-auto">
        <RatingHint card={card} tracked={tracked} />
      </p>
    </div>
  );
}
