/**
 * Cloud text-to-speech (Azure Speech) — shared by the browser and netlify/functions/tts.js,
 * so both compute the same audio_cache document id for the same word.
 *
 * Azure is used because it has neural Georgian voices; Google Cloud TTS has no ka-GE voice.
 */

export const MAX_TTS_CHARS = 200;

/** Bump when voices or audio settings change, so old cached audio is not reused. */
export const TTS_CACHE_VERSION = "azure-v1";

/** One neural voice per language (Azure "Language and voice support" list). */
export const VOICES = {
  "ka-GE": "ka-GE-EkaNeural",
  "en-US": "en-US-JennyNeural",
  "en-GB": "en-GB-SoniaNeural",
  "ru-RU": "ru-RU-SvetlanaNeural",
  "uk-UA": "uk-UA-PolinaNeural",
  "pt-BR": "pt-BR-FranciscaNeural",
  "pt-PT": "pt-PT-RaquelNeural",
  "es-ES": "es-ES-ElviraNeural",
  "fr-FR": "fr-FR-DeniseNeural",
  "de-DE": "de-DE-KatjaNeural",
  "it-IT": "it-IT-ElsaNeural",
  "tr-TR": "tr-TR-EmelNeural",
  "hy-AM": "hy-AM-AnahitNeural",
  "az-AZ": "az-AZ-BanuNeural",
  "pl-PL": "pl-PL-ZofiaNeural",
  "zh-CN": "zh-CN-XiaoxiaoNeural",
  "ja-JP": "ja-JP-NanamiNeural",
  "ko-KR": "ko-KR-SunHiNeural",
  "ar-SA": "ar-SA-ZariyahNeural",
  "he-IL": "he-IL-HilaNeural",
  "el-GR": "el-GR-AthinaNeural",
};

export const voiceFor = (lang) => VOICES[lang] || null;

export const normalizeTtsText = (text) => String(text ?? "").normalize("NFC").replace(/\s+/g, " ").trim();

/** audio_cache document id: SHA-256 of version + language + text (hex). */
export async function ttsCacheKey(text, lang) {
  const data = new TextEncoder().encode(`${TTS_CACHE_VERSION}|${lang}|${normalizeTtsText(text)}`);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
