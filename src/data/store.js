/**
 * Firestore access layer. The ONLY file that talks to Firestore directly.
 * Swap this module out (same exports) to use another backend, or to run UI tests offline.
 *
 * Paths:
 *   users/{uid}                 → { settings, log }
 *   users/{uid}/decks/{deckId}  → { name, description, createdAt, updatedAt, cards[] }
 */
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  increment,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { normalizeDeck } from "../lib/model.js";

const userRef = (uid) => doc(db, "users", uid);
const decksCol = (uid) => collection(db, "users", uid, "decks");
const deckRef = (uid, deckId) => doc(db, "users", uid, "decks", deckId);

/** A fresh Firestore document id (generated locally, works offline). */
export const newDeckId = (uid) => doc(decksCol(uid)).id;

/**
 * Live subscription to all decks. `cb(decks, { pending, fromCache })`
 * `pending` = local writes not yet confirmed by the server ("Saving…").
 */
export function subscribeDecks(uid, cb, onError) {
  return onSnapshot(
    query(decksCol(uid), orderBy("createdAt", "asc")),
    { includeMetadataChanges: true },
    (snap) => {
      const decks = snap.docs.map((d) => normalizeDeck({ id: d.id, ...d.data() }));
      cb(decks, { pending: snap.metadata.hasPendingWrites, fromCache: snap.metadata.fromCache });
    },
    onError
  );
}

/** Live subscription to the user document (settings + review log). `cb(data | null, meta)` */
export function subscribeUser(uid, cb, onError) {
  return onSnapshot(
    userRef(uid),
    { includeMetadataChanges: true },
    (snap) => cb(snap.exists() ? snap.data() : null, { pending: snap.metadata.hasPendingWrites, fromCache: snap.metadata.fromCache }),
    onError
  );
}

/** Deep-merge a patch into the user document (creates it if missing). */
export const patchUser = (uid, patch) => setDoc(userRef(uid), patch, { merge: true });

/** +1 review for a calendar day (atomic, safe across devices). */
export const incrementLog = (uid, dayKey, by = 1) => setDoc(userRef(uid), { log: { [dayKey]: increment(by) } }, { merge: true });

const deckPayload = (deck) => ({
  name: deck.name,
  description: deck.description || "",
  createdAt: deck.createdAt,
  updatedAt: deck.updatedAt,
  cards: deck.cards,
});

export const writeDeck = (uid, deck) => setDoc(deckRef(uid, deck.id), deckPayload(deck));

export const patchDeck = (uid, deckId, patch) => updateDoc(deckRef(uid, deckId), patch);

export const removeDeck = (uid, deckId) => deleteDoc(deckRef(uid, deckId));

/** Write many decks at once (backup restore, guest → Google merge). Chunks of 400 ops per batch. */
export async function writeDecksBatch(uid, decks) {
  for (let i = 0; i < decks.length; i += 400) {
    const batch = writeBatch(db);
    decks.slice(i, i + 400).forEach((deck) => batch.set(deckRef(uid, deck.id), deckPayload(deck)));
    await batch.commit();
  }
}
