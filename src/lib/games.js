/**
 * Game modes — pure helpers, no React.
 *
 *   Match  (pairs): the round's cards are split into boards of at most MATCH_BOARD_PAIRS pairs,
 *          so the tiles stay big enough on a phone; the next board appears when one is cleared.
 *          Cards with the same text are interchangeable: any term tile matches any definition
 *          tile that forms a real card of the board.
 *   Blitz  (true / false): half the time the card's own translation, half the time the
 *          translation of another card of the session.
 *
 * Both grade through the normal Leitner flow: a pair found without a single wrong pair / a right
 * true-false answer = "know", otherwise "again".
 */
import { tidy } from "./levenshtein.js";

export const MATCH_BOARD_PAIRS = 6;

const norm = (s) => tidy(String(s ?? "")).toLowerCase();

/** Split the round into boards of at most `maxPairs`, as even as possible (20 → 5+5+5+5, 7 → 4+3). */
export function matchBoards(items, maxPairs = MATCH_BOARD_PAIRS) {
  if (!items?.length) return [];
  const count = Math.ceil(items.length / maxPairs);
  const base = Math.floor(items.length / count);
  const extra = items.length % count;
  const boards = [];
  let at = 0;
  for (let b = 0; b < count; b += 1) {
    const n = base + (b < extra ? 1 : 0);
    boards.push(items.slice(at, at + n));
    at += n;
  }
  return boards;
}

/**
 * Which card a tapped term tile + definition tile stand for, or null when they are not a pair.
 *   termTile / defTile: { key, text }   cards: [{ key, term, definition }] of the board
 *   done: keys already matched (each card is matched once)
 */
export function matchPairKey(termTile, defTile, cards, done = new Set()) {
  if (termTile.key === defTile.key && !done.has(termTile.key)) return termTile.key;
  const t = norm(termTile.text);
  const d = norm(defTile.text);
  const hit = cards.find((c) => !done.has(c.key) && norm(c.term) === t && norm(c.definition) === d);
  return hit ? hit.key : null;
}

/** Leitner grade for a matched pair: clean = "know"; any wrong pair with this word = "again". */
export const matchGrade = (key, errorKeys) => (errorKeys.has(key) ? "again" : "know");

/**
 * The translation shown in Blitz: { definition, isCorrect }.
 * The wrong one comes from another card of the session and never reads like the right one.
 */
export function blitzPrompt(card, pool = [], rand = Math.random) {
  const own = norm(card.definition);
  const others = pool.filter((c) => c.id !== card.id && norm(c.definition) && norm(c.definition) !== own);
  if (!others.length || rand() < 0.5) return { definition: card.definition, isCorrect: true };
  const pick = others[Math.min(others.length - 1, Math.floor(rand() * others.length))];
  return { definition: pick.definition, isCorrect: false };
}

/** Blitz grade: "true" on the real translation or "false" on a fake one = "know". */
export const blitzGrade = (saidTrue, isCorrect) => (saidTrue === isCorrect ? "know" : "again");

/** 75 → "1:15" (the Match timer and the round summary). */
export function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
