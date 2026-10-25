/**
 * App-wide helpers available anywhere via hooks:
 *   useToast()    → toast(text, { icon, action, duration })
 *   useDialogs()  → await confirm({...}) / await prompt({...})  (M3 dialogs instead of window.confirm/prompt,
 *                   which look out of place and are unreliable in installed iOS apps)
 */
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Sheet } from "./ui.jsx";
import { uid } from "../lib/model.js";

/* ---------- Toasts (M3 snackbar) ---------- */
const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((l) => l.filter((item) => item.id !== id)), []);
  const toast = useCallback(
    (text, { icon, action, duration = 3600 } = {}) => {
      const id = uid();
      setToasts((l) => [...l.slice(-2), { id, text, icon, action }]);
      if (duration) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        className="fixed left-0 right-0 z-[60] flex flex-col items-center gap-2 pointer-events-none fc-gutter"
        style={{ bottom: "calc(96px + env(safe-area-inset-bottom, 0px))" }}
        role="status"
        aria-live="polite"
      >
        {toasts.map((item) => (
          <div key={item.id} className="fc-toast fc-in rounded-lg pl-4 pr-2 py-1.5 text-body-md shadow-lg max-w-md w-full sm:w-auto flex items-center gap-3 pointer-events-auto min-h-12">
            {item.icon ? <item.icon size={18} className="shrink-0" /> : null}
            <span className="flex-1 py-2">{item.text}</span>
            {item.action ? (
              <button
                type="button"
                className="fc-btn fc-btn-text"
                style={{ color: "var(--md-primary-container)" }}
                onClick={() => {
                  item.action.onClick();
                  dismiss(item.id);
                }}
              >
                {item.action.label}
              </button>
            ) : (
              <button type="button" className="fc-btn fc-icon-btn" style={{ color: "inherit", width: 40, height: 40, minHeight: 40 }} aria-label={t("common.close")} onClick={() => dismiss(item.id)}>
                <X size={18} />
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ---------- Confirm / prompt dialogs ---------- */
const DialogContext = createContext(null);
export const useDialogs = () => useContext(DialogContext);

export function DialogProvider({ children }) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState(null);
  const resolver = useRef(null);
  const [value, setValue] = useState("");

  const open = useCallback((d) => {
    setValue(d.defaultValue || "");
    setDialog(d);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);
  const close = (result) => {
    resolver.current?.(result);
    resolver.current = null;
    setDialog(null);
  };

  const api = useMemo(
    () => ({
      /** await confirm({ title, message, confirmLabel, danger }) → boolean */
      confirm: (o) => open({ kind: "confirm", ...o }),
      /** await prompt({ title, message, label, placeholder, defaultValue, confirmLabel }) → string | null */
      prompt: (o) => open({ kind: "prompt", ...o }),
    }),
    [open]
  );

  return (
    <DialogContext.Provider value={api}>
      {children}
      {dialog ? (
        <Sheet
          dialog
          as="form"
          labelId="dialog-title"
          title={dialog.title}
          onClose={() => close(dialog.kind === "prompt" ? null : false)}
          onSubmit={(e) => {
            e.preventDefault();
            if (dialog.kind === "prompt") {
              if (value.trim()) close(value.trim());
            } else close(true);
          }}
          footer={
            <>
              <button type="button" className="fc-btn fc-btn-text" onClick={() => close(dialog.kind === "prompt" ? null : false)}>
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                className="fc-btn fc-btn-text"
                style={dialog.danger ? { color: "var(--md-error)" } : undefined}
                disabled={dialog.kind === "prompt" && !value.trim()}
                autoFocus={dialog.kind === "confirm"}
              >
                {dialog.confirmLabel || "OK"}
              </button>
            </>
          }
        >
          {dialog.message ? <p className="text-body-md text-on-surface-variant">{dialog.message}</p> : null}
          {dialog.kind === "prompt" ? (
            <div>
              {dialog.label ? (
                <label htmlFor="dialog-input" className="fc-label">
                  {dialog.label}
                </label>
              ) : null}
              <input
                id="dialog-input"
                className="fc-input mt-1"
                value={value}
                maxLength={dialog.maxLength || 80}
                placeholder={dialog.placeholder}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
            </div>
          ) : null}
        </Sheet>
      ) : null}
    </DialogContext.Provider>
  );
}
