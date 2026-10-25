/**
 * Shared M3-style UI pieces: buttons live in CSS (.fc-btn-*), these are the stateful bits.
 *   Spinner, SpeakButton, BoxBadge, ExampleSentence, EmptyPanel, Switch,
 *   Sheet (bottom sheet / dialog), Menu (three-dots), TopBar, ProgressBar
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, MoreVertical, Volume2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cx, splitOnTerm } from "../lib/utils.js";

export function Spinner({ size = 18, className }) {
  return <Loader2 size={size} className={cx("fc-spin", className)} aria-hidden="true" />;
}

/**
 * "Gramophone" button: reads the text aloud with the deck's language.
 * While the cloud audio loads (onSpeak returns a promise) it shows a spinner.
 */
export function SpeakButton({ text, lang, onSpeak, className, size = 20 }) {
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return (
    <button
      type="button"
      className={cx("fc-btn fc-icon-btn", className)}
      aria-label={`Озвучить: ${text}`}
      aria-busy={loading || undefined}
      title="Озвучить"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        const pending = onSpeak(text, lang); // called synchronously: iOS needs the tap to start audio
        if (pending?.finally) {
          setLoading(true);
          pending.finally(() => mounted.current && setLoading(false));
        }
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {loading ? <Spinner size={size} /> : <Volume2 size={size} />}
    </button>
  );
}

export function BoxBadge({ box }) {
  return (
    <span className="fc-badge fc-badge-muted">
      <span className="w-2 h-2 rounded-full" style={{ background: `var(--box-${box})` }} />
      Коробка {box}
    </span>
  );
}

/** Example sentence with the term highlighted, or blanked out when the term is the answer. */
export function ExampleSentence({ sentence, term, mode = "highlight", className }) {
  if (!sentence) return null;
  return (
    <p className={cx("fc-example", className)}>
      {splitOnTerm(sentence, term).map((part, i) =>
        part.hit ? (
          mode === "mask" ? (
            <span key={i} className="fc-blank" aria-label="пропуск">
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

export function EmptyPanel({ icon: Icon, title, body, actions, tone, children, className }) {
  return (
    <div className={cx("fc-panel p-6 sm:p-10 text-center fc-in", className)}>
      {Icon ? (
        <div
          className={cx(
            "mx-auto w-14 h-14 rounded-2xl flex items-center justify-center",
            tone === "good" ? "bg-success-container text-success" : "bg-primary-container text-on-primary-container"
          )}
        >
          <Icon size={26} />
        </div>
      ) : null}
      <h2 className="text-title-lg mt-4">{title}</h2>
      {body ? <p className="text-body-md text-on-surface-variant mt-1 max-w-md mx-auto">{body}</p> : null}
      {children}
      {actions ? <div className="flex flex-wrap gap-2 justify-center mt-5">{actions}</div> : null}
    </div>
  );
}

export function Switch({ checked, onChange, label, id, disabled }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="fc-switch disabled:opacity-40"
      onClick={() => onChange(!checked)}
    />
  );
}

export function ProgressBar({ value, color = "var(--md-primary)", label, className }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cx("fc-meter", className)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)}>
      <span style={{ width: `${v}%`, background: color }} />
    </div>
  );
}

/**
 * Bottom sheet on phones, centred dialog on larger screens.
 * Closes on Escape, on the scrim, and (optionally) with the X.
 */
export function Sheet({ title, subtitle, onClose, children, footer, labelId = "sheet-title", as = "div", onSubmit, wide = false, dialog = false }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && closeRef.current?.();
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
      className={cx("fixed inset-0 z-50 flex justify-center fc-overlay", dialog ? "items-center px-6" : "items-end sm:items-center sm:px-4")}
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <Panel
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className={cx("fc-sheet fc-sheet-in w-full flex flex-col overflow-hidden", wide ? "max-w-2xl" : "max-w-lg", dialog && "rounded-[28px]")}
        style={{ maxHeight: "min(92dvh, 52rem)", paddingBottom: dialog ? 0 : "env(safe-area-inset-bottom, 0px)" }}
        onSubmit={onSubmit}
      >
        {!dialog ? <div className="fc-sheet-handle sm:hidden" aria-hidden="true" /> : null}
        <div className={cx("flex items-start justify-between gap-3 px-6", dialog ? "pt-6" : "pt-3 sm:pt-6")}>
          <div className="min-w-0">
            <h2 id={labelId} className="text-headline-sm">
              {title}
            </h2>
            {subtitle ? <p className="text-body-md text-on-surface-variant mt-1">{subtitle}</p> : null}
          </div>
          {onClose && !dialog ? (
            <button type="button" className="fc-btn fc-icon-btn -mr-3 -mt-1" aria-label="Закрыть" onClick={onClose}>
              <X size={22} />
            </button>
          ) : null}
        </div>
        <div className="px-6 py-4 flex flex-col gap-4 overflow-auto min-h-0">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 px-6 pb-6 pt-2">{footer}</div> : null}
      </Panel>
    </div>
  );
}

/**
 * Three-dots menu. items: [{ label, icon, onClick, danger, hidden }]
 */
export function Menu({ items, label = "Ещё", icon: Icon = MoreVertical, align = "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const menuRef = useRef(null);
  const [flipUp, setFlipUp] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  // Open upwards if there's no room below (e.g. a menu near the bottom of the screen).
  useLayoutEffect(() => {
    if (!open || !menuRef.current || !ref.current) return;
    const btn = ref.current.getBoundingClientRect();
    setFlipUp(btn.bottom + menuRef.current.offsetHeight + 16 > window.innerHeight && btn.top > menuRef.current.offsetHeight);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" className="fc-btn fc-icon-btn" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>
        <Icon size={22} />
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          className={cx("fc-menu fc-in absolute z-40", align === "right" ? "right-0" : "left-0", flipUp ? "bottom-full mb-1" : "top-full mt-1")}
          style={{ maxWidth: "calc(100vw - 32px)" }}
        >
          {items
            .filter((i) => !i.hidden)
            .map((item, idx) =>
              item.divider ? (
                <div key={`d${idx}`} className="my-2 border-t border-outline-variant" />
              ) : (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className={cx("fc-menu-item", item.danger && "is-danger")}
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                >
                  {item.icon ? <item.icon size={20} className={item.danger ? "" : "text-on-surface-variant"} /> : null}
                  <span>{item.label}</span>
                </button>
              )
            )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * M3 small top app bar. Changes tone when the page is scrolled.
 * `back`: true → navigate(-1) (or to `backTo` when there's no history, e.g. opened from a link).
 */
export function TopBar({ title, back, backTo = "/", actions, children, className }) {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate(backTo, { replace: true }));
  return (
    <header className={cx("fc-topbar sticky top-0 z-30", scrolled && "is-scrolled", className)}>
      <div className="fc-gutter">
        <div className="mx-auto max-w-3xl flex items-center gap-1 h-16">
          {back ? (
            <button type="button" className="fc-btn fc-icon-btn -ml-3 text-on-surface" aria-label="Назад" onClick={goBack}>
              <ArrowLeft size={24} />
            </button>
          ) : null}
          <div className="min-w-0 flex-1 text-title-lg truncate">{title}</div>
          {children}
          {actions ? <div className="flex items-center -mr-3">{actions}</div> : null}
        </div>
      </div>
    </header>
  );
}
