/**
 * Counts ACTIVE study time for the "minutes per day" goal: the screen must be visible and
 * the learner must have touched/typed in the last 90 seconds. Flushes every 30 s and on exit.
 */
import { useEffect, useRef } from "react";

const IDLE_AFTER_MS = 90_000;
const FLUSH_EVERY_S = 30;

export function useStudyTimer(onFlush, enabled = true) {
  const flushRef = useRef(onFlush);
  flushRef.current = onFlush;

  useEffect(() => {
    if (!enabled) return undefined;
    let seconds = 0;
    let lastInput = Date.now();
    const touch = () => (lastInput = Date.now());
    const flush = () => {
      if (seconds > 0) flushRef.current(seconds);
      seconds = 0;
    };
    const tick = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastInput < IDLE_AFTER_MS) seconds += 1;
      if (seconds >= FLUSH_EVERY_S) flush();
    }, 1000);
    const onHide = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", touch);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(tick);
      flush();
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [enabled]);
}
