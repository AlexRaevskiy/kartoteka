/**
 * "Итоги раунда" — the clear end point of every round.
 * Praise · stats (right / to repeat) · list of mistakes (term — definition) ·
 * "Завершить" (home/back) and "Продолжить" (a round of only the missed cards; if there were
 * none — the next batch of cards).
 */
import React, { useMemo } from "react";
import { ArrowRight, Check, RotateCcw, Trophy, Undo2 } from "lucide-react";
import { praiseFor } from "../../lib/rounds.js";
import { speechLang } from "../../lib/languages.js";
import { ProgressBar, SpeakButton } from "../ui.jsx";

export default function RoundSummary({ summary, kind, hasMore, onFinish, onContinueMistakes, onNextRound, onSpeak }) {
  const praise = useMemo(() => praiseFor(summary.accuracy), [summary]);
  const mistakes = summary.mistakes;
  const repeat = mistakes.length;

  let continueButton = null;
  if (repeat) {
    continueButton = (
      <button type="button" className="fc-btn fc-btn-filled fc-btn-lg flex-1" onClick={onContinueMistakes} autoFocus>
        <RotateCcw size={20} /> Продолжить
      </button>
    );
  } else if (hasMore) {
    continueButton = (
      <button type="button" className="fc-btn fc-btn-filled fc-btn-lg flex-1" onClick={onNextRound} autoFocus>
        Продолжить <ArrowRight size={20} />
      </button>
    );
  }

  return (
    <section className="flex flex-col gap-5 fc-in" aria-labelledby="summary-title">
      <div className="text-center pt-2">
        <div className="fc-pop mx-auto w-20 h-20 rounded-3xl bg-success-container text-success flex items-center justify-center">
          <Trophy size={40} />
        </div>
        <div className="text-label-lg text-on-surface-variant mt-4">{kind === "retry" ? "Итоги повтора" : "Итоги раунда"}</div>
        <h1 id="summary-title" className="text-headline-sm mt-1 text-balance">
          {praise}
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl bg-success-container p-4 text-center">
          <div className="text-display-sm fc-tabular text-success">{summary.correct}</div>
          <div className="text-label-lg">верно</div>
        </div>
        <div className="rounded-3xl bg-warning-container p-4 text-center">
          <div className="text-display-sm fc-tabular text-warning">{repeat}</div>
          <div className="text-label-lg">на повторение</div>
        </div>
      </div>
      <div>
        <ProgressBar value={summary.accuracy} color="var(--md-success)" label="Точность" />
        <div className="text-body-sm text-on-surface-variant mt-1.5 text-center fc-tabular">
          {summary.accuracy}% с первой попытки{summary.almost ? ` · ${summary.almost} с частичным зачётом` : ""}
        </div>
      </div>

      {repeat ? (
        <div>
          <h2 className="text-title-md mb-2 flex items-center gap-2">
            <Undo2 size={18} className="fc-warn" /> Слова с ошибками
          </h2>
          <ul className="flex flex-col gap-2">
            {mistakes.map((item) => (
              <li key={item.key} className="rounded-2xl bg-surface-container-low pl-4 pr-1 py-2 flex items-center gap-2">
                <div className="flex-1 min-w-0 py-1">
                  <div className="text-title-md" style={{ overflowWrap: "anywhere" }}>
                    {item.card.term}
                  </div>
                  <div className="text-body-md text-on-surface-variant" style={{ overflowWrap: "anywhere" }}>
                    {item.card.definition}
                  </div>
                </div>
                <SpeakButton text={item.card.term} lang={speechLang(item.deck, "term", item.card.term)} onSpeak={onSpeak} />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-body-md text-on-surface-variant text-center flex items-center justify-center gap-2">
          <Check size={18} className="fc-good" /> Ошибок нет — {hasMore ? "можно дальше!" : "на сегодня это все карточки."}
        </p>
      )}

      <div className="flex gap-3 sticky bottom-0 pt-2 pb-1 bg-surface" style={{ paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))" }}>
        <button type="button" className="fc-btn fc-btn-outlined fc-btn-lg flex-1" onClick={onFinish}>
          Завершить
        </button>
        {continueButton}
      </div>
      {repeat && hasMore ? (
        <button type="button" className="fc-btn fc-btn-text self-center -mt-2" onClick={onNextRound}>
          Пропустить ошибки — следующий раунд
        </button>
      ) : null}
    </section>
  );
}
