/**
 * Auto-play for a study card, per the user's toggles (settings.autoAudio) and the spoiler rules
 * in src/lib/autoSpeak.js.
 *
 *   speakStage(card, deck, "prompt")  when the card appears — from a mount effect. iOS allows it
 *                                     because the tap that opened the mode / moved on called
 *                                     primeAudio() (src/lib/speech.js).
 *   speakStage(card, deck, "answer")  after the flip / the answer — call it inside that tap.
 *
 * Returns a promise that settles when the reading is over (Test / Write / Blitz wait for it
 * before moving on, so the answer is heard in full). If iOS still refuses — a cold start with no
 * tap at all — `needsTap` turns on and `retry()` (a tap on "Tap to listen") plays it again.
 * Leaving the card stops its audio.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLibrary } from "../data/LibraryProvider.jsx";
import { useToast } from "../components/providers.jsx";
import { autoAudioSettings, autoSpeakParts } from "../lib/autoSpeak.js";
import { speechLang } from "../lib/languages.js";
import { speakSequence, stopSpeech } from "../lib/speech.js";

/** Text + voice for one part of a card. */
export function speechPart(card, deck, part) {
  if (part === "term") return card.term ? { text: card.term, lang: speechLang(deck, "term", card.term) } : null;
  if (part === "definition") return card.definition ? { text: card.definition, lang: speechLang(deck, "definition", card.definition) } : null;
  // The example is in the term's language.
  return card.exampleSentence ? { text: card.exampleSentence, lang: speechLang(deck, "term", card.exampleSentence) } : null;
}

/** Resolves when `spoken` is done and at least `minMs` passed — but never later than `maxMs`. */
export function afterSpeech(spoken, minMs, maxMs = 8000) {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  return Promise.race([Promise.all([Promise.resolve(spoken).catch(() => null), wait(minMs)]), wait(Math.max(minMs, maxMs))]);
}

export function useAutoSpeak({ promptSide = "term" } = {}) {
  const lib = useLibrary();
  const toast = useToast();
  const audio = autoAudioSettings(lib.settings);
  const audioRef = useRef(audio);
  audioRef.current = audio;
  const [pending, setPending] = useState(null); // a sequence iOS refused to start

  useEffect(() => () => stopSpeech(), []);

  const play = useCallback(
    (seq) => {
      if (!seq.length) return Promise.resolve({ ok: true });
      setPending(null);
      return speakSequence(seq).then((r) => {
        if (r.blocked) setPending(seq);
        else if (r.message) toast(r.message, { duration: 5000 });
        return r;
      });
    },
    [toast]
  );

  const speakStage = useCallback(
    (card, deck, stage, side = promptSide) =>
      play(
        autoSpeakParts(audioRef.current, { stage, promptSide: side })
          .map((part) => speechPart(card, deck, part))
          .filter(Boolean)
      ),
    [play, promptSide]
  );

  const retry = useCallback(() => {
    if (pending) play(pending);
  }, [pending, play]);

  return { audio, speakStage, needsTap: !!pending, retry };
}
