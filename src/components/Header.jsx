/**
 * Sticky top bar: brand, sync status, streak, Quick Import, and the account menu
 * (export / restore backup, theme, link guest → Google, install, sign out).
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  Cloud,
  CloudOff,
  CloudUpload,
  Download,
  Flame,
  LogOut,
  Monitor,
  Moon,
  Archive,
  Smartphone,
  Sun,
  Upload,
  UserRound,
  FolderInput,
} from "lucide-react";
import { Spinner } from "./ui.jsx";
import { cx } from "../lib/utils.js";

const SYNC = {
  saved: { icon: Cloud, label: "Saved", className: "fc-good" },
  saving: { icon: CloudUpload, label: "Saving…", className: "fc-accent" },
  connecting: { icon: null, label: "Connecting…", className: "fc-muted" },
  offline: { icon: CloudOff, label: "Offline: changes will sync later", className: "fc-warn" },
};

function SyncBadge({ sync }) {
  const s = SYNC[sync] || SYNC.saved;
  const Icon = s.icon;
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-xs font-bold", s.className)} title={s.label} aria-live="polite">
      {Icon ? <Icon size={16} /> : <Spinner size={14} />}
      <span className="hidden md:inline">{sync === "offline" ? "Offline" : s.label}</span>
      <span className="sr-only md:hidden">{s.label}</span>
    </span>
  );
}

function Avatar({ user }) {
  if (user.photoURL) {
    return <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />;
  }
  return (
    <span className="w-8 h-8 rounded-full fc-surface2 inline-flex items-center justify-center">
      <UserRound size={16} />
    </span>
  );
}

function AccountMenu({ user, theme, onTheme, onExport, onRestore, onLinkGoogle, onSignOut, install, onOpenChange }) {
  const [open, setOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const ref = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => onOpenChange?.(open), [open, onOpenChange]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc);
      setConfirmSignOut(false);
    };
  }, [open]);

  const guest = user.isAnonymous;
  const item = (fn) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="fc-btn fc-btn-quiet fc-icon-btn rounded-full"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account and settings"
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar user={user} />
      </button>

      {open ? (
        <div className="fc-menu fc-in absolute right-0 mt-2 p-2 z-40" style={{ width: "min(20rem, calc(100vw - 32px))" }} role="menu">
          <div className="px-3 py-2">
            <div className="font-bold truncate">{guest ? "Guest account" : user.displayName || user.email}</div>
            <div className="text-xs fc-muted">
              {guest ? "Saved to the cloud, but only reachable from this browser." : user.email}
            </div>
          </div>

          {guest ? (
            <button type="button" role="menuitem" className="fc-menu-item fc-accent" onClick={item(onLinkGoogle)}>
              <Cloud size={17} /> Save to a Google account
            </button>
          ) : null}

          <div className="fc-border-t my-1" />
          <button type="button" role="menuitem" className="fc-menu-item" onClick={item(onExport)}>
            <Download size={17} /> Export data (JSON)
          </button>
          <button type="button" role="menuitem" className="fc-menu-item" onClick={() => fileRef.current?.click()}>
            <FolderInput size={17} /> Restore from backup…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              setOpen(false);
              if (file) onRestore(file);
            }}
          />
          {install.canInstall ? (
            <button type="button" role="menuitem" className="fc-menu-item" onClick={item(install.promptInstall)}>
              <Smartphone size={17} /> Install app
            </button>
          ) : null}

          <div className="fc-border-t my-1" />
          <div className="px-3 pt-2 pb-1 fc-eyebrow">Theme</div>
          <div className="fc-seg flex mx-1 mb-1" role="group" aria-label="Theme">
            {[
              ["system", Monitor, "System"],
              ["light", Sun, "Light"],
              ["dark", Moon, "Dark"],
            ].map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={theme === value}
                className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm py-1.5"
                onClick={() => onTheme(value)}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

          <div className="fc-border-t my-1" />
          <button
            type="button"
            role="menuitem"
            className={cx("fc-menu-item", confirmSignOut && "fc-bad")}
            onClick={() => {
              if (guest && !confirmSignOut) return setConfirmSignOut(true);
              setOpen(false);
              onSignOut();
            }}
          >
            <LogOut size={17} />
            {confirmSignOut ? "Sign out and lose guest decks?" : "Sign out"}
          </button>
          {confirmSignOut ? (
            <p className="text-xs fc-muted px-3 pb-2">
              Guest decks can't be recovered after signing out. Export them or save to Google first. Tap again to sign out anyway.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function Header({ user, sync, streak, today, theme, onTheme, onImport, onExport, onRestore, onLinkGoogle, onSignOut, install, onMenuOpenChange }) {
  return (
    <header className="fc-header sticky top-0 z-30">
      <div className="fc-gutter">
        <div className="mx-auto max-w-6xl flex items-center gap-2 sm:gap-3 py-2.5">
          <div className="fc-logo w-9 h-9 rounded-lg flex items-center justify-center shrink-0" aria-hidden="true">
            <Archive size={19} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 mr-auto">
            <div className="fc-display text-lg font-extrabold leading-none">Kartoteka</div>
            <div className="text-xs fc-muted leading-tight mt-0.5 hidden sm:block">Leitner flashcards</div>
          </div>

          <div className="hidden md:flex items-center gap-4 mr-1 text-sm">
            <span className="inline-flex items-center gap-1.5" title="Days in a row with at least one review">
              <Flame size={16} className="fc-warn" />
              <span className="fc-mono font-bold">{streak}</span>
              <span className="fc-muted">day streak</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check size={16} className="fc-good" />
              <span className="fc-mono font-bold">{today}</span>
              <span className="fc-muted">today</span>
            </span>
          </div>

          <SyncBadge sync={sync} />

          <button type="button" className="fc-btn fc-btn-ghost px-3 py-2 text-sm" onClick={onImport}>
            <Upload size={16} />
            <span className="hidden sm:inline">Quick import</span>
            <span className="sm:hidden">Import</span>
          </button>

          <AccountMenu
            user={user}
            theme={theme}
            onTheme={onTheme}
            onExport={onExport}
            onRestore={onRestore}
            onLinkGoogle={onLinkGoogle}
            onSignOut={onSignOut}
            install={install}
            onOpenChange={onMenuOpenChange}
          />
        </div>
      </div>
    </header>
  );
}
