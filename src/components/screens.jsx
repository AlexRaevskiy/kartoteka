/**
 * Full-screen states: Firebase setup missing, splash, sign-in, library error.
 */
import React from "react";
import { AlertTriangle, Archive, RefreshCw, UserRound } from "lucide-react";
import { Spinner } from "./ui.jsx";
import { missingConfig } from "../firebase.js";

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
  return (
    <Centered>
      <div className="fc-panel p-6 sm:p-8 max-w-lg w-full">
        <div className="flex items-center gap-3">
          <Logo />
          <h1 className="text-headline-sm">Подключите Firebase</h1>
        </div>
        <p className="text-body-md text-on-surface-variant mt-3">Не заданы переменные окружения:</p>
        <ul className="mt-3 flex flex-col gap-1">
          {missingConfig.map((k) => (
            <li key={k} className="fc-mono text-body-sm bg-surface-container-high rounded-md px-2 py-1">
              {k}
            </li>
          ))}
        </ul>
        <ol className="mt-4 text-body-md flex flex-col gap-1.5 list-decimal pl-5">
          <li>Скопируйте <code className="fc-mono">.env.example</code> в <code className="fc-mono">.env.local</code> и заполните значения.</li>
          <li>Перезапустите <code className="fc-mono">npm run dev</code>.</li>
          <li>На Netlify добавьте те же переменные и сделайте «Clear cache and deploy».</li>
        </ol>
      </div>
    </Centered>
  );
}

export function Splash({ label = "Открываем картотеку…" }) {
  return (
    <Centered>
      <div className="flex flex-col items-center gap-4 text-center" role="status" aria-live="polite">
        <Logo size={64} />
        <div className="text-title-lg">Kartoteka</div>
        <div className="flex items-center gap-2 text-body-md text-on-surface-variant">
          <Spinner size={16} /> {label}
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

export function AuthScreen({ auth }) {
  return (
    <Centered>
      <div className="w-full max-w-sm flex flex-col gap-6">
        <CardStack />
        <div className="text-center">
          <h1 className="text-display-sm">Kartoteka</h1>
          <p className="text-body-lg text-on-surface-variant mt-2">Карточки по системе Лейтнера. Несколько минут в день — и слова остаются в памяти.</p>
        </div>
        <div className="flex flex-col gap-3">
          <button type="button" className="fc-btn fc-btn-outlined fc-btn-lg w-full text-on-surface" onClick={auth.signInWithGoogle} disabled={auth.busy}>
            {auth.busy ? <Spinner size={18} /> : <GoogleMark />} Войти через Google
          </button>
          <button type="button" className="fc-btn fc-btn-text fc-btn-lg w-full" onClick={auth.signInAsGuest} disabled={auth.busy}>
            <UserRound size={18} /> Попробовать без регистрации
          </button>
          <p className="text-body-sm text-on-surface-variant text-center">Гостевые наборы хранятся в облаке, но привязаны к этому браузеру. Google можно подключить позже — всё сохранится.</p>
          {auth.error ? (
            <div className="fc-feedback-bad rounded-xl p-3 text-body-md flex gap-2" role="alert">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <span>{auth.error}</span>
            </div>
          ) : null}
        </div>
      </div>
    </Centered>
  );
}

export function LibraryError({ message }) {
  return (
    <Centered>
      <div className="fc-panel p-6 text-center max-w-md">
        <AlertTriangle size={32} className="fc-bad mx-auto" />
        <h2 className="text-title-lg mt-3">Не удалось загрузить наборы</h2>
        <p className="text-body-md text-on-surface-variant mt-1">{message}</p>
        <button type="button" className="fc-btn fc-btn-filled mt-5" onClick={() => window.location.reload()}>
          <RefreshCw size={18} /> Повторить
        </button>
      </div>
    </Centered>
  );
}
