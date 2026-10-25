/**
 * PWA UI: "new version" snackbar (service-worker update) and the install banner.
 */
import React from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Download, RefreshCw, Share, SquarePlus, X } from "lucide-react";

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

export function InstallBanner({ install, onDismiss }) {
  if (!install.canInstall && !install.showIOSHint) return null;
  return (
    <div className="fc-panel p-4 flex items-center gap-3 fc-in">
      <div className="w-10 h-10 rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center shrink-0" aria-hidden="true">
        <Download size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-title-sm">Установите Kartoteka</div>
        {install.canInstall ? (
          <div className="text-body-sm text-on-surface-variant">Открывайте с домашнего экрана, как приложение. Работает офлайн.</div>
        ) : (
          <div className="text-body-sm text-on-surface-variant">
            Нажмите <Share size={13} className="inline -mt-0.5" aria-label="Поделиться" /> «Поделиться», затем{" "}
            <b className="whitespace-nowrap">
              <SquarePlus size={13} className="inline -mt-0.5" /> На экран «Домой»
            </b>
            .
          </div>
        )}
      </div>
      {install.canInstall ? (
        <button type="button" className="fc-btn fc-btn-tonal" onClick={install.promptInstall}>
          Установить
        </button>
      ) : null}
      <button type="button" className="fc-btn fc-icon-btn" aria-label="Скрыть" onClick={onDismiss}>
        <X size={20} />
      </button>
    </div>
  );
}
