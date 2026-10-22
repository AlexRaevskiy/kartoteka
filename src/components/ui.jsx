/**
 * Small shared UI pieces. Styling comes from the .fc-* classes in index.css.
 */
import React, { useEffect, useRef, useState } from "react";
import { Loader2, Volume2, X } from "lucide-react";
import { cx, splitOnTerm } from "../lib/utils.js";

export function Spinner({ size = 18, className }) {
  return <Loader2 size={size} className={cx("fc-spin", className)} aria-hidden="true" />;
}

/** Pronounce button. Stops propagation so it never flips/swipes the card it sits on. */
export function SpeakButton({ text, onSpeak, className }) {
  return (
    <button
      type="button"
      className={cx("fc-btn fc-btn-quiet fc-icon-btn", className)}
      aria-label={`Pronounce ${text}`}
      title="Pronounce"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onSpeak(text);
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Volume2 size={18} />
    </button>
  );
}

export function BoxBadge({ box }) {
  return (
    <span className="fc-chip fc-chip-muted">
      <span className="w-2 h-2 rounded-full" style={{ background: `var(--box-${box})` }} />
      Box {box}
    </span>
  );
}

/**
 * Example sentence with the term highlighted (mode="highlight") or blanked out (mode="mask",
 * used when the term is the answer the learner still has to produce).
 */
export function ExampleSentence({ sentence, term, mode = "highlight", className }) {
  if (!sentence) return null;
  return (
    <p className={cx("fc-example", className)}>
      {splitOnTerm(sentence, term).map((part, i) =>
        part.hit ? (
          mode === "mask" ? (
            <span key={i} className="fc-blank" aria-label="blank">
              {part.text}
            </span>
          ) : (
            <mark key={i}>{part.text}</mark>
          )
        ) : (
          <React.Fragment key={i}>{part.text}</React.Fragment>
        )
      )}
    </p>
  );
}

export function EmptyPanel({ icon: Icon, title, body, actions, tone, children }) {
  return (
    <div className="fc-panel p-6 sm:p-10 text-center fc-in">
      {Icon ? (
        <div
          className="mx-auto w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: tone === "good" ? "var(--good-soft)" : "var(--accent-soft)" }}
        >
          <Icon size={22} className={tone === "good" ? "fc-good" : "fc-accent"} />
        </div>
      ) : null}
      <h2 className="fc-display text-xl font-bold mt-4">{title}</h2>
      {body ? <p className="fc-muted mt-1 max-w-md mx-auto">{body}</p> : null}
      {children}
      {actions ? <div className="flex flex-wrap gap-2 justify-center mt-5">{actions}</div> : null}
    </div>
  );
}

/** Two-step destructive button: first tap arms it, second tap confirms (no browser confirm()). */
export function ConfirmButton({ label, confirmLabel, onConfirm, icon: Icon, className }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={cx("fc-btn px-3 py-2 text-sm", armed ? "fc-btn-danger" : "fc-btn-ghost", className)}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {Icon ? <Icon size={15} /> : null} {armed ? confirmLabel : label}
    </button>
  );
}

/** Accessible on/off switch. */
export function Switch({ checked, onChange, label, id }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="fc-switch"
      onClick={() => onChange(!checked)}
    />
  );
}

/**
 * Modal dialog. Bottom sheet on phones, centered card on larger screens.
 * Closes on Escape and on a tap outside.
 */
export function Modal({ title, subtitle, onClose, children, footer, labelId = "modal-title", as = "div", onSubmit }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  const Panel = as;
  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center fc-overlay sm:px-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <Panel
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className="fc-panel fc-in w-full max-w-2xl flex flex-col overflow-hidden rounded-b-none sm:rounded-2xl"
        style={{ maxHeight: "min(92dvh, 48rem)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        onSubmit={onSubmit}
      >
        <div className="flex items-start justify-between gap-3 p-5 fc-border-b">
          <div className="min-w-0">
            <h2 id={labelId} className="fc-display text-xl font-bold">
              {title}
            </h2>
            {subtitle ? <p className="text-sm fc-muted mt-0.5">{subtitle}</p> : null}
          </div>
          <button type="button" className="fc-btn fc-btn-quiet fc-icon-btn" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4 overflow-auto min-h-0">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 p-4 fc-border-t">{footer}</div> : null}
      </Panel>
    </div>
  );
}

/** Toast stack (bottom center, above the iPhone home indicator). */
export function Toasts({ toasts, onDismiss }) {
  return (
    <div
      className="fixed left-0 right-0 z-50 flex flex-col items-center gap-2 pointer-events-none fc-gutter"
      style={{ bottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div key={t.id} className="fc-toast fc-in rounded-xl pl-4 pr-2 py-2 text-sm font-bold shadow-lg max-w-md w-full sm:w-auto flex items-center gap-3 pointer-events-auto">
          {t.icon ? <t.icon size={16} className="shrink-0" /> : null}
          <span className="flex-1 py-1">{t.text}</span>
          {t.action ? (
            <button
              type="button"
              className="fc-btn px-3 py-1.5 text-sm"
              style={{ background: "var(--accent)", color: "var(--accent-fg)", minHeight: "2.25rem" }}
              onClick={() => {
                t.action.onClick();
                onDismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          ) : (
            <button type="button" className="fc-btn fc-icon-btn opacity-70" aria-label="Dismiss" onClick={() => onDismiss(t.id)}>
              <X size={15} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
