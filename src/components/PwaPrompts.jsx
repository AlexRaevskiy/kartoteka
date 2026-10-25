/**
 * PWA UI: "new version" snackbar (service-worker update) and the install banner.
 */
import React, { useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useTranslation } from "react-i18next";
import { Download, RefreshCw, Share, X } from "lucide-react";
import { useInstallPrompt } from "../hooks/useInstallPrompt.js";

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
    <div className="fixed left-0 right-0 z-[60] flex justify-center fc-gutter pointer-events-none" style={{ top: "calc(10px + env(safe-area-inset-top, 0px))" }} role="status">
      <div className="fc-toast fc-in rounded-lg pl-4 pr-2 py-1.5 text-body-md shadow-lg flex items-center gap-3 pointer-events-auto max-w-md w-full sm:w-auto">
        <RefreshCw size={18} className="shrink-0" />
        <span className="flex-1">Доступна новая версия.</span>
        <button type="button" className="fc-btn fc-btn-text" style={{ color: "var(--md-primary-container)" }} onClick={() => updateServiceWorker(true)}>
          Обновить
        </button>
        <button type="button" className="fc-btn fc-icon-btn" style={{ color: "inherit", width: 40, height: 40, minHeight: 40 }} aria-label="Позже" onClick={() => setNeedRefresh(false)}>
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

/** Android / desktop install banner (beforeinstallprompt). iOS Safari gets IOSInstallHint instead. */
export function InstallBanner({ install, onDismiss }) {
  if (!install.canInstall) return null;
  return (
    <div className="fc-panel p-4 flex items-center gap-3 fc-in">
      <div className="w-10 h-10 rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center shrink-0" aria-hidden="true">
        <Download size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-title-sm">Установите Kartoteka</div>
        <div className="text-body-sm text-on-surface-variant">Открывайте с домашнего экрана, как приложение. Работает офлайн.</div>
      </div>
      <button type="button" className="fc-btn fc-btn-tonal" onClick={install.promptInstall}>
        Установить
      </button>
      <button type="button" className="fc-btn fc-icon-btn" aria-label="Скрыть" onClick={onDismiss}>
        <X size={20} />
      </button>
    </div>
  );
}

const IOS_HINT_KEY = "kartoteka.iosInstallHintDismissed";

function readDismissed() {
  try {
    return localStorage.getItem(IOS_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * iOS Safari has no install prompt: a banner pinned above the navigation bar (sticky, so it never
 * covers the end of the page) explains
 * Share → "Add to Home Screen". Hidden in the installed app; the ✕ is remembered on this device.
 */
export function IOSInstallHint() {
  const { t } = useTranslation();
  const install = useInstallPrompt();
  const [dismissed, setDismissed] = useState(readDismissed);
  if (!install.showIOSHint || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(IOS_HINT_KEY, "1");
    } catch {
      /* storage blocked: hidden until the next visit only */
    }
  };

  return (
    <div className="sticky z-20 fc-gutter pt-4 pointer-events-none" style={{ bottom: "calc(104px + env(safe-area-inset-bottom, 0px))" }}>
      <aside className="bg-surface-container-highest rounded-3xl fc-in mx-auto max-w-md p-4 flex items-start gap-3 shadow-lg pointer-events-auto" aria-label={t("pwa.iosHintAria")}>
        <div className="w-10 h-10 rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center shrink-0" aria-hidden="true">
          <Share size={20} />
        </div>
        <p className="flex-1 min-w-0 text-body-md">{t("pwa.iosHint")}</p>
        <button type="button" className="fc-btn fc-icon-btn -mr-2 -mt-2 shrink-0" aria-label={t("pwa.iosHintClose")} onClick={dismiss}>
          <X size={20} />
        </button>
      </aside>
    </div>
  );
}
