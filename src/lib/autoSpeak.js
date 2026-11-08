/**
 * Auto-play rules for every study mode — pure functions, no React, no audio.
 *
 * One set of toggles for the whole app (settings.autoAudio): read the word, the translation,
 * the example. The mode only decides WHEN each part may be read, so that auto-play never says
 * the answer before the learner has given it:
 *   - the card just appeared  → only the side shown as the question;
 *   - after the flip / answer → the other side, then the example (it contains the term, and it
 *     is on the back of a flashcard / appears after answering in Test and Write);
 *   - Intro shows everything at once → every enabled part.
 */

export const AUTO_AUDIO_PARTS = ["term", "definition", "example"];

/** Default: read the word when a card appears; the translation and the example stay silent. */
export const DEFAULT_AUTO_AUDIO = { term: true, definition: false, example: false };

/**
 * The user's toggles with defaults. Older profiles kept them as settings.introAudio, when only
 * Intro mode played audio — those choices still apply until the user changes a toggle.
 */
export function autoAudioSettings(settings = {}) {
  return { ...DEFAULT_AUTO_AUDIO, ...(settings?.introAudio || {}), ...(settings?.autoAudio || {}) };
}

/**
 * Which parts of a card to read now, in reading order.
 *   stage      "prompt" (card just shown) | "answer" (after the flip / the answer) | "all" (Intro)
 *   promptSide the side shown as the question: "term" or "definition" ("definition first")
 */
export function autoSpeakParts(audio, { stage, promptSide = "term" } = {}) {
  const on = (part) => !!audio?.[part];
  if (stage === "all") return AUTO_AUDIO_PARTS.filter(on);
  if (stage === "prompt") return on(promptSide) ? [promptSide] : [];
  const answerSide = promptSide === "term" ? "definition" : "term";
  return [answerSide, "example"].filter(on);
}
