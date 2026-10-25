/**
 * Netlify Scheduled Function — smart push reminders.
 * Runs every hour (free on Netlify). For users whose reminder hour is now and whose daily goal
 * is NOT met yet, sends a Firebase Cloud Messaging web push with one of the PUSH_MESSAGES.
 *
 * Required environment variables (Netlify → Site configuration → Environment variables,
 * scope them to "Functions"):
 *   FIREBASE_PROJECT_ID     (or VITE_FIREBASE_PROJECT_ID)
 *   FIREBASE_CLIENT_EMAIL   from the service-account JSON
 *   FIREBASE_PRIVATE_KEY    from the service-account JSON (paste as is, with \n)
 *
 * Test it: Netlify UI → Logs & metrics → Functions → send-reminders → "Run now",
 * or locally: `netlify functions:invoke send-reminders`.
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { decideReminder } from "../../src/lib/reminders.js";

const DEAD_TOKEN_CODES = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token", "messaging/invalid-argument"]);

function firebaseAdmin() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      }),
    });
  }
  return { db: getFirestore(), messaging: getMessaging() };
}

export default async function handler() {
  const { db, messaging } = firebaseAdmin();
  const now = new Date();
  const utcHour = now.getUTCHours();
  const siteUrl = process.env.URL || "https://localhost";

  // Only users whose reminder falls on this UTC hour (precomputed by the app in settings.notify.utcHours).
  const snap = await db.collection("users").where("settings.notify.utcHours", "array-contains", utcHour).get();

  let sent = 0;
  let skipped = 0;
  for (const doc of snap.docs) {
    const user = doc.data();
    const tokens = Array.isArray(user.fcmTokens) ? user.fcmTokens : [];
    const decision = decideReminder(user, now);
    if (!tokens.length || !decision.send) {
      skipped += 1;
      continue;
    }

    const res = await messaging.sendEachForMulticast({
      tokens,
      // Data-only: src/sw.js builds the notification itself (no double notifications).
      data: { title: "Kartoteka", body: decision.message, url: "/", tag: "daily-reminder" },
      webpush: {
        headers: { Urgency: "high", TTL: String(4 * 3600) },
        fcmOptions: { link: `${siteUrl}/` },
      },
    });

    const dead = res.responses.map((r, i) => (!r.success && DEAD_TOKEN_CODES.has(r.error?.code) ? tokens[i] : null)).filter(Boolean);
    await doc.ref.update({
      "notifyState.lastSentKey": decision.slotKey,
      "notifyState.lastSentAt": Date.now(),
      ...(dead.length ? { fcmTokens: FieldValue.arrayRemove(...dead) } : {}),
    });
    sent += res.successCount;
  }

  const summary = { utcHour, candidates: snap.size, sent, skipped };
  console.log("[send-reminders]", summary);
  return new Response(JSON.stringify(summary), { headers: { "content-type": "application/json" } });
}

// Every hour, on the hour (UTC).
export const config = { schedule: "0 * * * *" };
