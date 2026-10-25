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
 * iOS plays sound only in response to a tap, but the cloud audio arrives later (network).
 * A Web Audio context resumed during the tap stays unlocked, so the clip can start whenever it
 * is ready. <audio> is the fallback for browsers without Web Audio. */
let ctx = null;
let playToken = 0;
let current = null; // AudioBufferSourceNode or HTMLAudioElement that is playing now

function unlockAudio() {
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return;
  try {
    ctx ??= new AC();
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    // A one-sample silent buffer started inside the tap — required by older iOS versions.
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    ctx = null;
  }
}

function stopCurrent() {
  try {
    current?.stop ? current.stop() : current?.pause?.();
  } catch {
    /* already stopped */
  }
  current = null;
}

function base64ToArrayBuffer(base64) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function playBase64Mp3(base64) {
  if (ctx) {
    if (ctx.state !== "running") await ctx.resume();
    const buffer = await ctx.decodeAudioData(base64ToArrayBuffer(base64));
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0);
    current = src;
    return;
  }
  const audio = new Audio(`data:audio/mpeg;base64,${base64}`);
  current = audio;
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
