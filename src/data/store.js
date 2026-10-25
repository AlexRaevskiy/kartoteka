/**
 * Firestore access layer — the ONLY module that imports firebase/firestore.
 * Every other file goes through these functions, so the backend can be swapped or mocked.
 * Schema: see src/lib/model.js.
 */
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase.js";
import {
  deckPayload,
  normalizeDeck,
  normalizeFolder,
  normalizeLibraryEntry,
  stubPayload,
} from "../lib/model.js";

export const refs = {
  user: (uid) => doc(db, "users", uid),
  library: (uid) => collection(db, "users", uid, "library"),
  libEntry: (uid, deckId) => doc(db, "users", uid, "library", deckId),
  legacyDecks: (uid) => collection(db, "users", uid, "decks"),
  deck: (id) => doc(db, "decks", id),
  stub: (id) => doc(db, "deckStubs", id),
  secret: (id) => doc(db, "deckSecrets", id),
  grant: (deckId, uid) => doc(db, "decks", deckId, "grants", uid),
  folder: (id) => doc(db, "folders", id),
  audio: (id) => doc(db, "audio_cache", id),
};

/** New random document id, generated offline. */
export const newId = (col = "decks") => doc(collection(db, col)).id;

const meta = (snap) => ({ pending: snap.metadata.hasPendingWrites, fromCache: snap.metadata.fromCache });
const opts = { includeMetadataChanges: true };

/* ---------- subscriptions ---------- */

export const subscribeUser = (uid, cb, onError) =>
  onSnapshot(refs.user(uid), opts, (s) => cb(s.exists() ? s.data() : {}, meta(s)), onError);

export const subscribeOwnDecks = (uid, cb, onError) =>
  onSnapshot(
    query(collection(db, "decks"), where("ownerId", "==", uid)),
    opts,
    (s) => cb(s.docs.map((d) => normalizeDeck(d.id, d.data())), meta(s)),
    onError
  );

export const subscribeLibrary = (uid, cb, onError) =>
  onSnapshot(refs.library(uid), opts, (s) => cb(s.docs.map((d) => normalizeLibraryEntry(d.id, d.data())), meta(s)), onError);

export const subscribeOwnFolders = (uid, cb, onError) =>
  onSnapshot(
    query(collection(db, "folders"), where("ownerId", "==", uid)),
    opts,
    (s) => cb(s.docs.map((d) => normalizeFolder(d.id, d.data())), meta(s)),
    onError
  );

/** One deck by id (someone else's shared deck, or a deck you saved). cb(null) if it doesn't exist. */
export const subscribeDeck = (id, cb, onError) =>
  onSnapshot(refs.deck(id), (s) => cb(s.exists() ? normalizeDeck(s.id, s.data()) : null), onError);

export const subscribeFolder = (id, cb, onError) =>
  onSnapshot(refs.folder(id), (s) => cb(s.exists() ? normalizeFolder(s.id, s.data()) : null), onError);

/** Cached pronunciation (written only by netlify/functions/tts.js). Base64 MP3 or null. */
export async function getCachedAudio(id) {
  const s = await getDoc(refs.audio(id));
  return s.exists() ? s.data().audioBase64 || null : null;
}

export async function getStub(id) {
  const s = await getDoc(refs.stub(id));
  return s.exists() ? s.data() : null;
}

/* ---------- user ---------- */

/** Deep-merge into users/{uid} (creates it if needed). Arrays are replaced, maps are merged. */
export const patchUser = (uid, patch) => setDoc(refs.user(uid), patch, { merge: true });

export const addPushToken = (uid, token) => setDoc(refs.user(uid), { fcmTokens: arrayUnion(token) }, { merge: true });
export const removePushToken = (uid, token) => setDoc(refs.user(uid), { fcmTokens: arrayRemove(token) }, { merge: true });

/* ---------- decks ---------- */

/** Create or fully update a deck you OWN (deck + public stub + optional password hash). */
export async function saveOwnDeck(deck, { passwordHash } = {}) {
  const batch = writeBatch(db);
  batch.set(refs.deck(deck.id), deckPayload(deck));
  batch.set(refs.stub(deck.id), stubPayload(deck));
  if (passwordHash) batch.set(refs.secret(deck.id), { ownerId: deck.ownerId, passwordHash });
  await batch.commit();
}

/** Content-only update by a password editor (the rules forbid touching privacy/ownership). */
export async function saveDeckAsEditor(deck) {
  const p = deckPayload(deck);
  const batch = writeBatch(db);
  batch.update(refs.deck(deck.id), {
    title: p.title,
    description: p.description,
    cards: p.cards,
    cardCount: p.cardCount,
    updatedAt: p.updatedAt,
    termLang: p.termLang,
    defLang: p.defLang,
  });
  batch.update(refs.stub(deck.id), { title: p.title, cardCount: p.cardCount, updatedAt: p.updatedAt });
  await batch.commit();
}

export async function deleteOwnDeck(deckId) {
  const batch = writeBatch(db);
  batch.delete(refs.deck(deckId));
  batch.delete(refs.stub(deckId));
  batch.delete(refs.secret(deckId));
  await batch.commit();
}

/** "I know the password": the rules check the hash against deckSecrets. Throws permission-denied if wrong. */
export const createGrant = (deckId, uid, passwordHash) => setDoc(refs.grant(deckId, uid), { passwordHash, createdAt: Date.now() });

/** Does this user hold a (current) grant? Used to show "Edit" for password editors. */
export async function hasGrant(deckId, uid) {
  try {
    return (await getDoc(refs.grant(deckId, uid))).exists();
  } catch {
    return false;
  }
}

/* ---------- library (per-user progress) ---------- */

const libMeta = (deck) => ({ ownerId: deck.ownerId || null, title: deck.title || "" });

export const setCardProgress = (uid, deck, cardId, progress, now = Date.now()) =>
  setDoc(refs.libEntry(uid, deck.id), { ...libMeta(deck), lastStudiedAt: now, progress: { [cardId]: progress } }, { merge: true });

export const setStar = (uid, deck, cardId, on) =>
  setDoc(refs.libEntry(uid, deck.id), { ...libMeta(deck), starred: on ? arrayUnion(cardId) : arrayRemove(cardId) }, { merge: true });

/** Make sure a deck appears in "my library" (e.g. after opening a shared link and studying it). */
export const touchLibrary = (uid, deck, { studied = false } = {}) =>
  setDoc(
    refs.libEntry(uid, deck.id),
    { ...libMeta(deck), ...(studied ? { lastStudiedAt: Date.now() } : { addedAt: Date.now() }) },
    { merge: true }
  );

export async function resetProgress(uid, deckId) {
  try {
    await updateDoc(refs.libEntry(uid, deckId), { progress: {} }); // updateDoc REPLACES the map
  } catch (err) {
    if (err?.code !== "not-found") throw err;
  }
}

export const removeFromLibrary = (uid, deckId) => deleteDoc(refs.libEntry(uid, deckId));

/* ---------- folders ---------- */

export const createFolder = (folder) =>
  setDoc(refs.folder(folder.id), {
    ownerId: folder.ownerId,
    ownerName: folder.ownerName || "",
    name: folder.name,
    color: folder.color,
    deckIds: folder.deckIds || [],
    tags: folder.tags || [],
    visibility: folder.visibility || "private",
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  });

export const updateFolder = (id, patch) => updateDoc(refs.folder(id), { ...patch, updatedAt: Date.now() });

export const deleteFolder = (id) => deleteDoc(refs.folder(id));

/* ---------- bulk (restore / migration) ---------- */

/**
 * Write many decks (+ their library entries) in batches of 120 decks (3 writes each, < 500 ops).
 * items: [{ deck, entry }]
 */
export async function writeDecksWithProgress(uid, items) {
  for (let i = 0; i < items.length; i += 120) {
    const batch = writeBatch(db);
    for (const { deck, entry } of items.slice(i, i + 120)) {
      batch.set(refs.deck(deck.id), deckPayload(deck));
      batch.set(refs.stub(deck.id), stubPayload(deck));
      if (entry) batch.set(refs.libEntry(uid, deck.id), entry, { merge: true });
    }
    await batch.commit();
  }
}

export async function getLegacyDecks(uid) {
  const snap = await getDocs(refs.legacyDecks(uid));
  return snap.docs.map((d) => ({ id: d.id, ref: d.ref, data: d.data() }));
}

export async function markLegacyMigrated(refsList) {
  for (let i = 0; i < refsList.length; i += 400) {
    const batch = writeBatch(db);
    refsList.slice(i, i + 400).forEach((r) => batch.update(r, { migratedAt: Date.now() }));
    await batch.commit();
  }
}

/** Owner only: does this deck already have a password set? */
export async function secretExists(deckId) {
  try {
    return (await getDoc(refs.secret(deckId))).exists();
  } catch {
    return false;
  }
}
