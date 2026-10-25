/**
 * Round engine for a study session (see src/lib/rounds.js for the rules).
 *
 *   phase "playing"  → current round, one card at a time
 *   phase "summary"  → round summary; continueMistakes() or nextRound()
 *   phase "empty"    → nothing (more) to study for this goal; `newRemaining` > 0 means the
 *                      session's portion of new cards is done — nextPortion() starts another
 *
 * A session takes at most MAX_NEW_PER_SESSION new cards (plus cards still being learned).
 * Only the first answer of a card in a NORMAL round changes Leitner progress;
 * "retry" rounds (mistakes only) are reinforcement.
 */
import { useCallback, useRef, useState } from "react";
import { MAX_NEW_PER_SESSION, buildPool, isNewCard, summarizeRound, takeRound } from "../lib/rounds.js";
import { shuffle } from "../lib/utils.js";

const EMPTY = { phase: "empty", kind: "normal", roundNo: 1, items: [], pos: 0, results: [], summary: null, hasMore: false, newRemaining: 0 };

/** Picks the next normal round, updating the session's used keys and new-card count. */
function pickRound(items, goal, roundSize, session) {
  const pool = buildPool(items, { goal, exclude: session.used, newLimit: MAX_NEW_PER_SESSION - session.newTaken });
  if (!pool.length) return null;
  const roundItems = takeRound(pool, roundSize);
  for (const i of roundItems) {
    session.used.add(i.key);
    if (isNewCard(i)) session.newTaken += 1;
  }
  return roundItems;
}

/** New cards this session hasn't reached yet (they wait for the next portion). */
const newLeft = (items, session) => items.filter((i) => isNewCard(i) && !session.used.has(i.key)).length;

export function useRounds({ items, goal, roundSize, onGrade, onRoundEnd }) {
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const session = useRef(null);
  session.current ??= { used: new Set(), newTaken: 0 };
  const [state, setState] = useState(() => {
    const roundItems = pickRound(items, goal, roundSize, session.current);
    return roundItems
      ? { phase: "playing", kind: "normal", roundNo: 1, items: roundItems, pos: 0, results: [], summary: null, hasMore: false }
      : { ...EMPTY, newRemaining: newLeft(items, session.current) };
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const update = (next) => {
    stateRef.current = next;
    setState(next);
  };

  const startNormalRound = useCallback(
    (roundNo) => {
      const roundItems = pickRound(itemsRef.current, goal, roundSize, session.current);
      if (!roundItems) return update({ ...stateRef.current, phase: "empty", newRemaining: newLeft(itemsRef.current, session.current) });
      update({ phase: "playing", kind: "normal", roundNo, items: roundItems, pos: 0, results: [], summary: null, hasMore: false });
    },
    [goal, roundSize]
  );

  /** grade: "know" | "almost" | "again" */
  const answer = useCallback(
    (grade) => {
      const s = stateRef.current;
      if (s.phase !== "playing") return;
      const item = s.items[s.pos];
      if (!item) return;
      if (s.kind === "normal") onGrade(item, grade);
      const results = [...s.results, { item, grade }];
      const pos = s.pos + 1;
      if (pos < s.items.length) return update({ ...s, pos, results });
      const summary = summarizeRound(results);
      // More to do: another round in this portion, or the next portion of new cards
      // ("Continue" then lands on the "portion done" screen with its "Next N words" button).
      const hasMore =
        buildPool(itemsRef.current, { goal, exclude: session.current.used, newLimit: MAX_NEW_PER_SESSION - session.current.newTaken }).length > 0 ||
        newLeft(itemsRef.current, session.current) > 0;
      update({ ...s, pos, results, phase: "summary", summary, hasMore });
      onRoundEnd?.(summary, s.kind);
    },
    [goal, onGrade, onRoundEnd]
  );

  const continueMistakes = useCallback(() => {
    const s = stateRef.current;
    if (!s.summary?.mistakes.length) return startNormalRound(s.roundNo + 1);
    update({ phase: "playing", kind: "retry", roundNo: s.roundNo + 1, items: shuffle(s.summary.mistakes), pos: 0, results: [], summary: null, hasMore: false });
  }, [startNormalRound]);

  const nextRound = useCallback(() => startNormalRound(stateRef.current.roundNo + 1), [startNormalRound]);

  /** The portion of new cards is done but more are waiting: start the next portion now. */
  const nextPortion = useCallback(() => {
    session.current.newTaken = 0;
    startNormalRound(stateRef.current.roundNo + 1);
  }, [startNormalRound]);

  const restart = useCallback(() => {
    session.current = { used: new Set(), newTaken: 0 };
    startNormalRound(1);
  }, [startNormalRound]);

  return { ...state, current: state.items?.[state.pos] || null, answer, continueMistakes, nextRound, nextPortion, restart };
}
