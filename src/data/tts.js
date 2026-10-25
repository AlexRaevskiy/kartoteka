/**
 * Pronunciation audio: memory → Firestore audio_cache → /api/tts (Netlify Function → Azure).
 * The function also fills audio_cache, so each word is synthesized once for all users.
 * Returns base64 MP3, or throws (the caller falls back to the device voice).
 */
import { auth } from "../firebase.js";
import { getCachedAudio } from "./store.js";
import { MAX_TTS_CHARS, normalizeTtsText, ttsCacheKey, voiceFor } from "../lib/tts.js";

const memory = new Map(); // cache key → base64, for this session

export const cloudSpeechAvailable = (text, lang) => {
  const t = normalizeTtsText(text);
  return !!voiceFor(lang) && t.length > 0 && t.length <= MAX_TTS_CHARS;
};

export async function getSpeechAudio(text, lang) {
  const key = await ttsCacheKey(text, lang);
  if (memory.has(key)) return memory.get(key);

  // Firestore keeps read documents offline, so words heard once also play without internet.
  const cached = await getCachedAudio(key).catch(() => null);
  if (cached) {
    memory.set(key, cached);
    return cached;
  }

  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Not signed in");
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text: normalizeTtsText(text), lang }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.audioContent) throw new Error(data.error || data.errorMessage || `TTS ${res.status}`);
  memory.set(key, data.audioContent);
  return data.audioContent;
}
