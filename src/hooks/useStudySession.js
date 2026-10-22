/**
 * Study session engine (shared by Flashcards, Quiz and Write).
 *
 * - Builds a shuffled queue: today's due cards ("due" scope) or every card ("all" = practice).
 * - The FIRST answer for each card is the one that counts for Leitner (tracked sessions only).
 * - Cards graded "again" are re-queued, so you see them once more before the session ends.
 * - The session is a snapshot: cards added mid-session wait for the next one; deleted cards are skipped.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { isDue } from "../lib/leitner.js";
import { shuffle } from "../lib/utils.js";

function buildSession(deck, scope) {
  const now = Date.now();
  const pool = deck.cards.filter((c) => scope === "all" || isDue(c, now));
  const queue = shuffle(pool.map((c) => c.id));
  return { queue, pos: 0, seen: {}, know: 0, almost: 0, again: 0, total: queue.length, tracked: scope === "due" };
}

/**
 * @param deck       current deck (live)
 * @param scope      "due" | "all"
 * @param resetKey   change to start a fresh session
 * @param handlers   { onGrade(cardId, grade), onLog(), onComplete(session) }
 */
export function useStudySession(deck, scope, resetKey, { onGrade, onLog, onComplete }) {
  const key = `${deck.id}|${scope}|${resetKey}`;
  const [session, setSession] = useState(() => buildSession(deck, scope));
  const sessionRef = useRef(session);
  const deckRef = useRef(deck);
  const keyRef = useRef(key);
  deckRef.current = deck;
  sessionRef.current = session;

  // Rebuild when the deck, scope or reset key changes.
  useEffect(() => {
    if (keyRef.current === key) return;
    keyRef.current = key;
    const fresh = buildSession(deckRef.current, scope);
    sessionRef.current = fresh;
    setSession(fresh);
  }, [key, scope]);

  const cardId = session.queue[session.pos];
  const card = cardId ? deck.cards.find((c) => c.id === cardId) || null : null;

  // Skip cards that were deleted mid-session (e.g. on another device).
  useEffect(() => {
    if (cardId && !card) {
      setSession((s) => {
        const next = { ...s, pos: s.pos + 1 };
        sessionRef.current = next;
        return next;
      });
    }
  }, [cardId, card]);

  /** grade: "know" | "almost" | "again" */
  const answer = useCallback(
    (grade) => {
      const s = sessionRef.current;
      const id = s.queue[s.pos];
      if (!id) return;
      const first = !s.seen[id];
      if (first) {
        if (s.tracked) onGrade(id, grade);
        onLog();
      }
      const next = {
        ...s,
        queue: grade === "again" ? [...s.queue, id] : s.queue,
        pos: s.pos + 1,
        seen: { ...s.seen, [id]: true },
        know: s.know + (first && grade === "know" ? 1 : 0),
        almost: s.almost + (first && grade === "almost" ? 1 : 0),
        again: s.again + (first && grade === "again" ? 1 : 0),
      };
      sessionRef.current = next; // guards against double-taps before React re-renders
      setSession(next);
      if (next.pos >= next.queue.length) onComplete(next);
    },
    [onGrade, onLog, onComplete]
  );

  const done = session.total > 0 && session.pos >= session.queue.length;
  const seenCount = Object.keys(session.seen).length;
  const retries = Math.max(0, session.queue.length - session.pos - (session.total - seenCount));

  return { session, card, answer, done, seenCount, retries };
}
