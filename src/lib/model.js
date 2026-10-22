/**
 * Data model + normalisation.
 *
 * Firestore layout (one branch per signed-in user):
 *
 *   users/{uid}
 *     settings: { reverse: boolean, theme: "system"|"light"|"dark", installHintDismissed: boolean }
 *     log:      { "2026-10-14": 23, ... }      reviews per calendar day (for the streak)
 *
 *   users/{uid}/decks/{deckId}
 *     name, description, createdAt, updatedAt
 *     cards: Card[]
 *
 *   Card = {
 *     id, term, definition, exampleSentence,
 *     box (1–5), lastReviewed (ms | null), reviews, lapses, createdAt
 *   }
 *
 * Why cards live inside the deck document (not one document per card):
 *   - loading a deck costs 1 read instead of N (matters on the free Spark plan: 50k reads/day)
 *   - a deck is limited to MAX_CARDS_PER_DECK so the document stays under Firestore's 1 MB cap.
 */

export const MAX_CARDS_PER_DECK = 2000;
export const DEFAULT_SETTINGS = { reverse: false, theme: "system", installHintDismissed: false };

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`).replace(/-/g, "").slice(0, 16);

export function newCard({ term, definition, exampleSentence = "" }) {
  return {
    id: uid(),
    term: String(term).trim(),
    definition: String(definition).trim(),
    exampleSentence: String(exampleSentence || "").trim(),
    box: 1,
    lastReviewed: null,
    reviews: 0,
    lapses: 0,
    createdAt: Date.now(),
  };
}

/**
 * Make any card-like object safe to use. Also migrates the v1 model (front/back) to v2
 * (term/definition/exampleSentence), so old backups import cleanly.
 */
export function normalizeCard(c) {
  if (!c) return null;
  const term = c.term ?? c.front;
  const definition = c.definition ?? c.back;
  if (term == null || definition == null) return null;
  const box = Math.min(5, Math.max(1, parseInt(c.box, 10) || 1));
  return {
    id: String(c.id || uid()),
    term: String(term),
    definition: String(definition),
    exampleSentence: String(c.exampleSentence ?? c.example ?? ""),
    box,
    lastReviewed: typeof c.lastReviewed === "number" ? c.lastReviewed : null,
    reviews: Number(c.reviews) || 0,
    lapses: Number(c.lapses) || 0,
    createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
  };
}

export function normalizeDeck(d) {
  return {
    id: String(d.id),
    name: String(d.name || "Untitled deck"),
    description: String(d.description || ""),
    createdAt: typeof d.createdAt === "number" ? d.createdAt : Date.now(),
    updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : Date.now(),
    cards: Array.isArray(d.cards) ? d.cards.map(normalizeCard).filter(Boolean) : [],
  };
}
