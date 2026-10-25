import React from "react";
import { BOX_INTERVAL_DAYS, nextBox, plural } from "../../lib/leitner.js";

/** One line under each card that explains what the answer does to the Leitner box. */
export default function RatingHint({ card, tracked, goal = "memorize", showAlmost = false }) {
  if (!tracked) return <span>Повтор ошибок: коробки Лейтнера не меняются.</span>;
  if (goal === "cram") return <span>Зубрёжка: ошибки отправят карточку в коробку 1, верные ответы не сдвигают расписание.</span>;
  const up = nextBox(card.box, "know");
  const days = BOX_INTERVAL_DAYS[up];
  return (
    <span>
      Знаю → коробка {up}
      {up === 5 ? " (выучено)" : `, повтор через ${days} ${plural(days, ["день", "дня", "дней"])}`}.
      {showAlmost ? ` Почти → остаётся в коробке ${nextBox(card.box, "almost")}.` : ""} Ещё учу → коробка 1, завтра.
    </span>
  );
}
