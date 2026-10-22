/**
 * Vite config for Kartoteka.
 *
 * - @vitejs/plugin-react  → JSX + Fast Refresh
 * - @tailwindcss/vite     → Tailwind v4 (configured from src/index.css, no tailwind.config.js needed)
 * - vite-plugin-pwa       → generates manifest.webmanifest + a Workbox service worker (sw.js)
 *
 * The service worker precaches the whole app shell (JS, CSS, fonts, icons), so the app
 * opens instantly and works offline. Firestore keeps its own offline cache in IndexedDB
 * (see src/firebase.js), so study progress made offline syncs when the device reconnects.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// Brand colours used by the manifest / splash screens. Keep in sync with src/index.css tokens.
const BRAND = {
  name: "Kartoteka — Leitner Flashcards",
  shortName: "Kartoteka",
  description: "Spaced-repetition flashcards with the Leitner system. Synced across your devices.",
  background: "#EEF0F4", // --bg (light)
  theme: "#2C43C4", // --accent
};

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // "prompt": a new deploy shows an "Update available" toast instead of silently
      // swapping code under the user mid-session (see src/components/UpdatePrompt.jsx).
      registerType: "prompt",
      injectRegister: false, // we register manually via virtual:pwa-register/react
      includeAssets: ["favicon.svg", "apple-touch-icon-180x180.png"],
      manifest: {
        id: "/",
        name: BRAND.name,
        short_name: BRAND.shortName,
        description: BRAND.description,
        lang: "en",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        background_color: BRAND.background,
        theme_color: BRAND.theme,
        categories: ["education", "productivity"],
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2,webmanifest}"], // woff2 only: every PWA-capable browser supports it
        // SPA: serve index.html for every navigation (offline too)…
        navigateFallback: "/index.html",
        // …except Firebase's auth handler, which must always hit the network.
        navigateFallbackDenylist: [/^\/__\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // Firebase is a big chunk; raise the precache size limit so it is cached for offline use.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: {
        enabled: false, // set true to debug the service worker during `npm run dev`
      },
    }),
  ],
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        // Separate long-lived vendor chunks: app deploys don't invalidate the cached Firebase/React code.
        codeSplitting: {
          groups: [
            { name: "firebase", test: /node_modules[\\/](@firebase|firebase)[\\/]/ },
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
});
