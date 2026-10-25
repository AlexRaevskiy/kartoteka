/**
 * Data model (schema v3) + normalisation / backward compatibility.
 *
 * ─── Firestore layout ───────────────────────────────────────────────────────
 *
 *   decks/{deckId}                 deck CONTENT, shareable by link
 *     ownerId, ownerName, ownerPhotoURL, title, description,
 *     termLang, defLang,                         BCP-47 code or "auto"
 *     visibility: "public" | "password" | "private"
 *     editPolicy: "owner" | "password"
 *     cards: [{ id, term, definition, exampleSentence }]
 *     cardCount, createdAt, updatedAt, copiedFrom?
 *
 *   deckStubs/{deckId}             tiny public card shown before access is granted
 *     ownerId, ownerName, title, visibility, cardCount, updatedAt
 *
 *   deckSecrets/{deckId}           owner-only: { ownerId, passwordHash }
 *   decks/{deckId}/grants/{uid}    "this user typed the right password": { passwordHash }
 *
 *   folders/{folderId}             a folder = a label that many decks can carry
 *     ownerId, ownerName, name, color,
 *     deckIds: [deckId]                          which decks carry this folder label
 *     tags: [{ id, name, deckIds: [] }]          sub-labels inside the folder ("Экзамен 1")
 *     visibility: "private" | "public", createdAt, updatedAt
 *
 *   users/{uid}                    profile: settings, streak, daily progress, push tokens
 *   users/{uid}/library/{deckId}   PER-USER study state for any deck (own or shared):
 *     ownerId, title, addedAt, lastStudiedAt,
 *     starred: [cardId],
 *     progress: { [cardId]: { box, lastReviewed, reviews, lapses } }
 *
 *   users/{uid}/decks/{deckId}     LEGACY v2 decks (cards + progress together).
 *                                  Migrated automatically on first sign-in (src/data/migrate.js).
 *
 * Why progress is separate from the deck: a shared deck is studied by many people,
 * and each of them needs their own Leitner boxes. Grading a card writes ONE field
 * (progress.<cardId>) of the user's library doc, so two devices never overwrite each other.
 *
 * Why folders keep the deck list (instead of a `tags` field on the deck): a folder can be
 * shared by link and can contain decks owned by other people, which you can't write to.
 * Old decks therefore need no new field at all: they simply aren't in any folder yet.
 */

export const SCHEMA_VERSION = 3;
export const MAX_CARDS_PER_DECK = 2000;

// Labels and hints live in the locale files: visibility.<value>.label / editPolicy.<value>.label.
export const VISIBILITY_OPTIONS = [{ value: "public" }, { value: "password" }, { value: "private" }];
export const EDIT_OPTIONS = [{ value: "password" }, { value: "owner" }];

export const FOLDER_COLORS = ["#3A4DBF", "#00696B", "#8B4A00", "#7A3E9D", "#B3261E", "#2F6A2E", "#5D5F71"];

export const DEFAULT_SETTINGS = {
  theme: "system", // system | light | dark
  reverse: false, // study Definition → Term
  roundSize: 20, // cards per round
  dailyGoal: { type: "rounds", value: 3 }, // { type: "minutes" | "rounds", value }
  notify: { enabled: false, schedule: "evening", timezone: null, localHours: [20], utcHours: [] },
  installHintDismissed: false,
  lastStudy: null, // { kind: "deck" | "folder", id, title, mode, goal, at }
};

export const EMPTY_PROGRESS = { box: 1, lastReviewed: null, reviews: 0, lapses: 0 };

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`)
    .replace(/-/g, "")
    .slice(0, 20);

/* ---------- cards ---------- */

export function newCard({ term = "", definition = "", exampleSentence = "" } = {}) {
  return { id: uid(), term: String(term).trim(), definition: String(definition).trim(), exampleSentence: String(exampleSentence || "").trim() };
}

/** Card CONTENT only. Accepts v1 (front/back), v2 (term/definition + progress) and v3. */
export function normalizeCardContent(c) {
  if (!c) return null;
  const term = c.term ?? c.front;
  const definition = c.definition ?? c.back;
  if (term == null || definition == null) return null;
  return {
    id: String(c.id || uid()),
    term: String(term),
    definition: String(definition),
    exampleSentence: String(c.exampleSentence ?? c.example ?? ""),
  };
}

/** Leitner progress stored inside a v1/v2 card, or null if the card was never studied. */
export function progressFromLegacyCard(c) {
  if (!c) return null;
  const box = Math.min(5, Math.max(1, parseInt(c.box, 10) || 1));
  const lastReviewed = typeof c.lastReviewed === "number" ? c.lastReviewed : null;
  if (box === 1 && lastReviewed == null) return null;
  return { box, lastReviewed, reviews: Number(c.reviews) || 0, lapses: Number(c.lapses) || 0 };
}

export function normalizeProgress(p) {
  if (!p) return { ...EMPTY_PROGRESS };
  return {
    box: Math.min(5, Math.max(1, parseInt(p.box, 10) || 1)),
    lastReviewed: typeof p.lastReviewed === "number" ? p.lastReviewed : null,
    reviews: Number(p.reviews) || 0,
    lapses: Number(p.lapses) || 0,
  };
}

/** Merge deck cards with a user's progress map → cards the Leitner functions understand. */
export function withProgress(cards, progressMap) {
  return cards.map((c) => ({ ...c, ...normalizeProgress(progressMap?.[c.id]) }));
}

/** "new" | "learning" | "mastered" — the three buckets of the Deck screen's progress block. */
export function progressCategory(card) {
  if (card.box >= 5) return "mastered";
  if (card.lastReviewed == null) return "new";
  return "learning";
}

/* ---------- decks ---------- */

const VIS = new Set(["public", "password", "private"]);
const EDIT = new Set(["owner", "password"]);
const ts = (v) => (typeof v === "number" ? v : v?.toMillis?.() ?? Date.now());

/** Any deck document (v3, or a legacy v2 deck that used `name`) → a safe deck object. */
export function normalizeDeck(id, d = {}) {
  const cards = Array.isArray(d.cards) ? d.cards.map(normalizeCardContent).filter(Boolean) : [];
  return {
    id: String(id),
    ownerId: d.ownerId || null,
    ownerName: d.ownerName || "",
    ownerPhotoURL: d.ownerPhotoURL || "",
    title: String(d.title ?? d.name ?? "Без названия"),
    description: String(d.description || ""),
    termLang: d.termLang || "auto",
    defLang: d.defLang || "auto",
    visibility: VIS.has(d.visibility) ? d.visibility : "private",
    editPolicy: EDIT.has(d.editPolicy) ? d.editPolicy : "owner",
    cards,
    cardCount: cards.length,
    createdAt: ts(d.createdAt),
    updatedAt: ts(d.updatedAt),
    copiedFrom: d.copiedFrom || null,
  };
}

/** Fields written to decks/{id}. */
export function deckPayload(deck) {
  return {
    ownerId: deck.ownerId,
    ownerName: deck.ownerName || "",
    ownerPhotoURL: deck.ownerPhotoURL || "",
    title: deck.title.trim() || "Без названия",
    description: (deck.description || "").trim(),
    termLang: deck.termLang || "auto",
    defLang: deck.defLang || "auto",
    visibility: deck.visibility,
    editPolicy: deck.editPolicy,
    cards: deck.cards.slice(0, MAX_CARDS_PER_DECK).map(({ id, term, definition, exampleSentence }) => ({
      id,
      term,
      definition,
      exampleSentence: exampleSentence || "",
    })),
    cardCount: Math.min(deck.cards.length, MAX_CARDS_PER_DECK),
    createdAt: deck.createdAt,
    updatedAt: deck.updatedAt,
    ...(deck.copiedFrom ? { copiedFrom: deck.copiedFrom } : {}),
  };
}

export const stubPayload = (deck) => ({
  ownerId: deck.ownerId,
  ownerName: deck.ownerName || "",
  title: deck.title,
  visibility: deck.visibility,
  cardCount: deck.cards.length,
  updatedAt: deck.updatedAt,
});

/* ---------- folders ---------- */

export function normalizeFolder(id, f = {}) {
  const deckIds = Array.isArray(f.deckIds) ? [...new Set(f.deckIds.map(String))] : [];
  return {
    id: String(id),
    ownerId: f.ownerId || null,
    ownerName: f.ownerName || "",
    name: String(f.name || "Папка"),
    color: f.color || FOLDER_COLORS[0],
    deckIds,
    tags: Array.isArray(f.tags)
      ? f.tags.filter((t) => t && t.id).map((t) => ({ id: String(t.id), name: String(t.name || "Тег"), deckIds: Array.isArray(t.deckIds) ? t.deckIds.map(String) : [] }))
      : [],
    visibility: f.visibility === "public" ? "public" : "private",
    createdAt: ts(f.createdAt),
    updatedAt: ts(f.updatedAt),
  };
}

/* ---------- library (per-user study state) ---------- */

export function normalizeLibraryEntry(id, e = {}) {
  return {
    deckId: String(id),
    ownerId: e.ownerId || null,
    title: e.title || "",
    addedAt: ts(e.addedAt),
    lastStudiedAt: typeof e.lastStudiedAt === "number" ? e.lastStudiedAt : null,
    starred: Array.isArray(e.starred) ? e.starred.map(String) : [],
    progress: e.progress && typeof e.progress === "object" ? e.progress : {},
  };
}
