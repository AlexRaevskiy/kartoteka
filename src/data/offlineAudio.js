/**
 * Offline pronunciation store: IndexedDB "kartoteka-audio" → object store "offlineAudio".
 * Key = the same SHA-256 id as Firestore audio_cache (src/lib/tts.js `ttsCacheKey`), value = base64 MP3.
 * Every failure (private mode, storage blocked, quota) degrades to "not stored" — never throws.
 */
const DB_NAME = "kartoteka-audio";
const STORE = "offlineAudio";

let dbPromise = null;

function openDb() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function run(mode, fn) {
  return openDb().then(
    (db) =>
      db &&
      new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE, mode);
          const req = fn(tx.objectStore(STORE));
          tx.oncomplete = () => resolve(req?.result ?? null);
          tx.onerror = tx.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
  );
}

/** base64 MP3 or null. */
export const getOfflineAudio = (key) => run("readonly", (store) => store.get(key)).then((v) => (typeof v === "string" ? v : null));

export const putOfflineAudio = (key, base64) => run("readwrite", (store) => store.put(base64, key)).then(() => undefined);

/** Which of these keys are already stored. */
export async function storedKeys(keys) {
  const all = await run("readonly", (store) => store.getAllKeys());
  const have = new Set(Array.isArray(all) ? all : []);
  return new Set(keys.filter((k) => have.has(k)));
}
