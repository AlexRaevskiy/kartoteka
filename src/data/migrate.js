/**
 * One-time migration of v2 data (decks stored in users/{uid}/decks with progress inside the cards)
 * to the v3 model (shareable decks/{id} + per-user progress in users/{uid}/library/{id}).
 *
 * - Runs automatically after sign-in when old decks are found. Safe to re-run: migrated
 *   legacy docs get `migratedAt` and are skipped next time. They are NOT deleted, so the
 *   old data stays as a fallback.
 * - Deck ids are kept, so nothing that pointed at a deck breaks.
 * - Migrated decks are private ("Только я") — share them explicitly later.
 * - Old decks have no folder labels; that's fine, they simply aren't in any folder yet.
 * - Streak: v2 only had a per-day review log; the current streak is rebuilt from it once.
 */
import * as store from "./store.js";
import { normalizeDeck, progressFromLegacyCard } from "../lib/model.js";

export async function migrateLegacyDecks(uid, ownerName) {
  const legacy = (await store.getLegacyDecks(uid)).filter((d) => !d.data.migratedAt);
  if (!legacy.length) return 0;

  const items = legacy.map(({ id, data }) => {
    const deck = normalizeDeck(id, { ...data, ownerId: uid, ownerName, visibility: "private", editPolicy: "owner" });
    const progress = {};
    (data.cards || []).forEach((c, i) => {
      const p = progressFromLegacyCard(c);
      const card = deck.cards[i];
      if (p && card) progress[card.id] = p;
    });
    return {
      deck,
      entry: { ownerId: uid, title: deck.title, addedAt: deck.createdAt, progress, starred: [] },
    };
  });

  await store.writeDecksWithProgress(uid, items);
  await store.markLegacyMigrated(legacy.map((d) => d.ref));
  return items.length;
}

export { profileBackfill } from "../lib/profileBackfill.js";
