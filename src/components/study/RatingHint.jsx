import React from "react";
import { useTranslation } from "react-i18next";
import { BOX_INTERVAL_DAYS, nextBox } from "../../lib/leitner.js";

/** One line under each card that explains what the answer does to the Leitner box. */
export default function RatingHint({ card, tracked, goal = "memorize", showAlmost = false }) {
  const { t } = useTranslation();
  if (!tracked) return <span>{t("ratingHint.retry")}</span>;
  if (goal === "cram") return <span>{t("ratingHint.cram")}</span>;
  const up = nextBox(card.box, "know");
  const days = BOX_INTERVAL_DAYS[up];
  return (
    <span>
      {t("ratingHint.know", { box: up })}
      {up === 5 ? t("ratingHint.mastered") : t("ratingHint.nextReview", { when: t("time.inDays", { count: days }) })}.
      {showAlmost ? t("ratingHint.almost", { box: nextBox(card.box, "almost") }) : ""}
      {t("ratingHint.again")}
    </span>
  );
}
