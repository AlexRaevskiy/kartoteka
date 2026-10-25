/**
 * Resolve a deck or folder by id from a route — your own, one in your library, or one that
 * someone shared with you by link (subscribed directly from Firestore).
 *
 * Deck statuses: "loading" | "ready" | "locked" (needs password) | "private" | "missing" | "error"
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import * as store from "./store.js";
import { useLibrary } from "./LibraryProvider.jsx";
import { withProgress } from "../lib/model.js";

function enrich(deck, entry, uid) {
  return {
    ...deck,
    own: deck.ownerId === uid,
    cards: withProgress(deck.cards, entry?.progress),
    starred: new Set(entry?.starred || []),
    lastStudiedAt: entry?.lastStudiedAt || null,
    inLibrary: !!entry || deck.ownerId === uid,
  };
}

/** Subscribe to a deck that isn't in the user's library. */
function useRemoteDeck(id, enabled) {
  const [state, setState] = useState({ status: "loading", deck: null, stub: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || !id) return undefined;
    setState({ status: "loading", deck: null, stub: null });
    let cancelled = false;
    const off = store.subscribeDeck(
      id,
      (deck) => !cancelled && setState({ status: deck ? "ready" : "missing", deck, stub: null }),
      async (err) => {
        if (err?.code !== "permission-denied") return !cancelled && setState({ status: "error", deck: null, stub: null, error: err });
        // Not readable: find out whether it's password-protected, private or gone.
        const stub = await store.getStub(id).catch(() => null);
        if (cancelled) return;
        setState({ status: !stub ? "missing" : stub.visibility === "password" ? "locked" : "private", deck: null, stub });
      }
    );
    return () => {
      cancelled = true;
      off();
    };
  }, [id, enabled, attempt]);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...state, retry };
}

export function useDeckResource(id) {
  const lib = useLibrary();
  const known = lib.decksById[id];
  const remote = useRemoteDeck(id, !known && lib.status === "ready");
  const entry = lib.library[id];
  const deck = useMemo(() => (known ? known : remote.deck ? enrich(remote.deck, entry, lib.uid) : null), [known, remote.deck, entry, lib.uid]);
  if (known) return { status: "ready", deck, stub: null, retry: remote.retry };
  if (lib.status !== "ready") return { status: "loading", deck: null, stub: null, retry: remote.retry };
  return { ...remote, deck };
}

export function useFolderResource(id) {
  const lib = useLibrary();
  const known = lib.foldersById[id];
  const [state, setState] = useState({ status: "loading", folder: null });
  useEffect(() => {
    if (known || !id || lib.status !== "ready") return undefined;
    setState({ status: "loading", folder: null });
    return store.subscribeFolder(
      id,
      (folder) => setState({ status: folder ? "ready" : "missing", folder }),
      (err) => setState({ status: err?.code === "permission-denied" ? "private" : "error", folder: null })
    );
  }, [id, !!known, lib.status]); // eslint-disable-line react-hooks/exhaustive-deps
  if (known) return { status: "ready", folder: known };
  if (lib.status !== "ready") return { status: "loading", folder: null };
  return state;
}

/**
 * Many decks at once (the decks of a folder). Known decks come from the library; the rest are
 * subscribed individually. Returns { decks: enriched[], unavailable: id[], loading }.
 */
export function useDeckSet(ids) {
  const lib = useLibrary();
  const unknownKey = ids.filter((id) => !lib.decksById[id]).sort().join(",");
  const [remote, setRemote] = useState({}); // id → deck | null

  useEffect(() => {
    if (!unknownKey || lib.status !== "ready") return undefined;
    const offs = unknownKey.split(",").map((id) =>
      store.subscribeDeck(
        id,
        (deck) => setRemote((r) => ({ ...r, [id]: deck })),
        () => setRemote((r) => ({ ...r, [id]: null }))
      )
    );
    return () => offs.forEach((off) => off());
  }, [unknownKey, lib.status]);

  return useMemo(() => {
    const decks = [];
    const unavailable = [];
    let loading = false;
    for (const id of ids) {
      const known = lib.decksById[id];
      if (known) decks.push(known);
      else if (remote[id]) decks.push(enrich(remote[id], lib.library[id], lib.uid));
      else if (remote[id] === null) unavailable.push(id);
      else loading = true;
    }
    return { decks, unavailable, loading };
  }, [ids, lib.decksById, lib.library, lib.uid, remote]);
}
