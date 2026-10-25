/**
 * Netlify Function — cloud pronunciation (POST /api/tts).
 *
 * Body: { text, lang }  (lang = BCP-47, e.g. "ka-GE")
 * Auth: "Authorization: Bearer <Firebase ID token>" — only signed-in users (guests included)
 *       can spend the speech quota.
 * Returns: { audioContent: <base64 MP3>, cached: boolean }
 *
 * Audio comes from Azure Speech (it has Georgian neural voices) and is stored in Firestore
 * audio_cache/{sha256(version|lang|text)} with the Admin SDK. Browsers may only READ that
 * collection (firestore.rules), so nobody can plant fake audio for other users.
 *
 * Environment variables (Netlify → Site configuration → Environment variables, scope "Functions"):
 *   AZURE_SPEECH_KEY       Azure portal → Speech service → Keys and Endpoint → KEY 1
 *   AZURE_SPEECH_REGION    the same page → Location/Region, e.g. "westeurope"
 *   FIREBASE_PROJECT_ID    (or VITE_FIREBASE_PROJECT_ID) — needed to verify ID tokens
 *   FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY — service account (same as send-reminders);
 *                          without them audio still plays, it just isn't cached.
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { MAX_TTS_CHARS, normalizeTtsText, ttsCacheKey, voiceFor } from "../../src/lib/tts.js";

export const config = { path: "/api/tts" };

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
const HAS_SERVICE_ACCOUNT = !!(process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);

function firebaseAdmin() {
  if (!getApps().length) {
    initializeApp(
      HAS_SERVICE_ACCOUNT
        ? {
            credential: cert({
              projectId: PROJECT_ID,
              clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
              privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
            }),
          }
        : { projectId: PROJECT_ID } // enough to verify ID tokens
    );
  }
  return { auth: getAuth(), db: HAS_SERVICE_ACCOUNT ? getFirestore() : null };
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const escapeXml = (s) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);

async function synthesize(text, lang, voice) {
  const region = process.env.AZURE_SPEECH_REGION;
  const ssml = `<speak version="1.0" xml:lang="${lang}"><voice name="${voice}"><prosody rate="-10%">${escapeXml(text)}</prosody></voice></speak>`;
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "kartoteka",
    },
    body: ssml,
  });
  if (!res.ok) throw new Error(`Azure TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer()).toString("base64");
}

export default async function handler(req) {
  if (req.method !== "POST") return json(405, { error: "Use POST" });
  if (!process.env.AZURE_SPEECH_KEY || !process.env.AZURE_SPEECH_REGION) return json(503, { error: "Облачная озвучка не настроена (AZURE_SPEECH_KEY / AZURE_SPEECH_REGION)." });

  const { auth, db } = firebaseAdmin();
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  try {
    await auth.verifyIdToken(token);
  } catch {
    return json(401, { error: "Нужно войти в приложение." });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  const text = normalizeTtsText(body?.text);
  const lang = String(body?.lang || "");
  const voice = voiceFor(lang);
  if (!text || text.length > MAX_TTS_CHARS) return json(400, { error: `Текст пустой или длиннее ${MAX_TTS_CHARS} символов.` });
  if (!voice) return json(400, { error: `Язык ${lang} не поддерживается облачной озвучкой.` });

  const id = await ttsCacheKey(text, lang);
  const ref = db?.collection("audio_cache").doc(id);
  try {
    const hit = ref ? await ref.get() : null;
    if (hit?.exists && hit.get("audioBase64")) return json(200, { audioContent: hit.get("audioBase64"), cached: true });

    const audioContent = await synthesize(text, lang, voice);
    if (ref) {
      await ref.set({ audioBase64: audioContent, text, lang, voice, createdAt: FieldValue.serverTimestamp() }).catch((err) => console.error("[tts] cache write failed", err));
    }
    return json(200, { audioContent, cached: false });
  } catch (err) {
    console.error("[tts]", err);
    return json(502, { error: "Сервис озвучки недоступен." });
  }
}
