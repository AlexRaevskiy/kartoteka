/**
 * Vite config for Kartoteka.
 *
 * - @vitejs/plugin-react  → JSX + Fast Refresh
 * - @tailwindcss/vite     → Tailwind v4 (configured in src/index.css via @theme — fonts, M3 type scale, colours)
 * - vite-plugin-pwa       → manifest.webmanifest + our own service worker (src/sw.js, strategy "injectManifest")
 *                           so we can precache the app AND handle push notifications in one worker.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const BRAND = {
  name: "Kartoteka — карточки по Лейтнеру",
  shortName: "Kartoteka",
  description: "Карточки для изучения слов по системе Лейтнера. Синхронизация между устройствами.",
  background: "#FBF8FF", // --md-surface (light)
  theme: "#3A4DBF", // --md-primary
};

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      registerType: "prompt", // "Доступна новая версия → Обновить"
      injectRegister: false, // registered by useRegisterSW in src/components/PwaPrompts.jsx
      includeAssets: ["favicon.svg", "apple-touch-icon-180x180.png", "badge-96.png"],
      manifest: {
        id: "/",
        name: BRAND.name,
        short_name: BRAND.shortName,
        description: BRAND.description,
        lang: "ru",
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
        shortcuts: [
          { name: "Создать набор", short_name: "Создать", url: "/create", icons: [{ src: "pwa-192x192.png", sizes: "192x192" }] },
          { name: "Профиль и цели", short_name: "Профиль", url: "/profile", icons: [{ src: "pwa-192x192.png", sizes: "192x192" }] },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2,webmanifest}"],
        // Firebase is a big chunk; allow it in the precache so the app works fully offline.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: {
        enabled: false, // set true to debug the service worker during `npm run dev`
        type: "module",
      },
    }),
  ],
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        // Long-lived vendor chunks: app deploys don't invalidate the cached Firebase/React code.
        codeSplitting: {
          groups: [
            { name: "firebase", test: /node_modules[\\/](@firebase|firebase)[\\/]/ },
            { name: "react", test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
});
