/**
 * Full JSON backup (Profile → Export data) and restore.
 *
 * Format v3:
 * {
 *   app: "kartoteka", version: 3, exportedAt,
 *   account: { uid, email, guest },
 *   profile: { settings, currentStreak, longestStreak, lastStudyDate, dailyProgress, log },
 *   decks:   [{ id, title, description, termLang, defLang, visibility, editPolicy, createdAt,
 *              cards: [{ id, term, definition, exampleSentence }],
 *              progress: { cardId: { box, lastReviewed, reviews, lapses } }, starred: [cardId] }],
 *   folders: [{ name, color, deckIds: [oldDeckId], tags: [{ name, deckIds }] }]
 * }
 * Restore also accepts v1/v2 backups (progress stored inside each card).
 */
import { MAX_CARDS_PER_DECK, normalizeCardContent, normalizeProgress, progressFromLegacyCard } from "./model.js";

export function buildBackup({ user, profile, decks, library, folders }) {
  return {
    app: "kartoteka",
    version: 3,
    exportedAt: new Date().toISOString(),
    account: user ? { uid: user.uid, email: user.email || null, guest: !!user.isAnonymous } : null,
    profile: {
      settings: profile?.settings || {},
      currentStreak: profile?.currentStreak || 0,
      longestStreak: profile?.longestStreak || 0,
      lastStudyDate: profile?.lastStudyDate || null,
      dailyProgress: profile?.dailyProgress || null,
      log: profile?.log || {},
    },
    decks: decks.map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      ownerName: d.ownerName,
      own: d.ownerId === user?.uid,
      termLang: d.termLang,
      defLang: d.defLang,
      visibility: d.visibility,
      editPolicy: d.editPolicy,
      createdAt: d.createdAt,
      cards: d.cards.map(({ id, term, definition, exampleSentence }) => ({ id, term, definition, exampleSentence })),
      progress: library[d.id]?.progress || {},
      starred: library[d.id]?.starred || [],
    })),
    folders: folders.map((f) => ({ name: f.name, color: f.color, deckIds: f.deckIds, tags: f.tags.map((t) => ({ name: t.name, deckIds: t.deckIds })) })),
  };
}

export function backupFilename(now = new Date()) {
  return `kartoteka-backup-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * Parse any Kartoteka backup into { decks, folders }.
 * decks: [{ oldId, title, description, termLang, defLang, cards, progress, starred }]
 * Throws an Error with `code` ("not-backup" | "empty") if the file is not a usable backup;
 * the UI shows backup.errors.<code> in the interface language.
 */
export function readBackup(json) {
  const raw = Array.isArray(json) ? json : json?.decks;
  if (!Array.isArray(raw)) throw Object.assign(new Error("Not a Kartoteka backup: no sets in the file."), { code: "not-backup" });

  const decks = raw
    .filter((d) => d && Array.isArray(d.cards))
    .map((d, i) => {
      const cards = d.cards.map(normalizeCardContent).filter(Boolean).slice(0, MAX_CARDS_PER_DECK);
      // v3 keeps progress in a map; v1/v2 kept it inside each card.
      const progress = {};
      if (d.progress && typeof d.progress === "object") {
        for (const [id, p] of Object.entries(d.progress)) progress[id] = normalizeProgress(p);
      } else {
        d.cards.forEach((c, idx) => {
          const p = progressFromLegacyCard(c);
          if (p && cards[idx]) progress[cards[idx].id] = p;
        });
      }
      return {
        oldId: String(d.id || `import-${i}`),
        title: String(d.title ?? d.name ?? "Импортированный набор"),
        description: String(d.description || ""),
        termLang: d.termLang || "auto",
        defLang: d.defLang || "auto",
        cards,
        progress,
        starred: Array.isArray(d.starred) ? d.starred : [],
      };
    });
  if (!decks.length) throw Object.assign(new Error("The backup has no sets."), { code: "empty" });

  const folders = Array.isArray(json?.folders)
    ? json.folders.filter((f) => f?.name).map((f) => ({ name: String(f.name), color: f.color, deckIds: f.deckIds || [], tags: f.tags || [] }))
    : [];
  return { decks, folders };
}
