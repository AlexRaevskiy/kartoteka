/**
 * Letter-by-letter comparison of the learner's answer and the correct one,
 * built from the Levenshtein alignment (src/lib/levenshtein.js).
 *
 *   Your answer:  r e c [i] [e] v e      red      = wrong letter, struck-through = extra letter, ‸ = something missing here
 *   Correct:      r e c [e] [i] v e      green    = the right letter, underlined = the letter you left out
 */
import React from "react";

const show = (ch) => (ch === " " ? " " : ch); // keep spaces visible

export default function DiffView({ ops, compact = false }) {
  const typos = ops.filter((o) => o.type !== "match").length;
  return (
    <div className="flex flex-col gap-2" aria-label={`${typos} letter${typos === 1 ? "" : "s"} differ`}>
      <div className="grid gap-x-3 gap-y-1 items-baseline" style={{ gridTemplateColumns: "auto minmax(0, 1fr)" }}>
        <span className="text-xs font-bold fc-muted">You</span>
        <div className="fc-diff">
          {ops.map((o, i) => {
            if (o.type === "match") return <span key={i}>{show(o.a)}</span>;
            if (o.type === "sub") return <span key={i} className="d-wrong">{show(o.a)}</span>;
            if (o.type === "ins") return <span key={i} className="d-extra">{show(o.a)}</span>;
            return (
              <span key={i} className="d-gap" title="missing letter">
                ‸
              </span>
            );
          })}
        </div>
        <span className="text-xs font-bold fc-muted">Correct</span>
        <div className="fc-diff">
          {ops.map((o, i) => {
            if (o.type === "match") return <span key={i}>{show(o.b)}</span>;
            if (o.type === "sub") return <span key={i} className="d-fix">{show(o.b)}</span>;
            if (o.type === "del") return <span key={i} className="d-missing">{show(o.b)}</span>;
            return null; // extra letter: nothing in the correct word
          })}
        </div>
      </div>
      {!compact ? (
        <p className="text-xs fc-muted">
          <span className="fc-bad font-bold">Red</span> = wrong or extra letter, <span className="fc-good font-bold">green</span> = what it
          should be, <span className="fc-bad font-bold">‸</span> = a letter is missing.
        </p>
      ) : null}
    </div>
  );
}
