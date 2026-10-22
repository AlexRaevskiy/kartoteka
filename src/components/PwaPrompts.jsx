/**
 * PWA UI: "new version available" bar (service worker update) and the install banner.
 */
import React from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Download, RefreshCw, Share, SquarePlus, X } from "lucide-react";

/** Shown when a new deploy is waiting. Reload activates it. Also checks for updates every hour. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
    },
  });

  if (!needRefresh) return null;
  return (
    <div
      className="fixed left-0 right-0 z-50 flex justify-center fc-gutter pointer-events-none"
      style={{ top: "calc(10px + env(safe-area-inset-top, 0px))" }}
      role="status"
    >
      <div className="fc-toast fc-in rounded-xl pl-4 pr-2 py-2 text-sm font-bold shadow-lg flex items-center gap-3 pointer-events-auto max-w-md w-full sm:w-auto">
        <RefreshCw size={16} className="shrink-0" />
        <span className="flex-1">A new version of Kartoteka is ready.</span>
        <button
          type="button"
          className="fc-btn px-3 py-1.5 text-sm"
          style={{ background: "var(--accent)", color: "var(--accent-fg)", minHeight: "2.25rem" }}
          onClick={() => updateServiceWorker(true)}
        >
          Reload
        </button>
        <button type="button" className="fc-btn fc-icon-btn opacity-70" aria-label="Later" onClick={() => setNeedRefresh(false)}>
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

/** Install banner: native prompt on Android/desktop, instructions on iPhone/iPad. */
export function InstallBanner({ install, onDismiss }) {
  if (!install.canInstall && !install.showIOSHint) return null;
  return (
    <div className="fc-panel p-3 sm:p-4 flex items-center gap-3 fc-in">
      <div className="w-10 h-10 rounded-xl fc-logo flex items-center justify-center shrink-0" aria-hidden="true">
        <Download size={18} />
      </div>
      <div className="flex-1 min-w-0 text-sm">
        <div className="font-bold">Install Kartoteka</div>
        {install.canInstall ? (
          <div className="fc-muted">Open it from your home screen like an app. Works offline.</div>
        ) : (
          <div className="fc-muted">
            Tap <Share size={14} className="inline -mt-0.5" aria-label="Share" /> Share, then{" "}
            <b className="fc-fg whitespace-nowrap">
              <SquarePlus size={14} className="inline -mt-0.5" /> Add to Home Screen
            </b>
            .
          </div>
        )}
      </div>
      {install.canInstall ? (
        <button type="button" className="fc-btn fc-btn-primary px-3 py-2 text-sm" onClick={install.promptInstall}>
          Install
        </button>
      ) : null}
      <button type="button" className="fc-btn fc-btn-quiet fc-icon-btn" aria-label="Dismiss" onClick={onDismiss}>
        <X size={16} />
      </button>
    </div>
  );
}
