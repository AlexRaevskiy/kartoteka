/**
 * Letter-by-letter comparison built from the Levenshtein alignment (src/lib/levenshtein.js).
 *   Вы:      red = wrong letter, struck-through = extra letter, ‸ = a letter is missing here
 *   Верно:   green = the right letter, underlined = the letter you left out
 */
import React from "react";

const show = (ch) => (ch === " " ? " " : ch);

export default function DiffView({ ops, compact = false }) {
  const typos = ops.filter((o) => o.type !== "match").length;
  return (
    <div className="flex flex-col gap-2" aria-label={`Отличий: ${typos}`}>
      <div className="grid gap-x-3 gap-y-1 items-baseline" style={{ gridTemplateColumns: "auto minmax(0, 1fr)" }}>
        <span className="text-label-md text-on-surface-variant">Вы</span>
        <div className="fc-diff">
          {ops.map((o, i) => {
            if (o.type === "match") return <span key={i}>{show(o.a)}</span>;
            if (o.type === "sub") return <span key={i} className="d-wrong">{show(o.a)}</span>;
            if (o.type === "ins") return <span key={i} className="d-extra">{show(o.a)}</span>;
            return (
              <span key={i} className="d-gap" title="пропущена буква">
                ‸
              </span>
            );
          })}
        </div>
        <span className="text-label-md text-on-surface-variant">Верно</span>
        <div className="fc-diff">
          {ops.map((o, i) => {
            if (o.type === "match") return <span key={i}>{show(o.b)}</span>;
            if (o.type === "sub") return <span key={i} className="d-fix">{show(o.b)}</span>;
            if (o.type === "del") return <span key={i} className="d-missing">{show(o.b)}</span>;
            return null;
          })}
        </div>
      </div>
      {!compact ? (
        <p className="text-body-sm text-on-surface-variant">
          <span className="fc-bad font-medium">Красным</span> — неверная или лишняя буква, <span className="fc-good font-medium">зелёным</span> — как правильно,{" "}
          <span className="fc-bad font-medium">‸</span> — пропущена буква.
        </p>
      ) : null}
    </div>
  );
}
