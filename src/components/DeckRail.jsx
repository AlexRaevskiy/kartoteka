/**
 * Deck list. Vertical sidebar on desktop, horizontally scrolling strip on phones.
 */
import React from "react";
import { CalendarClock, Check, FileText, Plus, Undo2 } from "lucide-react";
import { BOXES, deckStats } from "../lib/leitner.js";

export default function DeckRail({ decks, activeId, now, onSwitch, onNew, onPaste }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="fc-eyebrow">Decks</span>
        <button type="button" className="fc-btn fc-btn-quiet px-2 py-1 text-sm" onClick={onNew}>
          <Plus size={15} /> New deck
        </button>
      </div>

      <div className="flex lg:flex-col gap-2 fc-scroll-x pb-1 lg:pb-0 -mx-1 px-1">
        {decks.map((d) => {
          const s = deckStats(d, now);
          return (
            <button
              key={d.id}
              type="button"
              className="fc-deck fc-focus p-3 w-60 lg:w-auto shrink-0"
              aria-current={d.id === activeId}
              onClick={() => onSwitch(d.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-bold leading-snug min-w-0" style={{ overflowWrap: "anywhere" }}>
                  {d.name}
                </span>
                {s.due > 0 ? (
                  <span className="fc-chip fc-chip-accent shrink-0 fc-mono">{s.due} due</span>
                ) : s.total > 0 ? (
                  <span className="fc-chip fc-chip-good shrink-0">
                    <Check size={12} /> done
                  </span>
                ) : null}
              </div>
              <div className="flex h-1.5 rounded-full overflow-hidden mt-2.5 fc-surface2" aria-hidden="true">
                {BOXES.map((b) =>
                  s.counts[b] ? <span key={b} style={{ width: `${(s.counts[b] / s.total) * 100}%`, background: `var(--box-${b})` }} /> : null
                )}
              </div>
              <div className="text-xs fc-muted mt-1.5 fc-mono">
                {s.total} cards · {s.pct}% mastered
              </div>
            </button>
          );
        })}

        <button
          type="button"
          className="fc-deck fc-focus p-3 w-60 lg:w-auto shrink-0 flex items-center gap-3"
          style={{ borderColor: "var(--border)", borderStyle: "dashed" }}
          onClick={onPaste}
        >
          <span className="w-8 h-8 rounded-lg fc-surface2 flex items-center justify-center shrink-0">
            <FileText size={16} className="fc-accent" />
          </span>
          <span className="min-w-0">
            <span className="block font-bold text-sm">Paste a word list</span>
            <span className="block text-xs fc-muted">term — definition — example</span>
          </span>
        </button>
      </div>

      <div className="hidden lg:block fc-panel p-4 mt-2 text-sm">
        <div className="fc-eyebrow mb-2">How the boxes work</div>
        <ul className="flex flex-col gap-1.5 fc-muted">
          <li className="flex gap-2">
            <Check size={15} className="fc-good mt-0.5 shrink-0" />
            <span>
              <b className="fc-fg">Know</b> moves a card up one box, so you see it less often.
            </span>
          </li>
          <li className="flex gap-2">
            <Undo2 size={15} className="fc-warn mt-0.5 shrink-0" />
            <span>
              <b className="fc-fg">Still learning</b> sends it back to Box 1 for daily review.
            </span>
          </li>
          <li className="flex gap-2">
            <CalendarClock size={15} className="fc-accent mt-0.5 shrink-0" />
            <span>Only cards due today are shown. Box 5 means mastered.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
