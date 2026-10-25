/**
 * Pronunciation audio: memory → IndexedDB (this device, offline) → Firestore audio_cache →
 * /api/tts (Netlify Function → Azure). The function fills audio_cache, so each word is
 * synthesized once for all users; whatever this device gets is also kept in IndexedDB.
 * Returns base64 MP3, or throws (the caller falls back to the device voice).
 */
import { auth } from "../firebase.js";
import { getCachedAudio } from "./store.js";
import { getOfflineAudio, putOfflineAudio, storedKeys } from "./offlineAudio.js";
import { MAX_TTS_CHARS, normalizeTtsText, ttsCacheKey, voiceFor } from "../lib/tts.js";

const memory = new Map(); // cache key → base64, for this session

export const cloudSpeechAvailable = (text, lang) => {
  const t = normalizeTtsText(text);
  return !!voiceFor(lang) && t.length > 0 && t.length <= MAX_TTS_CHARS;
};

async function fromNetwork(key, text, lang) {
  const cached = await getCachedAudio(key).catch(() => null);
  if (cached) return cached;
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Not signed in");
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text: normalizeTtsText(text), lang }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.audioContent) throw new Error(data.error || data.errorMessage || `TTS ${res.status}`);
  return data.audioContent;
}

export async function getSpeechAudio(text, lang) {
  const key = await ttsCacheKey(text, lang);
  if (memory.has(key)) return memory.get(key);

  const offline = await getOfflineAudio(key);
  if (offline) {
    memory.set(key, offline);
    return offline;
  }

  const base64 = await fromNetwork(key, text, lang);
  memory.set(key, base64);
  putOfflineAudio(key, base64); // keep it on this device for offline study
  return base64;
}

/* ---------- "Download audio" for whole sets ---------- */

/** Unique { text, lang, key } entries that the cloud voice can read. */
export async function audioEntries(pairs) {
  const seen = new Map();
  for (const { text, lang } of pairs) {
    const t = normalizeTtsText(text);
    if (!cloudSpeechAvailable(t, lang)) continue;
    const key = await ttsCacheKey(t, lang);
    if (!seen.has(key)) seen.set(key, { text: t, lang, key });
  }
  return [...seen.values()];
}

/** How many entries are already on this device. */
export async function countOffline(entries) {
  const have = await storedKeys(entries.map((e) => e.key));
  return have.size;
}

/**
 * Store every entry in IndexedDB: already stored ones are skipped, the rest are fetched a few at
 * a time (not to hit the function's limits). onProgress(done, total) after each entry.
 * Resolves to { total, failed }.
 */
export async function downloadAudio(entries, { concurrency = 3, onProgress, signal } = {}) {
  const have = await storedKeys(entries.map((e) => e.key));
  let done = have.size;
  let failed = 0;
  onProgress?.(done, entries.length);
  const queue = entries.filter((e) => !have.has(e.key));

  const worker = async () => {
    while (queue.length && !signal?.aborted) {
      const e = queue.shift();
      try {
        const base64 = await fromNetwork(e.key, e.text, e.lang);
        await putOfflineAudio(e.key, base64);
        memory.set(e.key, base64);
      } catch (err) {
        failed += 1;
        console.warn("[tts] download failed", e.text, err);
      }
      done += 1;
      onProgress?.(done, entries.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return { total: entries.length, failed };
}
