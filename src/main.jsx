import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

// Self-hosted Google fonts (bundled + precached by the service worker → work offline).
// Roboto Flex: Material Design 3 typeface, covers Latin + Cyrillic.
import "@fontsource-variable/roboto-flex";
import "@fontsource-variable/roboto-mono";
import "@fontsource/noto-sans-georgian/400.css";
import "@fontsource/noto-sans-georgian/500.css";
import "@fontsource/noto-sans-georgian/700.css";

import "./index.css";
import "./i18n/index.js";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
