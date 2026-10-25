/**
 * Study rounds.
 *
 * A session is a series of short rounds (10/20/30 cards). After each round the learner sees
 * "Итоги раунда" and either finishes or continues:
 *   - "Продолжить" with mistakes → a round made ONLY of the cards missed in this round
 *     (reinforcement: it does not move Leitner boxes again, the miss is already recorded);
 *   - "Следующий раунд"         → the next batch from the pool.
 *
 * An item is one card from one deck: { key, deckId, card } — so a folder session can mix
 * cards from many decks and still write progress back to the right deck.
 */
import { isDue } from "./leitner.js";
import { shuffle } from "./utils.js";

export const ROUND_SIZES = [10, 20, 30];
export const DEFAULT_ROUND_SIZE = 20;

export const itemKey = (deckId, cardId) => `${deckId}:${cardId}`;

export function toItems(deck, cards) {
  return cards.map((card) => ({ key: itemKey(deck.id, card.id), deckId: deck.id, deck, card }));
}

/**
 * Ordered candidates for the next round.
 *   memorize → only cards due today: reviews first (lowest box first), then new cards
 *   cram     → every card, weakest first (not studied / low boxes), mastered last
 * `exclude` = keys already used in this session.
 */
export function buildPool(items, { goal = "memorize", now = Date.now(), exclude = new Set() } = {}) {
  const available = items.filter((i) => !exclude.has(i.key));
  if (goal === "cram") {
    const weight = (c) => (c.lastReviewed == null ? 0 : c.box); // new = weakest
    return shuffle(available).sort((a, b) => weight(a.card) - weight(b.card));
  }
  const due = available.filter((i) => isDue(i.card, now));
  const reviews = shuffle(due.filter((i) => i.card.lastReviewed != null)).sort((a, b) => a.card.box - b.card.box);
  const fresh = shuffle(due.filter((i) => i.card.lastReviewed == null));
  return [...reviews, ...fresh];
}

/** Take the next round from a pool and mix it, so reviews and new cards alternate. */
export function takeRound(pool, size = DEFAULT_ROUND_SIZE) {
  return shuffle(pool.slice(0, size));
}

/**
 * results: [{ item, grade }] — one per card, first answer only.
 * "almost" counts as correct (partial credit), "again" goes to the repeat list.
 */
export function summarizeRound(results) {
  const correct = results.filter((r) => r.grade !== "again");
  const mistakes = results.filter((r) => r.grade === "again");
  const total = results.length;
  return {
    total,
    correct: correct.length,
    almost: results.filter((r) => r.grade === "almost").length,
    mistakes: mistakes.map((r) => r.item),
    accuracy: total ? Math.round((correct.length / total) * 100) : 0,
  };
}

const PRAISE = {
  perfect: ["Безупречно! Ни одной ошибки 🎉", "Идеальный раунд! Так держать!", "100% — ты просто машина!"],
  great: ["Отличная работа!", "Очень здорово, почти без ошибок!", "Мощно! Осталось чуть-чуть дожать."],
  good: ["Хороший раунд! Ошибки — часть обучения.", "Неплохо! Повторим трудные слова?", "Ты на верном пути!"],
  tough: ["Трудный раунд — но именно так и учатся.", "Не сдавайся: повтор ошибок закрепит слова.", "Каждая ошибка сегодня — выученное слово завтра."],
};

export function praiseFor(accuracy, rnd = Math.random) {
  const list = accuracy === 100 ? PRAISE.perfect : accuracy >= 80 ? PRAISE.great : accuracy >= 50 ? PRAISE.good : PRAISE.tough;
  return list[Math.floor(rnd() * list.length)];
}
