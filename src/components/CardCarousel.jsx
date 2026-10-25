/**
 * Deck screen, block 1: swipeable carousel of big flip cards (CSS scroll-snap → native swipe
 * on phones, arrow keys on desktop) with pagination dots.
 */
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { ExampleBlock, SpeakButton } from "./ui.jsx";
import { cx } from "../lib/utils.js";

const MAX_SLIDES = 200; // keep the DOM light for huge decks

function Slide({ card, reverse, onSpeak, deck }) {
  const { t } = useTranslation();
  const [flipped, setFlipped] = useState(false);
  const front = reverse ? card.definition : card.term;
  const back = reverse ? card.term : card.definition;
  const frontLang = reverse ? deck.defLang : deck.termLang;
  // The back's speaker reads the word being learned (the term), never the translation.
  const termLang = deck.termLang;
  return (
    <div className="fc-scene w-full" style={{ touchAction: "pan-x pan-y" }}>
      <div
        role="button"
        tabIndex={0}
        className={cx("fc-flip fc-focus", flipped && "is-flipped")}
        style={{ height: "clamp(13rem, 46vw, 18rem)" }}
        aria-label={flipped ? t("carousel.answer", { text: back }) : t("carousel.card", { text: front })}
        onClick={() => setFlipped((f) => !f)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setFlipped((f) => !f);
          }
        }}
      >
        <div className="fc-face" aria-hidden={flipped}>
          <div className="flex justify-end p-2">
            <SpeakButton text={front} lang={frontLang} onSpeak={onSpeak} />
          </div>
          <div className="flex-1 flex items-center justify-center px-6 pb-10 text-center min-h-0 overflow-auto">
            <div className="fc-term text-headline-md">{front}</div>
          </div>
        </div>
        <div className="fc-face fc-back" aria-hidden={!flipped}>
          <div className="flex justify-end p-2">
            <SpeakButton text={card.term} lang={termLang} onSpeak={onSpeak} />
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 pb-10 text-center min-h-0 overflow-auto">
            <div className="fc-term text-headline-sm">{back}</div>
            <ExampleBlock sentence={card.exampleSentence} term={card.term} deck={deck} onSpeak={onSpeak} center textClassName="text-body-md" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CardCarousel({ deck, reverse, onSpeak, onFullscreen }) {
  const { t } = useTranslation();
  const cards = deck.cards.slice(0, MAX_SLIDES);
  const scroller = useRef(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = el.firstElementChild?.getBoundingClientRect().width || el.clientWidth;
        setIndex(Math.round(el.scrollLeft / (w + 12)));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const go = (i) => {
    const el = scroller.current;
    const target = Math.max(0, Math.min(cards.length - 1, i));
    el?.children[target]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };

  if (!cards.length) return null;

  // Dots: all of them for small decks, a sliding window of 7 for big ones.
  const DOTS = 7;
  const start = cards.length <= DOTS ? 0 : Math.min(Math.max(0, index - 3), cards.length - DOTS);
  const dots = Array.from({ length: Math.min(DOTS, cards.length) }, (_, i) => start + i);

  return (
    <section aria-roledescription="carousel" aria-label={t("carousel.aria")}>
      <div
        ref={scroller}
        className="fc-hscroll is-center gap-3 -mx-4 px-4 py-2"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(index + 1);
          if (e.key === "ArrowLeft") go(index - 1);
        }}
      >
        {cards.map((card, i) => (
          <div key={card.id} className="w-[88%] sm:w-full" aria-roledescription="slide" aria-label={t("carousel.slide", { n: i + 1, total: cards.length })}>
            <Slide card={card} reverse={reverse} onSpeak={onSpeak} deck={deck} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-2">
        <button type="button" className="fc-btn fc-icon-btn hidden sm:inline-flex" aria-label={t("carousel.previous")} onClick={() => go(index - 1)} disabled={index === 0}>
          <ChevronLeft size={22} />
        </button>
        <div className="flex items-center gap-1.5 mx-auto" aria-hidden="true">
          {dots.map((i) => (
            <span
              key={i}
              className="rounded-full transition-all"
              style={{
                width: i === index ? 20 : 8,
                height: 8,
                background: i === index ? "var(--md-primary)" : "var(--md-outline-variant)",
                opacity: cards.length > DOTS && (i === dots[0] || i === dots[dots.length - 1]) && i !== index ? 0.5 : 1,
              }}
            />
          ))}
        </div>
        <span className="text-label-md text-on-surface-variant fc-tabular sm:hidden">
          {index + 1}/{cards.length}
        </span>
        <div className="hidden sm:flex items-center">
          <span className="text-label-md text-on-surface-variant fc-tabular mr-1">
            {index + 1}/{cards.length}
          </span>
          <button type="button" className="fc-btn fc-icon-btn" aria-label={t("carousel.next")} onClick={() => go(index + 1)} disabled={index >= cards.length - 1}>
            <ChevronRight size={22} />
          </button>
          {onFullscreen ? (
            <button type="button" className="fc-btn fc-icon-btn" aria-label={t("carousel.fullscreen")} onClick={onFullscreen}>
              <Maximize2 size={20} />
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
