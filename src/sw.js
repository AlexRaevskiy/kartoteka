/**
 * Kartoteka service worker (built by vite-plugin-pwa with strategy "injectManifest").
 *
 *  - Precaches the app shell (JS, CSS, fonts, icons) → instant start, works offline.
 *  - SPA routing offline: every navigation falls back to index.html (except Firebase's /__/auth/*).
 *  - Update flow: the page asks before activating a new version ("Доступна новая версия").
 *  - Push: shows reminders sent by netlify/functions/send-reminders.mjs through Firebase Cloud
 *    Messaging (data-only messages: { title, body, url, tag }), and opens the app on tap.
 */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { clientsClaim } from "workbox-core";

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html"), { denylist: [/^\/__\//] }));

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
clientsClaim();

/* ---------- Push reminders ---------- */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { data: { body: event.data?.text() } };
  }
  const data = payload.data || {};
  const n = payload.notification || {};
  const title = data.title || n.title || "Kartoteka";
  const body = data.body || n.body || "Пора повторить карточки 🔥";
  const url = data.url || payload.fcmOptions?.link || "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/pwa-192x192.png",
      badge: "/badge-96.png",
      tag: data.tag || "daily-reminder",
      renotify: true,
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((w) => w.url.startsWith(self.location.origin));
      if (existing) {
        await existing.focus();
        if ("navigate" in existing && existing.url !== url) await existing.navigate(url).catch(() => {});
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});
