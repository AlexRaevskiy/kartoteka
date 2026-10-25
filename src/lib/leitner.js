/**
 * Leitner scheduling — pure functions, no React, no Firebase.
 *
 * Five boxes. A card in box N is due again BOX_INTERVAL_DAYS[N] calendar days after it was
 * last reviewed. Box 5 = mastered (never scheduled).
 *
 * Grades:
 *   "know"   → move up one box
 *   "almost" → partial credit (e.g. a small typo in Write mode): stay in the same box
 *   "again"  → back to Box 1
 *
 * Customise the intervals or the partial-credit policy here; everything else follows.
 */

export const DAY_MS = 86_400_000;
export const BOXES = [1, 2, 3, 4, 5];

/** Days until a card in this box is due again. `null` = mastered, never due. */
export const BOX_INTERVAL_DAYS = { 1: 1, 2: 2, 3: 4, 4: 8, 5: null };

/**
 * What "almost" does to a card. Options:
 *   "stay" → keep the box, restart its interval (default)
 *   "down" → drop one box (stricter)
 */
export const PARTIAL_CREDIT_POLICY = "stay";

export function nextBox(box, grade) {
  if (grade === "know") return Math.min(5, box + 1);
  if (grade === "again") return 1;
  // "almost"
  return PARTIAL_CREDIT_POLICY === "down" ? Math.max(1, box - 1) : box;
}

/**
 * New progress record after a grade, or null when nothing should change.
 *   goal "memorize" → normal Leitner.
 *   goal "cram"     → cards are shown regardless of their schedule, so a correct answer on a card
 *                     that isn't due yet must NOT push it further up (no skipping ahead);
 *                     mistakes still count and send the card back to Box 1.
 */
export function nextProgress(card, grade, { goal = "memorize", now = Date.now() } = {}) {
  if (goal === "cram" && grade !== "again" && !isDue(card, now)) return null;
  const g = gradeCard(card, grade, now);
  return { box: g.box, lastReviewed: g.lastReviewed, reviews: g.reviews, lapses: g.lapses };
}

/** Apply a grade to a card and return the updated card (immutable). */
export function gradeCard(card, grade, now = Date.now()) {
  return {
    ...card,
    box: nextBox(card.box, grade),
    lastReviewed: now,
    reviews: (card.reviews || 0) + 1,
    lapses: (card.lapses || 0) + (grade === "again" ? 1 : 0),
  };
}

/* ---------- calendar-day helpers (local time, DST-safe) ---------- */

export function startOfDay(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function addDays(ts, n) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
}

export function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
}

export function dateKey(ts = Date.now()) {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/* ---------- scheduling ---------- */

/** Start-of-day timestamp when the card becomes due, or null (new card = due now, mastered = never). */
export function nextDueAt(card) {
  const interval = BOX_INTERVAL_DAYS[card.box];
  if (interval == null || card.lastReviewed == null) return null;
  return addDays(card.lastReviewed, interval);
}

export function isDue(card, now = Date.now()) {
  if (card.box >= 5) return false;
  if (card.lastReviewed == null) return true; // never studied
  return startOfDay(now) >= startOfDay(nextDueAt(card));
}

export function plural(n, [one, few, many]) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** Summary numbers for a deck: cards per box, due per box, mastery %, next review date. */
export function deckStats(deck, now = Date.now()) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const dueByBox = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let due = 0;
  let nextDue = null;
  let nextDueCount = 0;

  for (const card of deck.cards) {
    counts[card.box] += 1;
    if (isDue(card, now)) {
      due += 1;
      dueByBox[card.box] += 1;
    } else if (card.box < 5) {
      const when = startOfDay(nextDueAt(card));
      if (nextDue === null || when < nextDue) {
        nextDue = when;
        nextDueCount = 1;
      } else if (when === nextDue) {
        nextDueCount += 1;
      }
    }
  }

  const total = deck.cards.length;
  return {
    total,
    counts,
    dueByBox,
    due,
    mastered: counts[5],
    pct: total ? Math.round((counts[5] / total) * 100) : 0,
    nextDue,
    nextDueCount,
  };
}

/** Counts for the Deck screen: not studied / still learning / mastered. */
export function progressBreakdown(cards) {
  const out = { notStudied: 0, learning: 0, mastered: 0, total: cards.length };
  for (const c of cards) {
    if (c.box >= 5) out.mastered += 1;
    else if (c.lastReviewed == null) out.notStudied += 1;
    else out.learning += 1;
  }
  return out;
}

/** Consecutive days (ending today or yesterday) with at least one review. */
export function streakFrom(log = {}, now = Date.now()) {
  let day = now;
  if (!log[dateKey(day)]) day = addDays(day, -1);
  let streak = 0;
  while (log[dateKey(day)]) {
    streak += 1;
    day = addDays(day, -1);
  }
  return streak;
}
