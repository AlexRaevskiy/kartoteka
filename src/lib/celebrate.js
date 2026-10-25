/**
 * Confetti micro-celebrations (canvas-confetti, lazy-loaded so it never slows first paint).
 *   "card"    → small burst when a single card reaches Box 5
 *   "due"     → all of today's due cards reviewed
 *   "mastery" → every card in the deck is in Box 5
 * Respects prefers-reduced-motion.
 */
let confettiPromise = null;
// CJS interop differs between dev and production bundles: accept whichever shape is a function.
const loadConfetti = () =>
  (confettiPromise ??= import("canvas-confetti")
    .then((m) => [m.default, m.default?.default, m].find((f) => typeof f === "function") || null)
    .catch(() => null));

function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  return ["--accent", "--good", "--box-3", "--warn", "--box-1"].map((v) => cs.getPropertyValue(v).trim()).filter(Boolean);
}

export async function celebrate(kind = "due") {
  try {
    await burst(kind);
  } catch (err) {
    console.warn("[Kartoteka] confetti failed", err); // decoration only — never break the app
  }
}

async function burst(kind) {
  const confetti = await loadConfetti();
  if (!confetti) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const colors = themeColors();

  if (kind === "card") {
    confetti({ particleCount: reduce ? 18 : 50, spread: 62, startVelocity: 30, origin: { y: 0.62 }, scalar: 0.8, colors });
    return;
  }

  if (kind === "mastery") {
    const end = Date.now() + (reduce ? 300 : 1700);
    (function frame() {
      confetti({ particleCount: 5, angle: 60, spread: 65, origin: { x: 0, y: 0.75 }, colors });
      confetti({ particleCount: 5, angle: 120, spread: 65, origin: { x: 1, y: 0.75 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
    setTimeout(() => confetti({ particleCount: reduce ? 60 : 180, spread: 120, origin: { y: 0.55 }, colors }), 250);
    return;
  }

  confetti({ particleCount: reduce ? 40 : 120, spread: 80, origin: { y: 0.65 }, colors });
  setTimeout(() => confetti({ particleCount: reduce ? 20 : 70, spread: 125, startVelocity: 36, origin: { y: 0.6 }, scalar: 0.9, colors }), 220);
}
