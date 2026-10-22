import React from "react";
import { BOX_INTERVAL_DAYS, nextBox } from "../../lib/leitner.js";

/** One line under each card that teaches the Leitner rules in context. */
export default function RatingHint({ card, tracked, showAlmost = false }) {
  if (!tracked) return <span>Practice round: your boxes won't change.</span>;
  const up = nextBox(card.box, "know");
  const stay = nextBox(card.box, "almost");
  return (
    <span>
      Know → Box {up}
      {up === 5 ? " (mastered)" : `, next review in ${BOX_INTERVAL_DAYS[up]} days`}.
      {showAlmost ? ` Almost → stays in Box ${stay}.` : ""} Still learning → Box 1, tomorrow.
    </span>
  );
}
