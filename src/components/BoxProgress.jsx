/**
 * The five Leitner compartments for the active deck: cards per box (bar height is to scale
 * with the deck size), how many are due in each, and the overall mastery meter.
 * On phones the compartments collapse into one stacked bar (tap to expand) so the
 * flashcard stays within the first screen.
 */
import React, { useState } from "react";
import { ChevronDown, Trophy } from "lucide-react";
import { cx } from "../lib/utils.js";
import { BOXES, BOX_LABEL } from "../lib/leitner.js";

export default function BoxProgress({ stats }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="fc-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3 sm:mb-4">
        <div>
          <div className="fc-eyebrow">Leitner boxes</div>
          <div className="fc-display text-xl font-bold mt-0.5">
            {stats.due > 0 ? (
              <>
                <span className="fc-mono fc-accent">{stats.due}</span> due today
              </>
            ) : stats.total ? (
              "All caught up for today"
            ) : (
              "No cards yet"
            )}
          </div>
        </div>
        <div className="w-32 sm:w-56">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="fc-muted hidden sm:inline">Mastered</span>
            <span className="fc-mono font-bold sm:hidden ml-auto">{stats.pct}% mastered</span>
            <span className="fc-mono font-bold hidden sm:inline">
              {stats.mastered}/{stats.total} · {stats.pct}%
            </span>
          </div>
          <div className="fc-meter" role="progressbar" aria-label="Mastery" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats.pct}>
            <span style={{ width: `${stats.pct}%`, background: "var(--good)" }} />
          </div>
        </div>
      </div>

      {/* Phone: compact stacked bar */}
      <button
        type="button"
        className="sm:hidden w-full text-left fc-focus rounded-lg"
        aria-expanded={expanded}
        aria-controls="box-drawers"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex h-2.5 rounded-full overflow-hidden fc-surface2" aria-hidden="true">
          {BOXES.map((b) =>
            stats.counts[b] ? <span key={b} style={{ width: `${(stats.counts[b] / stats.total) * 100}%`, background: `var(--box-${b})` }} /> : null
          )}
        </div>
        <div className="flex items-center justify-between mt-2 text-xs">
          <span className="flex gap-2.5 fc-mono">
            {BOXES.map((b) => (
              <span key={b} className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: `var(--box-${b})` }} />
                {stats.counts[b]}
              </span>
            ))}
          </span>
          <span className="inline-flex items-center gap-1 fc-muted font-bold">
            Boxes <ChevronDown size={14} style={{ transform: expanded ? "rotate(180deg)" : "none" }} />
          </span>
        </div>
      </button>

      <div id="box-drawers" className={cx("grid-cols-5 gap-2 sm:gap-3 sm:grid", expanded ? "grid mt-4 sm:mt-0" : "hidden")}>
        {BOXES.map((b) => {
          const count = stats.counts[b];
          const height = stats.total ? (count / stats.total) * 100 : 0;
          const due = stats.dueByBox[b];
          return (
            <div key={b} className="min-w-0 flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-xs font-bold inline-flex items-center gap-1">
                  {b === 5 ? <Trophy size={12} className="fc-good" /> : null}
                  <span className="hidden sm:inline">Box</span> {b}
                </span>
                <span className="fc-mono text-sm font-bold">{count}</span>
              </div>
              <div
                className="fc-drawer h-14 sm:h-20"
                role="img"
                aria-label={`Box ${b}: ${count} card${count === 1 ? "" : "s"}${due ? `, ${due} due` : ""}`}
              >
                <div className="fc-drawer-fill" style={{ height: `${height}%`, backgroundColor: `var(--box-${b})` }} />
              </div>
              <div className="text-xs fc-muted leading-tight truncate">{BOX_LABEL[b]}</div>
              <div className="text-xs leading-tight h-4">{due ? <span className="fc-accent font-bold fc-mono">{due} due</span> : null}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
