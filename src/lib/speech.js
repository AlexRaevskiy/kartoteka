/**
 * Pronunciation.
 *   1. Cloud voice (src/data/tts.js → /api/tts → Azure, cached in Firestore) — works for Georgian
 *      on iPhone, where the system has no Georgian voice.
 *   2. Only if the cloud fails: the device voice (Web Speech API), e.g. offline for a word never
 *      heard before. The user is told why the cloud voice wasn't used.
 * The language is guessed from the script, so Georgian/Russian/English decks just work.
 */
import { cloudSpeechAvailable, getSpeechAudio } from "../data/tts.js";
import i18n from "../i18n/index.js";

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

export const speechSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** Voices load asynchronously in Chrome; call once on startup (only needed for the fallback). */
export function warmUpVoices() {
  if (speechSupported()) window.speechSynthesis.getVoices();
}

/** "грузинский" / "Georgian" in the interface language. */
function languageName(lang) {
  try {
    return new Intl.DisplayNames([i18n.resolvedLanguage || "en"], { type: "language" }).of(lang.slice(0, 2)) || lang;
  } catch {
    return lang;
  }
}

/* ---------- cloud audio playback ----------
 * One reusable <audio> element (singleton).
 *  - iOS plays sound only in response to a tap, but the cloud audio arrives later (network).
 *    Playing a silent clip on this element synchronously inside the tap unlocks it, so the
 *    real clip can start on the same element when it is ready.
 *  - Media elements use the "playback" audio category on iOS: unlike Web Audio, they are heard
 *    through the speaker even with the silent switch on. navigator.audioSession (Safari 16.4+)
 *    asks for the same category explicitly.
 */
const SILENCE = "data:audio/wav;base64,UklGRuwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YcgAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";
let player = null;
let playToken = 0;

function getPlayer() {
  if (typeof Audio === "undefined") return null;
  if (!player) {
    player = new Audio();
    player.preload = "auto";
    player.setAttribute("playsinline", "");
  }
  return player;
}

/** Must run synchronously in the click/tap handler, before any await. */
function unlockAudio() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = "playback";
  } catch {
    /* not supported */
  }
  const audio = getPlayer();
  if (!audio) return;
  audio.src = SILENCE;
  audio.play().catch(() => {}); // interrupted by the real clip below — that's fine
}

function stopCurrent() {
  if (player && !player.paused) player.pause();
}

async function playBase64Mp3(base64) {
  const audio = getPlayer();
  if (!audio) throw new Error("No audio support");
  audio.src = `data:audio/mpeg;base64,${base64}`;
  await audio.play();
}

/**
 * Speak `text` in `lang` (BCP-47, e.g. "ka-GE"; omitted or "auto" = guess from the script).
 * Call it directly from a click/tap handler (it unlocks audio before the first await).
 * Resolves to { ok, message? } — message only when something went wrong.
 */
export async function speak(text, lang = "auto") {
  lang = !lang || lang === "auto" ? detectLang(text) : lang;
  if (speechSupported()) window.speechSynthesis.cancel();
  stopCurrent();

  let cloudError = null;
  if (cloudSpeechAvailable(text, lang)) {
    unlockAudio(); // must stay before any await
    const token = ++playToken;
    try {
      const base64 = await getSpeechAudio(text, lang);
      if (token !== playToken) return { ok: true }; // another word was tapped meanwhile
      await playBase64Mp3(base64);
      return { ok: true }; // cloud worked: never fall through to device-voice checks or hints
    } catch (err) {
      console.warn("[speech] cloud voice failed, falling back to the device voice", err);
      cloudError = err;
    }
  }
  return speakWithDevice(text, lang, cloudError);
}

/** Web Speech API — used only when the cloud voice failed or doesn't cover this language. */
function speakWithDevice(text, lang, cloudError) {
  const reason = cloudError ? i18n.t("speech.cloudFailed", { reason: cloudError.message || String(cloudError) }) : "";
  if (!speechSupported()) return { ok: false, message: reason || i18n.t("speech.unsupported") };

  const synth = window.speechSynthesis;
  const voices = synth.getVoices() || [];
  const voice =
    voices.find((v) => v.lang?.toLowerCase().replace("_", "-") === lang.toLowerCase()) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith(lang.slice(0, 2)));

  // No matching device voice (e.g. Georgian on iPhone): another language's voice would only
  // mangle the word, so stay silent and explain.
  if (!voice && voices.length) {
    return { ok: false, message: [reason, i18n.t("speech.noDeviceVoice", { language: languageName(lang) })].filter(Boolean).join(" ") };
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.9;
  if (voice) utterance.voice = voice;
  synth.speak(utterance);
  return { ok: true, message: reason || undefined };
}
