/**
 * LibraryProvider — everything the signed-in user owns or studies, live from Firestore.
 *
 *   profile   users/{uid}                    settings, streak, daily progress
 *   decks     decks where ownerId == uid     + decks from other people you studied/saved
 *   library   users/{uid}/library/*          your Leitner progress + starred cards per deck
 *   folders   folders where ownerId == uid
 *
 * All listeners use Firestore's offline cache: the app opens instantly, works offline and
 * syncs queued writes later. Firestore applies local writes to listeners immediately
 * ("latency compensation"), so the UI updates without waiting for the server.
 *
 * Use it with `const lib = useLibrary()`.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as store from "./store.js";
import { migrateLegacyDecks, profileBackfill } from "./migrate.js";
import { DEFAULT_SETTINGS, FOLDER_COLORS, MAX_CARDS_PER_DECK, newCard, normalizeProgress, uid as makeId, withProgress } from "../lib/model.js";
import { dateKey, nextProgress } from "../lib/leitner.js";
import { applyActivity, localDateKey } from "../lib/goals.js";
import i18n from "../i18n/index.js";

const LibraryContext = createContext(null);
export const useLibrary = () => useContext(LibraryContext);

function friendlyError(err) {
  const code = err?.code || "";
  if (code.includes("permission-denied")) return i18n.t("library.errors.permissionDenied");
  if (code.includes("unavailable")) return i18n.t("library.errors.unavailable");
  if (code.includes("resource-exhausted")) return i18n.t("library.errors.quota");
  if (code.includes("failed-precondition")) return i18n.t("library.errors.index");
  return err?.message || i18n.t("library.errors.saveFailed");
}

/** Enrich a deck with this user's progress and stars. */
function enrichDeck(deck, entry, uid) {
  return {
    ...deck,
    own: deck.ownerId === uid,
    cards: withProgress(deck.cards, entry?.progress),
    starred: new Set(entry?.starred || []),
    lastStudiedAt: entry?.lastStudiedAt || null,
    inLibrary: !!entry || deck.ownerId === uid,
  };
}

export function LibraryProvider({ user, onError, children }) {
  const uid = user.uid;
  const ownerName = user.displayName || (user.isAnonymous ? i18n.t("profile.guest") : user.email?.split("@")[0]) || i18n.t("library.user");

  const [profile, setProfile] = useState(null);
  const [ownDecks, setOwnDecks] = useState(null); // Map id → deck
  const [library, setLibrary] = useState(null); // { deckId: entry }
  const [folders, setFolders] = useState(null);
  const [foreign, setForeign] = useState({}); // id → deck | null (unavailable)
  const [pending, setPending] = useState({});
  const [fromCache, setFromCache] = useState(false);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [error, setError] = useState(null);

  const profileRef = useRef(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const report = useCallback((err) => {
    console.error("[library]", err);
    onErrorRef.current?.(friendlyError(err));
  }, []);

  /* ---------- subscriptions ---------- */
  useEffect(() => {
    const fail = (err) => {
      console.error("[library] listener", err);
      setError(friendlyError(err));
    };
    const offs = [
      store.subscribeUser(
        uid,
        (data, m) => {
          profileRef.current = data;
          setProfile(data);
          setPending((p) => ({ ...p, user: m.pending }));
        },
        fail
      ),
      store.subscribeOwnDecks(
        uid,
        (list, m) => {
          setOwnDecks(new Map(list.map((d) => [d.id, d])));
          setPending((p) => ({ ...p, decks: m.pending }));
          setFromCache(m.fromCache);
        },
        fail
      ),
      store.subscribeLibrary(
        uid,
        (entries, m) => {
          setLibrary(Object.fromEntries(entries.map((e) => [e.deckId, e])));
          setPending((p) => ({ ...p, library: m.pending }));
        },
        fail
      ),
      store.subscribeOwnFolders(
        uid,
        (list, m) => {
          setFolders(list.sort((a, b) => a.createdAt - b.createdAt));
          setPending((p) => ({ ...p, folders: m.pending }));
        },
        fail
      ),
    ];
    return () => offs.forEach((off) => off());
  }, [uid]);

  // Decks owned by other people that are in your library → subscribe to each one.
  const foreignSubs = useRef(new Map());
  useEffect(() => {
    if (!library || !ownDecks) return;
    const wanted = new Set(Object.keys(library).filter((id) => !ownDecks.has(id) && library[id].ownerId !== uid));
    for (const [id, off] of foreignSubs.current) {
      if (!wanted.has(id)) {
        off();
        foreignSubs.current.delete(id);
        setForeign((f) => {
          const { [id]: _, ...rest } = f;
          return rest;
        });
      }
    }
    for (const id of wanted) {
      if (foreignSubs.current.has(id)) continue;
      const off = store.subscribeDeck(
        id,
        (deck) => setForeign((f) => ({ ...f, [id]: deck })),
        () => setForeign((f) => ({ ...f, [id]: null })) // deleted or made private
      );
      foreignSubs.current.set(id, off);
    }
  }, [library, ownDecks, uid]);
  useEffect(() => () => foreignSubs.current.forEach((off) => off()), []);

  // Keep the author name/photo current + one-time migration from v2.
  const migrated = useRef(false);
  useEffect(() => {
    if (!profile || !ownDecks || migrated.current) return;
    migrated.current = true;
    const patch = profileBackfill(profile) || {};
    if (profile.displayName !== ownerName) patch.displayName = ownerName;
    if (Object.keys(patch).length) store.patchUser(uid, patch).catch(report);
    migrateLegacyDecks(uid, ownerName)
      .then((n) => n && onErrorRef.current?.(i18n.t("library.migrated", { count: n }), { info: true }))
      .catch(report);
  }, [profile, ownDecks, uid, ownerName, report]);

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
  const settings = useMemo(() => {
    const s = profile?.settings || {};
    return { ...DEFAULT_SETTINGS, ...s, notify: { ...DEFAULT_SETTINGS.notify, ...(s.notify || {}) }, dailyGoal: { ...DEFAULT_SETTINGS.dailyGoal, ...(s.dailyGoal || {}) } };
  }, [profile]);

  const decks = useMemo(() => {
    if (!ownDecks || !library) return [];
    const list = [...ownDecks.values()].map((d) => enrichDeck(d, library[d.id], uid));
    for (const [id, deck] of Object.entries(foreign)) if (deck) list.push(enrichDeck(deck, library[id], uid));
    return list.sort((a, b) => (b.lastStudiedAt || b.updatedAt) - (a.lastStudiedAt || a.updatedAt));
  }, [ownDecks, library, foreign, uid]);

  const decksById = useMemo(() => Object.fromEntries(decks.map((d) => [d.id, d])), [decks]);
  const foldersById = useMemo(() => Object.fromEntries((folders || []).map((f) => [f.id, f])), [folders]);

  const status = error ? "error" : profile && ownDecks && library && folders ? "ready" : "loading";
  const anyPending = Object.values(pending).some(Boolean);
  const sync = !online ? "offline" : anyPending ? "saving" : fromCache ? "connecting" : "saved";

  // Latest values for actions without re-creating them on every snapshot.
  const latest = useRef({});
  latest.current = { decksById, library, folders: folders || [], settings };

  /* ---------- actions ---------- */
  const actions = useMemo(() => {
    const L = () => latest.current;
    const foldersWith = (deckId) => L().folders.filter((f) => f.deckIds.includes(deckId));

    const removeDeckFromFolders = (deckId) =>
      Promise.all(
        foldersWith(deckId).map((f) =>
          store.updateFolder(f.id, {
            deckIds: f.deckIds.filter((id) => id !== deckId),
            tags: f.tags.map((t) => ({ ...t, deckIds: t.deckIds.filter((id) => id !== deckId) })),
          })
        )
      );

    return {
      /* ----- decks ----- */

      /**
       * Create (deck.id empty) or update a deck.
       * passwordHash: required when visibility or editPolicy is "password" and the password changed.
       * Returns the deck id.
       */
      async saveDeck(draft, { passwordHash, asEditor = false } = {}) {
        const now = Date.now();
        const id = draft.id || store.newId("decks");
        const deck = {
          ...draft,
          id,
          ownerId: asEditor ? draft.ownerId : uid,
          ownerName: asEditor ? draft.ownerName : ownerName,
          ownerPhotoURL: asEditor ? draft.ownerPhotoURL || "" : user.photoURL || "",
          createdAt: draft.createdAt || now,
          updatedAt: now,
          cards: draft.cards.filter((c) => c.term.trim() || c.definition.trim()).slice(0, MAX_CARDS_PER_DECK),
        };
        if (asEditor) await store.saveDeckAsEditor(deck);
        else await store.saveOwnDeck(deck, { passwordHash });
        return id;
      },

      /** Delete your deck, or remove someone else's deck from your library. */
      async deleteDeck(deck) {
        await removeDeckFromFolders(deck.id).catch(report);
        await store.removeFromLibrary(uid, deck.id).catch(() => {});
        if (deck.ownerId === uid) await store.deleteOwnDeck(deck.id);
      },

      /** Make a copy in your account: same cards, fresh progress, private. */
      async copyDeck(deck) {
        const id = store.newId("decks");
        const now = Date.now();
        await store.saveOwnDeck({
          id,
          ownerId: uid,
          ownerName,
          title: deck.own ? i18n.t("library.copyTitle", { title: deck.title }) : deck.title,
          description: deck.description,
          termLang: deck.termLang,
          defLang: deck.defLang,
          visibility: "private",
          editPolicy: "owner",
          cards: deck.cards.map((c) => newCard(c)),
          createdAt: now,
          updatedAt: now,
          copiedFrom: deck.id,
        });
        return id;
      },

      /**
       * Apply a Leitner grade for one card.
       * Returns { before, after } (after = null when nothing changed, e.g. cram on a non-due card).
       */
      grade(deck, cardId, grade, { goal = "memorize" } = {}) {
        const entry = L().library[deck.id];
        const content = deck.cards.find((c) => c.id === cardId);
        if (!content) return null;
        const card = { ...content, ...normalizeProgress(entry?.progress?.[cardId]) };
        const after = nextProgress(card, grade, { goal });
        if (after) store.setCardProgress(uid, deck, cardId, after).catch(report);
        else store.touchLibrary(uid, deck, { studied: true }).catch(report);
        return { before: card, after };
      },

      toggleStar(deck, cardId) {
        const on = !deck.starred?.has(cardId);
        store.setStar(uid, deck, cardId, on).catch(report);
        return on;
      },

      resetProgress(deckId) {
        return store.resetProgress(uid, deckId).catch(report);
      },

      addToLibrary(deck) {
        return store.touchLibrary(uid, deck).catch(report);
      },

      /* ----- folders ----- */

      async createFolder({ name, deckIds = [] }) {
        const id = store.newId("folders");
        const now = Date.now();
        await store.createFolder({
          id,
          ownerId: uid,
          ownerName,
          name: name.trim().slice(0, 80) || i18n.t("home.folder"),
          color: FOLDER_COLORS[L().folders.length % FOLDER_COLORS.length],
          deckIds,
          tags: [],
          visibility: "private",
          createdAt: now,
          updatedAt: now,
        });
        return id;
      },

      updateFolder(id, patch) {
        return store.updateFolder(id, patch).catch(report);
      },

      deleteFolder(id) {
        return store.deleteFolder(id).catch(report);
      },

      /** Put a deck into a folder (tag it) or take it out. */
      setFolderMembership(folder, deckId, on) {
        const deckIds = on ? [...new Set([...folder.deckIds, deckId])] : folder.deckIds.filter((id) => id !== deckId);
        const tags = on ? folder.tags : folder.tags.map((t) => ({ ...t, deckIds: t.deckIds.filter((id) => id !== deckId) }));
        // Saving a deck into a folder also saves it into your library (for decks shared with you).
        const deck = L().decksById[deckId];
        if (on && deck && !deck.inLibrary) store.touchLibrary(uid, deck).catch(report);
        return store.updateFolder(folder.id, { deckIds, tags }).catch(report);
      },

      createTag(folder, name) {
        const tag = { id: makeId().slice(0, 10), name: name.trim().slice(0, 40), deckIds: [] };
        store.updateFolder(folder.id, { tags: [...folder.tags, tag] }).catch(report);
        return tag.id;
      },

      renameTag(folder, tagId, name) {
        return store.updateFolder(folder.id, { tags: folder.tags.map((t) => (t.id === tagId ? { ...t, name: name.trim().slice(0, 40) } : t)) }).catch(report);
      },

      deleteTag(folder, tagId) {
        return store.updateFolder(folder.id, { tags: folder.tags.filter((t) => t.id !== tagId) }).catch(report);
      },

      setTagMembership(folder, tagId, deckId, on) {
        const tags = folder.tags.map((t) =>
          t.id !== tagId ? t : { ...t, deckIds: on ? [...new Set([...t.deckIds, deckId])] : t.deckIds.filter((id) => id !== deckId) }
        );
        return store.updateFolder(folder.id, { tags }).catch(report);
      },

      /* ----- profile ----- */

      updateSettings(patch) {
        return store.patchUser(uid, { settings: patch }).catch(report);
      },

      /**
       * Add study activity (seconds / finished rounds / cards) to today's goal and the streak.
       * Returns { justMetGoal }.
       */
      recordActivity(delta) {
        const p = profileRef.current || {};
        const { justMetGoal, ...patch } = applyActivity(p, delta, L().settings.dailyGoal, localDateKey());
        profileRef.current = { ...p, ...patch }; // so rapid calls build on each other
        store.patchUser(uid, patch).catch(report);
        return { justMetGoal: !!justMetGoal };
      },

      logReview() {
        const key = dateKey();
        const p = profileRef.current || {};
        const log = { ...(p.log || {}), [key]: ((p.log || {})[key] || 0) + 1 };
        profileRef.current = { ...p, log };
        store.patchUser(uid, { log: { [key]: log[key] } }).catch(report);
      },

      setLastStudy(info) {
        return store.patchUser(uid, { settings: { lastStudy: { ...info, at: Date.now() } } }).catch(report);
      },

      addPushToken(token) {
        return store.addPushToken(uid, token);
      },

      /* ----- backup restore ----- */

      /** Add decks (with progress) and folders from a parsed backup. Nothing is overwritten. */
      restore(parsed) {
        return restoreInto(uid, ownerName, parsed);
      },
    };
  }, [uid, ownerName, report]);

  const value = useMemo(
    () => ({
      uid,
      user,
      ownerName,
      status,
      error,
      sync,
      profile: profile || {},
      settings,
      decks,
      decksById,
      library: library || {},
      folders: folders || [],
      foldersById,
      actions,
      report,
    }),
    [uid, user, ownerName, status, error, sync, profile, settings, decks, decksById, library, folders, foldersById, actions, report]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

/**
 * Write parsed backup data ({ decks, folders } from lib/backup.readBackup) into a user's account.
 * Used by "Restore from backup" and when a guest's decks move into an existing Google account.
 */
export async function restoreInto(uid, ownerName, { decks, folders = [] }) {
  const now = Date.now();
  const idMap = {};
  const items = decks.map((d) => {
    const id = store.newId("decks");
    idMap[d.oldId] = id;
    return {
      deck: { id, ownerId: uid, ownerName, title: d.title, description: d.description, termLang: d.termLang, defLang: d.defLang, visibility: "private", editPolicy: "owner", cards: d.cards, createdAt: now, updatedAt: now },
      entry: { ownerId: uid, title: d.title, addedAt: now, progress: d.progress || {}, starred: (d.starred || []).filter((s) => d.cards.some((c) => c.id === s)) },
    };
  });
  await store.writeDecksWithProgress(uid, items);
  for (const f of folders) {
    const deckIds = (f.deckIds || []).map((id) => idMap[id]).filter(Boolean);
    if (!deckIds.length) continue;
    await store.createFolder({
      id: store.newId("folders"),
      ownerId: uid,
      ownerName,
      name: f.name,
      color: f.color || FOLDER_COLORS[0],
      deckIds,
      tags: (f.tags || []).map((t) => ({ id: makeId().slice(0, 10), name: t.name, deckIds: (t.deckIds || []).map((id) => idMap[id]).filter(Boolean) })),
      visibility: "private",
      createdAt: now,
      updatedAt: now,
    });
  }
  return items.length;
}
