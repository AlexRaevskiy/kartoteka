/**
 * Pronunciation with the Web Speech API (window.speechSynthesis).
 * The language is guessed from the script, so Georgian/Russian/English decks just work.
 * Note: iOS and many Android/desktop systems ship no Georgian voice; we tell the user when that happens.
 */

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

const LANG_NAMES = { "ka-GE": "Georgian", "ru-RU": "Russian", "el-GR": "Greek", "ja-JP": "Japanese", "zh-CN": "Chinese", "ar-SA": "Arabic" };

export const speechSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** Voices load asynchronously in Chrome; call once on startup. */
export function warmUpVoices() {
  if (speechSupported()) window.speechSynthesis.getVoices();
}

/** Speak `text`. Returns { ok, message? } so the UI can show a hint when no voice exists. */
export function speak(text) {
  if (!speechSupported()) return { ok: false, message: "Speech isn't supported in this browser." };
  const synth = window.speechSynthesis;
  synth.cancel();

  const lang = detectLang(text);
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
    return { ok: true, message: `No ${LANG_NAMES[lang]} voice is installed on this device, so pronunciation may be off.` };
  }
  return { ok: true };
}
