/**
 * Full-screen states: Firebase setup missing, splash, sign-in, library error.
 */
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Archive, ArrowLeft, Eye, EyeOff, Mail, RefreshCw, UserRound } from "lucide-react";
import { Spinner } from "./ui.jsx";
import { missingConfig } from "../firebase.js";
import SEO from "./SEO.jsx";

// Sign in with Apple needs an Apple Developer account; turn the button on with VITE_APPLE_SIGN_IN=true.
const APPLE_SIGN_IN = import.meta.env.VITE_APPLE_SIGN_IN === "true";

function Logo({ size = 48 }) {
  return (
    <div className="bg-primary text-on-primary rounded-2xl flex items-center justify-center shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <Archive size={Math.round(size * 0.5)} strokeWidth={2.2} />
    </div>
  );
}

function Centered({ children }) {
  return (
    <div className="fc-gutter min-h-screen flex items-center justify-center" style={{ paddingTop: "calc(24px + env(safe-area-inset-top, 0px))", paddingBottom: 24 }}>
      {children}
    </div>
  );
}

export function SetupScreen() {
  const { t } = useTranslation();
  return (
    <Centered>
      <div className="fc-panel p-6 sm:p-8 max-w-lg w-full">
        <div className="flex items-center gap-3">
          <Logo />
          <h1 className="text-headline-sm">{t("setup.title")}</h1>
        </div>
        <p className="text-body-md text-on-surface-variant mt-3">{t("setup.missing")}</p>
        <ul className="mt-3 flex flex-col gap-1">
          {missingConfig.map((k) => (
            <li key={k} className="fc-mono text-body-sm bg-surface-container-high rounded-md px-2 py-1">
              {k}
            </li>
          ))}
        </ul>
        <ol className="mt-4 text-body-md flex flex-col gap-1.5 list-decimal pl-5">
          <li>{t("setup.step1")}</li>
          <li>{t("setup.step2")}</li>
          <li>{t("setup.step3")}</li>
        </ol>
      </div>
    </Centered>
  );
}

export function Splash({ label }) {
  const { t } = useTranslation();
  return (
    <Centered>
      <div className="flex flex-col items-center gap-4 text-center" role="status" aria-live="polite">
        <Logo size={64} />
        <div className="text-title-lg">Kartoteka</div>
        <div className="flex items-center gap-2 text-body-md text-on-surface-variant">
          <Spinner size={16} /> {label || t("splash.opening")}
        </div>
      </div>
    </Centered>
  );
}

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

function CardStack() {
  return (
    <div className="relative mx-auto" style={{ width: 220, height: 150 }} aria-hidden="true">
      {[5, 4, 3, 2, 1].map((b, i) => (
        <div
          key={b}
          className="absolute rounded-2xl"
          style={{
            width: 190,
            height: 112,
            left: 15 + (i - 2) * 6,
            top: 8 + i * 7,
            transform: `rotate(${(i - 2) * 3.5}deg)`,
            background: i === 4 ? "var(--md-surface-container-lowest)" : `var(--box-${b})`,
            boxShadow: "0 2px 8px var(--md-shadow)",
          }}
        >
          {i === 4 ? (
            <div className="h-full flex flex-col">
              <div style={{ height: 30 }} />
              <div style={{ height: 2, background: "var(--card-margin)" }} />
              <div className="flex-1 flex items-center justify-center text-headline-sm font-medium">გამარჯობა</div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function AppleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.77-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.65zM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.61-2.66 1.37-.58.67-1.09 1.75-.96 2.79 1.02.08 2.05-.52 2.68-1.27z" />
    </svg>
  );
}

function ErrorNote({ children }) {
  return (
    <div className="fc-feedback-bad rounded-xl p-3 text-body-md flex gap-2" role="alert">
      <AlertTriangle size={18} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

/** Email + password: sign in, create an account, or get a reset link. */
function EmailForm({ auth, onBack }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState("signIn"); // signIn | signUp | reset
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const switchMode = (m) => {
    setMode(m);
    setResetSent(false);
    auth.clearError();
  };

  const submit = async (e) => {
    e.preventDefault();
    if (mode === "signIn") await auth.signInWithEmail(email, password);
    else if (mode === "signUp") await auth.signUpWithEmail(email, password, name);
    else if (await auth.resetPassword(email)) setResetSent(true);
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      {mode !== "reset" ? (
        <div className="fc-seg w-full" role="group" aria-label={t("auth.email.title")}>
          <button type="button" className="flex-1 justify-center" aria-pressed={mode === "signIn"} onClick={() => switchMode("signIn")}>
            {t("auth.email.signInTab")}
          </button>
          <button type="button" className="flex-1 justify-center" aria-pressed={mode === "signUp"} onClick={() => switchMode("signUp")}>
            {t("auth.email.signUpTab")}
          </button>
        </div>
      ) : (
        <div>
          <h2 className="text-title-lg">{t("auth.email.resetTitle")}</h2>
          <p className="text-body-md text-on-surface-variant mt-1">{t("auth.email.resetHint")}</p>
        </div>
      )}

      {mode === "signUp" ? (
        <div>
          <label htmlFor="auth-name" className="fc-label">
            {t("auth.email.name")}
          </label>
          <input id="auth-name" className="fc-input mt-1" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      ) : null}
      <div>
        <label htmlFor="auth-email" className="fc-label">
          {t("auth.email.email")}
        </label>
        <input id="auth-email" className="fc-input mt-1" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {mode !== "reset" ? (
        <div>
          <label htmlFor="auth-password" className="fc-label">
            {t("auth.email.password")}
          </label>
          <div className="relative mt-1">
            <input
              id="auth-password"
              className="fc-input pr-12"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "signUp" ? "new-password" : "current-password"}
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="fc-btn fc-icon-btn absolute right-1 top-1/2 -translate-y-1/2"
              aria-label={showPassword ? t("auth.email.hidePassword") : t("auth.email.showPassword")}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          {mode === "signUp" ? <p className="text-body-sm text-on-surface-variant mt-1">{t("auth.email.passwordHint")}</p> : null}
        </div>
      ) : null}

      {resetSent ? <p className="fc-feedback-good rounded-xl p-3 text-body-md">{t("auth.email.resetSent", { email: email.trim() })}</p> : null}
      {auth.error ? <ErrorNote>{auth.error}</ErrorNote> : null}

      <button type="submit" className="fc-btn fc-btn-filled fc-btn-lg w-full" disabled={auth.busy || !email.trim() || (mode !== "reset" && !password)}>
        {auth.busy ? <Spinner size={18} /> : null}
        {t(mode === "signIn" ? "auth.email.signIn" : mode === "signUp" ? "auth.email.signUp" : "auth.email.sendReset")}
      </button>

      <div className="flex items-center justify-between gap-2">
        <button type="button" className="fc-btn fc-btn-text -ml-3" onClick={mode === "reset" ? () => switchMode("signIn") : onBack}>
          <ArrowLeft size={18} /> {t(mode === "reset" ? "auth.email.backToSignIn" : "auth.email.otherMethods")}
        </button>
        {mode === "signIn" ? (
          <button type="button" className="fc-btn fc-btn-text -mr-3" onClick={() => switchMode("reset")}>
            {t("auth.email.forgot")}
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function AuthScreen({ auth }) {
  const { t } = useTranslation();
  const [view, setView] = useState("methods"); // methods | email
  const [pending, setPending] = useState(null); // which button shows the spinner

  // The handler must call auth.* synchronously so the popup opens within the tap (iOS).
  const start = (key, fn) => () => {
    setPending(key);
    fn().finally(() => setPending(null));
  };

  return (
    <Centered>
      <SEO />
      <div className="w-full max-w-sm flex flex-col gap-6">
        <CardStack />
        <div className="text-center">
          <h1 className="text-display-sm">Kartoteka</h1>
          <p className="text-body-lg text-on-surface-variant mt-2">{t("auth.tagline")}</p>
        </div>
        {view === "email" ? (
          <EmailForm
            auth={auth}
            onBack={() => {
              auth.clearError();
              setView("methods");
            }}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <button type="button" className="fc-btn fc-btn-outlined fc-btn-lg w-full text-on-surface" onClick={start("google", auth.signInWithGoogle)} disabled={auth.busy}>
              {pending === "google" ? <Spinner size={18} /> : <GoogleMark />} {t("auth.google")}
            </button>
            {APPLE_SIGN_IN ? (
              <button type="button" className="fc-btn fc-btn-outlined fc-btn-lg w-full text-on-surface" onClick={start("apple", auth.signInWithApple)} disabled={auth.busy}>
                {pending === "apple" ? <Spinner size={18} /> : <AppleMark />} {t("auth.apple")}
              </button>
            ) : null}
            <button
              type="button"
              className="fc-btn fc-btn-outlined fc-btn-lg w-full text-on-surface"
              onClick={() => {
                auth.clearError();
                setView("email");
              }}
              disabled={auth.busy}
            >
              <Mail size={18} /> {t("auth.emailButton")}
            </button>
            <div className="flex items-center gap-3 text-label-md text-on-surface-variant my-1" aria-hidden="true">
              <span className="flex-1 border-t border-outline-variant" /> {t("auth.or")} <span className="flex-1 border-t border-outline-variant" />
            </div>
            <button type="button" className="fc-btn fc-btn-text fc-btn-lg w-full" onClick={start("guest", auth.signInAsGuest)} disabled={auth.busy}>
              {pending === "guest" ? <Spinner size={18} /> : <UserRound size={18} />} {t("auth.guest")}
            </button>
            <p className="text-body-sm text-on-surface-variant text-center">{t("auth.guestHint")}</p>
            {auth.error ? <ErrorNote>{auth.error}</ErrorNote> : null}
          </div>
        )}
      </div>
    </Centered>
  );
}

export function LibraryError({ message }) {
  const { t } = useTranslation();
  return (
    <Centered>
      <div className="fc-panel p-6 text-center max-w-md">
        <AlertTriangle size={32} className="fc-bad mx-auto" />
        <h2 className="text-title-lg mt-3">{t("libraryError.title")}</h2>
        <p className="text-body-md text-on-surface-variant mt-1">{message}</p>
        <button type="button" className="fc-btn fc-btn-filled mt-5" onClick={() => window.location.reload()}>
          <RefreshCw size={18} /> {t("common.retry")}
        </button>
      </div>
    </Centered>
  );
}
