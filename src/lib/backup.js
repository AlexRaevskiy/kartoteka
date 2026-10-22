/**
 * Export / import of the whole library as a JSON file.
 *
 * Export format (version 2):
 * {
 *   "app": "kartoteka",
 *   "version": 2,
 *   "exportedAt": "2026-10-14T18:00:00.000Z",
 *   "account": { "uid": "...", "email": "..." },
 *   "settings": { ... },
 *   "log": { "2026-10-14": 23 },
 *   "decks": [ { "name", "description", "createdAt", "cards": [ { term, definition, exampleSentence, box, lastReviewed, ... } ] } ]
 * }
 */
import { normalizeDeck, MAX_CARDS_PER_DECK } from "./model.js";

export function buildBackup({ user, settings, log, decks }) {
  return {
    app: "kartoteka",
    version: 2,
    exportedAt: new Date().toISOString(),
    account: user ? { uid: user.uid, email: user.email || null, guest: !!user.isAnonymous } : null,
    settings,
    log,
    decks: decks.map(({ id, ...rest }) => ({ id, ...rest })),
  };
}

/** Trigger a browser download of the backup. Works on desktop, Android and iOS 15+. */
export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function backupFilename(now = new Date()) {
  const stamp = now.toISOString().slice(0, 10);
  return `kartoteka-backup-${stamp}.json`;
}

/**
 * Validate a parsed backup (v2, or a v1 export from the single-file version) and return
 * clean decks ready to be written. Throws a readable Error if the file is not a backup.
 */
export function readBackup(json) {
  const decksRaw = Array.isArray(json) ? json : json?.decks;
  if (!Array.isArray(decksRaw)) {
    throw new Error("This file isn't a Kartoteka backup: no decks were found in it.");
  }
  const decks = decksRaw
    .filter((d) => d && Array.isArray(d.cards))
    .map((d) => normalizeDeck({ ...d, id: d.id || "import" }))
    .map((d) => ({ ...d, cards: d.cards.slice(0, MAX_CARDS_PER_DECK) }));
  if (!decks.length) throw new Error("The backup contains no decks.");
  return { decks, log: json?.log && typeof json.log === "object" ? json.log : {}, settings: json?.settings || null };
}
