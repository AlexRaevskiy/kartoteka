/**
 * Push notifications (Firebase Cloud Messaging over the standard Web Push API).
 *
 * Client side:
 *   1. Notification.requestPermission()   — must run from a tap (required by Safari/iOS)
 *   2. getToken() bound to OUR service worker (src/sw.js shows the notification)
 *   3. the token is saved to users/{uid}.fcmTokens
 * Server side: netlify/functions/send-reminders.mjs runs hourly and sends the reminders.
 *
 * iPhone/iPad: web push only works in the app installed via "На экран Домой" (iOS 16.4+).
 */
import { app } from "../firebase.js";
import { isIOS, isStandalone } from "./utils.js";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export function pushSupport() {
  if (typeof window === "undefined") return { ok: false, reason: "server" };
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    if (isIOS() && !isStandalone()) return { ok: false, reason: "ios-install", message: "На iPhone уведомления работают только в установленном приложении: Поделиться → «На экран Домой»." };
    return { ok: false, reason: "unsupported", message: "Этот браузер не поддерживает уведомления." };
  }
  if (!VAPID_KEY) return { ok: false, reason: "no-vapid", message: "Не задан VITE_FIREBASE_VAPID_KEY (Firebase → Cloud Messaging → Web Push certificates)." };
  return { ok: true };
}

export const permissionState = () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

/**
 * Ask for permission and register this device. Returns { ok, token?, message? }.
 * Call it directly from a click handler.
 */
export async function enablePush(saveToken) {
  const support = pushSupport();
  if (!support.ok) return { ok: false, message: support.message };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, message: permission === "denied" ? "Уведомления запрещены в настройках браузера. Разрешите их для этого сайта." : "Разрешение не выдано." };
  }

  try {
    const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
    if (!(await isSupported())) return { ok: false, message: "Firebase Messaging не поддерживается в этом браузере." };
    const registration = await navigator.serviceWorker.ready;
    const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return { ok: false, message: "Не удалось получить токен уведомлений." };
    await saveToken(token);
    return { ok: true, token };
  } catch (err) {
    console.error("[push]", err);
    return { ok: false, message: err?.message || "Не удалось включить уведомления." };
  }
}

/** Show pushes that arrive while the app is open as in-app toasts. Returns an unsubscribe fn. */
export async function onForegroundPush(handler) {
  if (!pushSupport().ok || permissionState() !== "granted") return () => {};
  try {
    const { getMessaging, onMessage, isSupported } = await import("firebase/messaging");
    if (!(await isSupported())) return () => {};
    return onMessage(getMessaging(app), (payload) => handler(payload?.data?.body || payload?.notification?.body || ""));
  } catch {
    return () => {};
  }
}
