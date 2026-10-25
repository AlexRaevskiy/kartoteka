/**
 * One set in a list (Home, Folder): title, card count, author (if not yours), due badge and
 * a stacked bar of the Leitner boxes.
 */
import React from "react";
import { Link } from "react-router-dom";
import { Lock, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BOXES, deckStats } from "../lib/leitner.js";
import { cx } from "../lib/utils.js";

export default function DeckListItem({ deck, now, trailing, selected }) {
  const { t } = useTranslation();
  const s = deckStats(deck, now);
  return (
    <div className={cx("rounded-2xl flex items-center gap-2 pr-1", selected ? "bg-secondary-container" : "bg-surface-container-low")}>
      <Link to={`/deck/${deck.id}`} className="flex-1 min-w-0 p-4 fc-focus rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-title-md truncate">{deck.title}</div>
            <div className="text-body-sm text-on-surface-variant mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span className="fc-tabular">
                {t("deck.cardCount", { count: s.total })}
              </span>
              {!deck.own ? (
                <span className="inline-flex items-center gap-1">
                  · <UserRound size={12} /> {deck.ownerName || t("deck.author")}
                </span>
              ) : null}
            </div>
          </div>
          {s.due > 0 ? (
            <span className="fc-badge fc-badge-primary fc-tabular shrink-0">{t("deckItem.due", { count: s.due })}</span>
          ) : s.total > 0 && s.mastered === s.total ? (
            <span className="fc-badge fc-badge-good shrink-0">{t("deckItem.mastered")}</span>
          ) : null}
        </div>
        {s.total ? (
          <div className="flex h-1.5 rounded-full overflow-hidden mt-3 bg-surface-container-highest" aria-hidden="true">
            {BOXES.map((b) => (s.counts[b] ? <span key={b} style={{ width: `${(s.counts[b] / s.total) * 100}%`, background: `var(--box-${b})` }} /> : null))}
          </div>
        ) : null}
      </Link>
      {trailing}
    </div>
  );
}

/** Placeholder row for a deck in a shared folder that you can't open. */
export function UnavailableDeckItem() {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl bg-surface-container-low p-4 flex items-center gap-3 text-on-surface-variant">
      <Lock size={18} />
      <span className="text-body-md">{t("deckItem.unavailable")}</span>
    </div>
  );
}
