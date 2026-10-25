/**
 * Mode: Learn — adaptive mix, like Quizlet "Learn".
 * New and weak cards (boxes 1–2) are asked as multiple choice (recognition);
 * once a card is in box 3+ it is asked in writing (recall), with the smart Levenshtein checker.
 */
import React from "react";
import QuizMode from "./QuizMode.jsx";
import WriteMode from "./WriteMode.jsx";

export default function LearnMode(props) {
  const { card, pool } = props;
  const enoughForChoices = (pool?.length || 0) >= 2;
  if (card.box <= 2 && enoughForChoices) return <QuizMode {...props} />;
  return <WriteMode {...props} />;
}
