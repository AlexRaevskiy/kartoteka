import React from "react";
import { createRoot } from "react-dom/client";

// Self-hosted fonts: bundled and precached by the service worker, so they work offline.
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/noto-sans-georgian/400.css";
import "@fontsource/noto-sans-georgian/700.css";

import "./index.css";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
