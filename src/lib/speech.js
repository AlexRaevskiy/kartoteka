/**
 * Pronunciation.
 *   1. Cloud voice (src/data/tts.js → /api/tts → Azure, cached in Firestore) — works for Georgian
 *      on iPhone, where the system has no Georgian voice.
 *   2. Fallback: the device voice (Web Speech API), e.g. offline for a word never heard before,
 *      or when the cloud voice isn't configured.
 * The language is guessed from the script, so Georgian/Russian/English decks just work.
 */
import { cloudSpeechAvailable, getSpeechAudio } from "../data/tts.js";

export function detectLang(text = "") {
  if (/[Ⴀ-ჿᲐ-Ჿ]/.test(text)) return "ka-GE";
  if (/[Ѐ-ӿ]/.test(text)) return "ru-RU";
  if (/[Ͱ-Ͽ]/.test(text)) return "el-GR";
  if (/[぀-ヿ]/.test(text)) return "ja-JP";
  if (/[一-鿿]/.test(text)) return "zh-CN";
  if (/[؀-ۿ]/.test(text)) return "ar-SA";
  if (/[ñ¿¡]/i.test(text)) return "es-ES";
  if (/[ãõç]/i.test(text)) return "pt-BR";
  return "en-US";
}

const LANG_NAMES = { "ka-GE": "грузинского", "ru-RU": "русского", "el-GR": "греческого", "ja-JP": "японского", "zh-CN": "китайского", "ar-SA": "арабского", "hy-AM": "армянского", "az-AZ": "азербайджанского", "he-IL": "иврита", "ko-KR": "корейского", "uk-UA": "украинского" };

export const speechSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** Voices load asynchronously in Chrome; call once on startup. */
export function warmUpVoices() {
  if (speechSupported()) window.speechSynthesis.getVoices();
}

// One reusable <audio>: iOS only lets audio play after a tap, and the cloud audio arrives
// later (after a network request). Playing a silent clip on this element *during* the tap
// unlocks it, so the real clip can start when it is ready.
const SILENCE = "data:audio/wav;base64,UklGRuwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YcgAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";
let player = null;
let playToken = 0;

function unlockPlayer() {
  if (typeof Audio === "undefined") return null;
  player ??= new Audio();
  player.pause();
  player.src = SILENCE;
  player.play().catch(() => {});
  return player;
}

/**
 * Speak `text` in `lang` (BCP-47, e.g. "ka-GE"; omitted or "auto" = guess from the script).
 * Call it directly from a click/tap handler (it unlocks audio before the first await).
 * Resolves to { ok, message? } so the UI can show a hint when something went wrong.
 */
export async function speak(text, lang = "auto") {
  lang = !lang || lang === "auto" ? detectLang(text) : lang;
  if (speechSupported()) window.speechSynthesis.cancel();

  if (cloudSpeechAvailable(text, lang)) {
    const audio = unlockPlayer(); // must stay before any await
    const token = ++playToken;
    try {
      const base64 = await getSpeechAudio(text, lang);
      if (token !== playToken) return { ok: true }; // another word was tapped meanwhile
      audio.src = `data:audio/mpeg;base64,${base64}`;
      await audio.play();
      return { ok: true };
    } catch (err) {
      console.warn("[speech] cloud voice unavailable, using the device voice", err);
    }
  }
  return speakWithDevice(text, lang);
}

/** Web Speech API fallback. */
function speakWithDevice(text, lang) {
  if (!speechSupported()) return { ok: false, message: "Не удалось озвучить: нет связи, а в браузере нет встроенного голоса." };
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.9;

  const voices = synth.getVoices() || [];
  const voice =
    voices.find((v) => v.lang?.toLowerCase() === lang.toLowerCase()) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith(lang.slice(0, 2)));
  if (voice) utterance.voice = voice;
  synth.speak(utterance);

  if (!voice && voices.length && LANG_NAMES[lang]) {
    return { ok: true, message: `На этом устройстве нет голоса для ${LANG_NAMES[lang]}, произношение может быть неточным.` };
  }
  return { ok: true };
}
