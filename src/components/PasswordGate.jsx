/**
 * Shown when a shared deck is password-protected and this user hasn't unlocked it yet.
 * Typing the password creates decks/{id}/grants/{uid}; the security rules accept it only
 * if the hash matches the owner's secret, then the deck becomes readable.
 */
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Lock } from "lucide-react";
import * as store from "../data/store.js";
import { useLibrary } from "../data/LibraryProvider.jsx";
import { hashPassword } from "../lib/share.js";
import { Spinner } from "./ui.jsx";

export default function PasswordGate({ deckId, stub, onUnlocked }) {
  const lib = useLibrary();
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError("");
    try {
      await store.createGrant(deckId, lib.uid, await hashPassword(deckId, password));
      onUnlocked();
    } catch (err) {
      setError(err?.code === "permission-denied" ? t("passwordGate.wrong") : err?.message || t("passwordGate.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="fc-panel p-6 max-w-md mx-auto mt-6 flex flex-col gap-4 fc-in" onSubmit={submit}>
      <div className="w-14 h-14 rounded-2xl bg-primary-container text-on-primary-container flex items-center justify-center">
        <Lock size={26} />
      </div>
      <div>
        <h1 className="text-headline-sm">{stub?.title || t("passwordGate.title")}</h1>
        <p className="text-body-md text-on-surface-variant mt-1">
          {stub?.ownerName ? `${t("passwordGate.author", { name: stub.ownerName })} ` : ""}
          {t("passwordGate.body")}
        </p>
      </div>
      <div>
        <label htmlFor="deck-password" className="fc-label">
          {t("auth.email.password")}
        </label>
        <div className="relative mt-1">
          <KeyRound size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          <input
            id="deck-password"
            type="password"
            autoComplete="off"
            className="fc-input"
            style={{ paddingLeft: "2.5rem" }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </div>
        {error ? (
          <p className="text-body-sm fc-bad mt-2" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <button type="submit" className="fc-btn fc-btn-filled" disabled={!password || busy}>
        {busy ? <Spinner size={16} /> : null} {t("passwordGate.open")}
      </button>
    </form>
  );
}
