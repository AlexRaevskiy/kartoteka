/**
 * Full-screen states: Firebase setup missing, splash (auth loading), sign-in, library skeleton,
 * library error, and the empty-library onboarding.
 */
import React from "react";
import { AlertTriangle, Archive, FileText, Plus, RefreshCw, UserRound } from "lucide-react";
import { Spinner } from "./ui.jsx";
import { missingConfig } from "../firebase.js";

function Logo({ size = 40 }) {
  return (
    <div className="fc-logo rounded-xl flex items-center justify-center shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <Archive size={Math.round(size * 0.5)} strokeWidth={2.2} />
    </div>
  );
}

function Centered({ children }) {
  return (
    <div
      className="fc-gutter min-h-screen flex items-center justify-center"
      style={{ paddingTop: "calc(24px + env(safe-area-inset-top, 0px))", paddingBottom: 24 }}
    >
      {children}
    </div>
  );
}

/* ---------- Firebase env vars missing ---------- */
export function SetupScreen() {
  return (
    <Centered>
      <div className="fc-panel p-6 sm:p-8 max-w-lg w-full">
        <div className="flex items-center gap-3">
          <Logo />
          <h1 className="fc-display text-2xl font-extrabold">Connect Firebase</h1>
        </div>
        <p className="fc-muted mt-3">Kartoteka needs your Firebase project settings before it can sign you in. These variables are missing:</p>
        <ul className="mt-3 flex flex-col gap-1">
          {missingConfig.map((k) => (
            <li key={k} className="fc-mono text-sm fc-surface2 rounded-md px-2 py-1">
              {k}
            </li>
          ))}
        </ul>
        <ol className="mt-4 text-sm flex flex-col gap-1.5 list-decimal pl-5">
          <li>Copy <code className="fc-mono">.env.example</code> to <code className="fc-mono">.env.local</code> and fill in the values.</li>
          <li>Restart <code className="fc-mono">npm run dev</code>.</li>
          <li>On Netlify, add the same variables under Site configuration → Environment variables, then redeploy.</li>
        </ol>
      </div>
    </Centered>
  );
}

/* ---------- Splash while Firebase Auth restores the session ---------- */
export function Splash({ label = "Opening your card file…" }) {
  return (
    <Centered>
      <div className="flex flex-col items-center gap-4 text-center" role="status" aria-live="polite">
        <Logo size={56} />
        <div className="fc-display text-xl font-extrabold">Kartoteka</div>
        <div className="flex items-center gap-2 fc-muted text-sm">
          <Spinner size={16} /> {label}
        </div>
      </div>
    </Centered>
  );
}

/* ---------- Sign-in ---------- */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Decorative stack of index cards in the five box colours. */
function CardStack() {
  const cards = [5, 4, 3, 2, 1];
  return (
    <div className="relative mx-auto" style={{ width: 220, height: 150 }} aria-hidden="true">
      {cards.map((b, i) => (
        <div
          key={b}
          className="absolute rounded-xl"
          style={{
            width: 190,
            height: 112,
            left: 15 + (i - 2) * 6,
            top: 8 + i * 7,
            transform: `rotate(${(i - 2) * 3.5}deg)`,
            background: i === cards.length - 1 ? "var(--surface)" : `var(--box-${b})`,
            border: "1px solid var(--border)",
            boxShadow: "0 18px 30px -22px var(--shadow)",
          }}
        >
          {i === cards.length - 1 ? (
            <div className="h-full flex flex-col">
              <div style={{ height: 30 }} />
              <div style={{ height: 2, background: "var(--card-margin)" }} />
              <div className="flex-1 flex items-center justify-center fc-term text-2xl">გამარჯობა</div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function AuthScreen({ auth }) {
  return (
    <Centered>
      <div className="w-full max-w-md flex flex-col gap-6">
        <CardStack />
        <div className="text-center">
          <h1 className="fc-display text-4xl font-extrabold">Kartoteka</h1>
          <p className="fc-muted mt-2 max-w-sm mx-auto">
            Flashcards in five Leitner boxes. A few minutes a day, synced between your phone and your laptop.
          </p>
        </div>
        <div className="fc-panel p-5 flex flex-col gap-3">
          <button type="button" className="fc-btn fc-btn-ghost w-full py-3 text-base" onClick={auth.signInWithGoogle} disabled={auth.busy}>
            {auth.busy ? <Spinner size={18} /> : <GoogleMark />} Continue with Google
          </button>
          <button type="button" className="fc-btn fc-btn-quiet w-full py-3 text-base" onClick={auth.signInAsGuest} disabled={auth.busy}>
            <UserRound size={18} /> Try it as a guest
          </button>
          <p className="text-xs fc-muted text-center">
            Guest decks are saved to the cloud but tied to this browser. You can link Google later and keep everything.
          </p>
          {auth.error ? (
            <div className="fc-feedback-bad rounded-lg p-3 text-sm flex gap-2" role="alert">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{auth.error}</span>
            </div>
          ) : null}
        </div>
      </div>
    </Centered>
  );
}

/* ---------- Library loading skeleton ---------- */
export function LibrarySkeleton() {
  return (
    <div className="mx-auto max-w-6xl grid gap-6 lg:grid-cols-12 py-6" role="status" aria-label="Loading your decks">
      <div className="lg:col-span-4 xl:col-span-3 flex lg:flex-col gap-2 overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div key={i} className="fc-skeleton h-20 w-60 lg:w-auto shrink-0" />
        ))}
      </div>
      <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-5">
        <div className="fc-skeleton h-9 w-2/3" />
        <div className="fc-skeleton h-44" />
        <div className="fc-skeleton h-11" />
        <div className="fc-skeleton h-72" />
        <span className="sr-only">Loading your decks…</span>
      </div>
    </div>
  );
}

export function LibraryError({ message }) {
  return (
    <div className="mx-auto max-w-lg py-16">
      <div className="fc-panel p-6 text-center">
        <AlertTriangle size={28} className="fc-bad mx-auto" />
        <h2 className="fc-display text-xl font-bold mt-3">Couldn't load your decks</h2>
        <p className="fc-muted mt-1 text-sm">{message}</p>
        <button type="button" className="fc-btn fc-btn-primary px-4 py-2.5 mt-5" onClick={() => window.location.reload()}>
          <RefreshCw size={16} /> Try again
        </button>
      </div>
    </div>
  );
}

/* ---------- Empty library (first run) ---------- */
export function EmptyLibrary({ onPaste, onNew }) {
  return (
    <div className="fc-panel p-6 sm:p-10 fc-in">
      <div className="max-w-xl mx-auto text-center">
        <div className="mx-auto w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "var(--accent-soft)" }}>
          <Archive size={22} className="fc-accent" />
        </div>
        <h2 className="fc-display text-2xl font-extrabold mt-4">Your card file is empty</h2>
        <p className="fc-muted mt-1">Paste a word list to build your first deck in seconds, or start with an empty deck.</p>
      </div>
      <div className="max-w-xl mx-auto mt-6">
        <div className="fc-eyebrow mb-2">Paste lines like these</div>
        <pre className="fc-surface2 rounded-xl p-4 fc-mono text-sm overflow-x-auto" style={{ whiteSpace: "pre" }}>
{`ყავა — Coffee — ერთი ყავა, თუ შეიძლება.
look after | take care of | She looks after her brother.
apple - яблоко`}
        </pre>
        <p className="text-xs fc-muted mt-2">Term, definition and an optional example sentence. Copying two or three columns from a spreadsheet works too.</p>
      </div>
      <div className="flex flex-wrap gap-2 justify-center mt-6">
        <button type="button" className="fc-btn fc-btn-primary px-5 py-3" onClick={onPaste}>
          <FileText size={16} /> Paste a word list
        </button>
        <button type="button" className="fc-btn fc-btn-ghost px-5 py-3" onClick={onNew}>
          <Plus size={16} /> Empty deck
        </button>
      </div>
    </div>
  );
}
