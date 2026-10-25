/**
 * Study rounds.
 *
 * A session is a series of short rounds (10/20/30 cards). After each round the learner sees
 * the round summary and either finishes or continues:
 *   - "Continue" with mistakes → a round made ONLY of the cards missed in this round
 *     (reinforcement: it does not move Leitner boxes again, the miss is already recorded);
 *   - "Next round"             → the next batch from the pool.
 *
 * An item is one card from one deck: { key, deckId, card } — so a folder session can mix
 * cards from many decks and still write progress back to the right deck.
 */
import { isDue } from "./leitner.js";
import { shuffle } from "./utils.js";

export const ROUND_SIZES = [10, 20, 30];

/**
 * Big decks are learned in portions: one study session takes at most this many NEW (never
 * studied) cards, plus the cards that are still being learned. The next session takes the next
 * portion, in deck order. Once no new cards are left, the whole deck is in play again.
 */
export const MAX_NEW_PER_SESSION = 15;

/** Never graded (Leitner "new"). Cards met in Intro mode are still new here — and come first. */
export const isNewCard = (item) => item.card.lastReviewed == null;

/** Not even seen in Intro mode yet ("Not studied" in the progress block). */
export const isUnseenCard = (item) => isNewCard(item) && !item.card.introducedAt;

/** Words in progress: met in Intro or graded, not mastered. The Intro gate counts these. */
export const LEARNING_LIMIT = 15;
export const DEFAULT_ROUND_SIZE = 20;

export const itemKey = (deckId, cardId) => `${deckId}:${cardId}`;

export function toItems(deck, cards) {
  return cards.map((card) => ({ key: itemKey(deck.id, card.id), deckId: deck.id, deck, card }));
}

/**
 * Ordered candidates for the next round.
 *   memorize → only cards due today: reviews first (lowest box first), then new cards
 *   cram     → every card, weakest first (not studied / low boxes), mastered last
 * `exclude`  = keys already used in this session.
 * `newLimit` = how many new cards may still join this session (portions, see
 *              MAX_NEW_PER_SESSION). New cards are taken in deck order, so the next session
 *              continues where this one stopped. In cram, while the deck still has new cards,
 *              the pool is "still learning" + the next new portion; mastered cards wait until
 *              every card has been studied once.
 */
export function buildPool(items, { goal = "memorize", now = Date.now(), exclude = new Set(), newLimit = Infinity } = {}) {
  const available = items.filter((i) => !exclude.has(i.key));
  // New cards in deck order, the ones already met in Intro first (they were the last portion).
  const freshPortion = (list) =>
    list
      .filter(isNewCard)
      .map((item, order) => ({ item, order }))
      .sort((a, b) => (b.item.card.introducedAt ? 1 : 0) - (a.item.card.introducedAt ? 1 : 0) || a.order - b.order)
      .map((x) => x.item)
      .slice(0, Math.max(0, newLimit));
  if (goal === "cram") {
    if (Number.isFinite(newLimit) && items.some(isNewCard)) {
      const learning = shuffle(available.filter((i) => !isNewCard(i) && i.card.box < 5)).sort((a, b) => a.card.box - b.card.box);
      return [...learning, ...freshPortion(available)];
    }
    const weight = (c) => (c.lastReviewed == null ? 0 : c.box); // new = weakest
    return shuffle(available).sort((a, b) => weight(a.card) - weight(b.card));
  }
  const due = available.filter((i) => isDue(i.card, now));
  const reviews = shuffle(due.filter((i) => !isNewCard(i))).sort((a, b) => a.card.box - b.card.box);
  const fresh = Number.isFinite(newLimit) ? freshPortion(due) : shuffle(due.filter(isNewCard));
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

/** Which praise to show after a round; the phrases are in the locale files (praise.<level>). */
export function praiseLevel(accuracy) {
  return accuracy === 100 ? "perfect" : accuracy >= 80 ? "great" : accuracy >= 50 ? "good" : "tough";
}
