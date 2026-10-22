/**
 * useLibrary — the user's decks, settings and review log, live-synced with Firestore.
 *
 * Reads: two real-time listeners (decks collection + user document). Any change on another
 * device appears here within a second; with the persistent cache, reload is instant and offline-safe.
 *
 * Writes: every action updates local state immediately (optimistic UI), then writes to Firestore.
 * Firestore queues writes while offline and sends them when the connection returns.
 *
 * Conflict policy: last write wins per deck document. Two devices rating cards in the SAME deck
 * at the SAME moment could overwrite each other's latest rating; in practice one person studies
 * on one device at a time, and the next snapshot reconciles both devices.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as store from "./store.js";
import { DEFAULT_SETTINGS, MAX_CARDS_PER_DECK, newCard, uid as makeId } from "../lib/model.js";
import { dateKey, gradeCard } from "../lib/leitner.js";

function friendlyFirestoreError(err) {
  const code = err?.code || "";
  if (code.includes("permission-denied"))
    return "The database refused access. Publish the rules from firestore.rules in Firebase Console → Firestore → Rules.";
  if (code.includes("unavailable")) return "Can't reach the database. Changes are kept on this device and will sync when you're back online.";
  if (code.includes("resource-exhausted")) return "The free database quota for today is used up. Try again tomorrow.";
  return err?.message || "Something went wrong while saving.";
}

export function useLibrary(user, { onError } = {}) {
  const uid = user?.uid || null;

  const [decks, setDecks] = useState([]);
  const [userDoc, setUserDoc] = useState(null);
  const [loaded, setLoaded] = useState({ decks: false, user: false });
  const [pending, setPending] = useState({ decks: false, user: false });
  const [fromCache, setFromCache] = useState(false);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [error, setError] = useState(null);

  // Always-current copy for optimistic updates (avoids stale state on rapid ratings).
  const decksRef = useRef([]);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const report = useCallback((err) => {
    const message = friendlyFirestoreError(err);
    console.error("[library]", err);
    onErrorRef.current?.(message);
  }, []);

  /* ---------- subscriptions ---------- */
  useEffect(() => {
    setDecks([]);
    decksRef.current = [];
    setUserDoc(null);
    setLoaded({ decks: false, user: false });
    setError(null);
    if (!uid) return undefined;

    const fail = (err) => {
      setError(friendlyFirestoreError(err));
      console.error("[library] listener failed", err);
    };

    const offDecks = store.subscribeDecks(
      uid,
      (list, meta) => {
        decksRef.current = list;
        setDecks(list);
        setLoaded((l) => (l.decks ? l : { ...l, decks: true }));
        setPending((p) => ({ ...p, decks: meta.pending }));
        setFromCache(meta.fromCache);
      },
      fail
    );
    const offUser = store.subscribeUser(
      uid,
      (data, meta) => {
        setUserDoc(data);
        setLoaded((l) => (l.user ? l : { ...l, user: true }));
        setPending((p) => ({ ...p, user: meta.pending }));
      },
      fail
    );
    return () => {
      offDecks();
      offUser();
    };
  }, [uid]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  /* ---------- derived ---------- */
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...(userDoc?.settings || {}) }), [userDoc]);
  const log = useMemo(() => userDoc?.log || {}, [userDoc]);

  const status = !uid ? "idle" : error ? "error" : loaded.decks && loaded.user ? "ready" : "loading";
  const sync = !online ? "offline" : pending.decks || pending.user ? "saving" : fromCache ? "connecting" : "saved";

  /* ---------- local helpers ---------- */
  const setLocalDecks = (next) => {
    decksRef.current = next;
    setDecks(next);
  };

  /** Update one deck: fn(deck) → deck. Writes name/description/cards. */
  const mutateDeck = useCallback(
    (deckId, fn) => {
      const current = decksRef.current.find((d) => d.id === deckId);
      if (!current || !uid) return Promise.resolve();
      const next = { ...fn(current), updatedAt: Date.now() };
      setLocalDecks(decksRef.current.map((d) => (d.id === deckId ? next : d)));
      return store
        .patchDeck(uid, deckId, {
          name: next.name,
          description: next.description || "",
          cards: next.cards,
          updatedAt: next.updatedAt,
        })
        .catch(report);
    },
    [uid, report]
  );

  /* ---------- actions ---------- */
  const actions = useMemo(
    () => ({
      createDeck({ name, description = "", cards = [] }) {
        const now = Date.now();
        const deck = {
          id: store.newDeckId(uid),
          name: name.trim() || "Untitled deck",
          description: description.trim(),
          createdAt: now,
          updatedAt: now,
          cards: cards.slice(0, MAX_CARDS_PER_DECK).map(newCard),
        };
        setLocalDecks([...decksRef.current, deck]);
        store.writeDeck(uid, deck).catch(report);
        return deck.id;
      },

      renameDeck(deckId, { name, description }) {
        return mutateDeck(deckId, (d) => ({ ...d, name: name.trim() || d.name, description: (description ?? d.description).trim() }));
      },

      deleteDeck(deckId) {
        setLocalDecks(decksRef.current.filter((d) => d.id !== deckId));
        return store.removeDeck(uid, deckId).catch(report);
      },

      /** Append cards; returns how many were added (respecting the per-deck limit). */
      addCards(deckId, cards) {
        const deck = decksRef.current.find((d) => d.id === deckId);
        if (!deck) return 0;
        const room = Math.max(0, MAX_CARDS_PER_DECK - deck.cards.length);
        const toAdd = cards.slice(0, room).map(newCard);
        if (toAdd.length) mutateDeck(deckId, (d) => ({ ...d, cards: [...toAdd, ...d.cards] }));
        return toAdd.length;
      },

      updateCard(deckId, cardId, patch) {
        return mutateDeck(deckId, (d) => ({ ...d, cards: d.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)) }));
      },

      deleteCard(deckId, cardId) {
        return mutateDeck(deckId, (d) => ({ ...d, cards: d.cards.filter((c) => c.id !== cardId) }));
      },

      resetCard(deckId, cardId) {
        return mutateDeck(deckId, (d) => ({
          ...d,
          cards: d.cards.map((c) => (c.id === cardId ? { ...c, box: 1, lastReviewed: null } : c)),
        }));
      },

      resetDeck(deckId) {
        return mutateDeck(deckId, (d) => ({
          ...d,
          cards: d.cards.map((c) => ({ ...c, box: 1, lastReviewed: null, reviews: 0, lapses: 0 })),
        }));
      },

      /** Apply a Leitner grade ("know" | "almost" | "again"). Returns the updated card. */
      gradeCard(deckId, cardId, grade) {
        const deck = decksRef.current.find((d) => d.id === deckId);
        const card = deck?.cards.find((c) => c.id === cardId);
        if (!card) return null;
        const updated = gradeCard(card, grade);
        mutateDeck(deckId, (d) => ({ ...d, cards: d.cards.map((c) => (c.id === cardId ? updated : c)) }));
        return { before: card, after: updated };
      },

      logReview() {
        const key = dateKey();
        setUserDoc((u) => ({ ...(u || {}), log: { ...(u?.log || {}), [key]: ((u?.log || {})[key] || 0) + 1 } }));
        store.incrementLog(uid, key).catch(report);
      },

      updateSettings(patch) {
        setUserDoc((u) => ({ ...(u || {}), settings: { ...(u?.settings || {}), ...patch } }));
        store.patchUser(uid, { settings: patch }).catch(report);
      },

      /** Add decks from a backup. Each gets a new id; nothing is overwritten. */
      importDecks(importedDecks, importedLog = {}) {
        return copyDecksToUser(uid, importedDecks, importedLog, log);
      },
    }),
    [uid, mutateDeck, report, log]
  );

  return { status, error, decks, settings, log, sync, actions };
}

/**
 * Write decks (+ optional review log) into any user's library with fresh deck ids.
 * Used for backup restore and for moving a guest's decks into an existing Google account.
 * `existingLog`: the target's current log; per day the higher count is kept. Pass null to add counts instead.
 */
export async function copyDecksToUser(targetUid, decks, logToAdd = {}, existingLog = null) {
  const now = Date.now();
  const prepared = decks.map((d) => ({
    ...d,
    id: store.newDeckId(targetUid),
    createdAt: d.createdAt || now,
    updatedAt: now,
    cards: d.cards.map((c) => ({ ...c, id: c.id || makeId() })),
  }));
  await store.writeDecksBatch(targetUid, prepared);

  const entries = Object.entries(logToAdd || {}).map(([day, n]) => [day, Number(n) || 0]).filter(([, n]) => n > 0);
  if (entries.length) {
    if (existingLog) {
      const higher = Object.fromEntries(entries.filter(([day, n]) => n > (existingLog[day] || 0)));
      if (Object.keys(higher).length) await store.patchUser(targetUid, { log: higher });
    } else {
      await Promise.all(entries.map(([day, n]) => store.incrementLog(targetUid, day, n)));
    }
  }
  return prepared.length;
}
