/**
 * Round engine for a study session (see src/lib/rounds.js for the rules).
 *
 *   phase "playing"  → current round, one card at a time
 *   phase "summary"  → "Итоги раунда"; continueMistakes() or nextRound()
 *   phase "empty"    → nothing to study for this goal (e.g. nothing due today)
 *
 * Only the first answer of a card in a NORMAL round changes Leitner progress;
 * "retry" rounds (mistakes only) are reinforcement.
 */
import { useCallback, useRef, useState } from "react";
import { buildPool, summarizeRound, takeRound } from "../lib/rounds.js";
import { shuffle } from "../lib/utils.js";

export function useRounds({ items, goal, roundSize, onGrade, onRoundEnd }) {
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const used = useRef(new Set());
  const [state, setState] = useState(() => initial(items, goal, roundSize, used.current));
  const stateRef = useRef(state);
  stateRef.current = state;

  const update = (next) => {
    stateRef.current = next;
    setState(next);
  };

  const startNormalRound = useCallback(
    (roundNo) => {
      const pool = buildPool(itemsRef.current, { goal, exclude: used.current });
      if (!pool.length) return update({ ...stateRef.current, phase: "empty" });
      const roundItems = takeRound(pool, roundSize);
      roundItems.forEach((i) => used.current.add(i.key));
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
      const hasMore = buildPool(itemsRef.current, { goal, exclude: used.current }).length > 0;
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

  const restart = useCallback(() => {
    used.current = new Set();
    startNormalRound(1);
  }, [startNormalRound]);

  return { ...state, current: state.items?.[state.pos] || null, answer, continueMistakes, nextRound, restart };
}

function initial(items, goal, roundSize, used) {
  const pool = buildPool(items, { goal, exclude: used });
  if (!pool.length) return { phase: "empty", kind: "normal", roundNo: 1, items: [], pos: 0, results: [], summary: null, hasMore: false };
  const roundItems = takeRound(pool, roundSize);
  roundItems.forEach((i) => used.add(i.key));
  return { phase: "playing", kind: "normal", roundNo: 1, items: roundItems, pos: 0, results: [], summary: null, hasMore: false };
}
