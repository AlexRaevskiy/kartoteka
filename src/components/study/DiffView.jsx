/**
 * Letter-by-letter comparison built from the Levenshtein alignment (src/lib/levenshtein.js).
 *   You:      red = wrong letter, struck-through = extra letter, ‸ = a letter is missing here
 *   Correct:  green = the right letter, underlined = the letter you left out
 */
import React from "react";
import { useTranslation } from "react-i18next";

const show = (ch) => (ch === " " ? " " : ch);

export default function DiffView({ ops, compact = false }) {
  const { t } = useTranslation();
  const typos = ops.filter((o) => o.type !== "match").length;
  return (
    <div className="flex flex-col gap-2" aria-label={t("diff.aria", { count: typos })}>
      <div className="grid gap-x-3 gap-y-1 items-baseline" style={{ gridTemplateColumns: "auto minmax(0, 1fr)" }}>
        <span className="text-label-md text-on-surface-variant">{t("diff.you")}</span>
        <div className="fc-diff">
          {ops.map((o, i) => {
            if (o.type === "match") return <span key={i}>{show(o.a)}</span>;
            if (o.type === "sub") return <span key={i} className="d-wrong">{show(o.a)}</span>;
            if (o.type === "ins") return <span key={i} className="d-extra">{show(o.a)}</span>;
            return (
              <span key={i} className="d-gap" title={t("diff.missingLetter")}>
                ‸
              </span>
            );
          })}
        </div>
        <span className="text-label-md text-on-surface-variant">{t("diff.correct")}</span>
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
          <span className="fc-bad font-medium">{t("diff.red")}</span> — {t("diff.redMeaning")}, <span className="fc-good font-medium">{t("diff.green")}</span> — {t("diff.greenMeaning")},{" "}
          <span className="fc-bad font-medium">‸</span> — {t("diff.missingLetter")}.
        </p>
      ) : null}
    </div>
  );
}
