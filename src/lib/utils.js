/** Small shared helpers. */

export const cx = (...classes) => classes.filter(Boolean).join(" ");

export function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** True when the keyboard event comes from a text field (so shortcuts don't fire while typing). */
export function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

/** Running as an installed app (home screen icon), not inside a browser tab. */
export const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Split an example sentence around occurrences of `term` so the UI can highlight or blank it out.
 * Returns [{ text, hit }].
 *
 * Matching is case-insensitive and tolerant of simple word endings, so the term
 * "look after" also matches "looks after", and "postpone" matches "postponed".
 * Irregular forms ("run" → "ran") are not detected; write example sentences with the
 * base form if you want them hidden in Write mode.
 */
export function splitOnTerm(sentence, term) {
  const words = String(term || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!sentence || !words.length) return [{ text: sentence || "", hit: false }];
  const body = words.map((w) => `${escapeRegExp(w)}[\\p{L}\\p{M}]*`).join("\\s+");
  const re = new RegExp(`(?<![\\p{L}\\p{M}])(${body})`, "giu");
  // split() with one capture group alternates: text, match, text, match, …
  return sentence
    .split(re)
    .map((text, i) => ({ text, hit: i % 2 === 1 }))
    .filter((part) => part.text !== "");
}
