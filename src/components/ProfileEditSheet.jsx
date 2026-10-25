/**
 * "Edit profile" sheet: name, photo URL and (for e-mail/Google/Apple accounts) e-mail.
 *  - Name and photo: Firebase updateProfile().
 *  - E-mail: verifyBeforeUpdateEmail() sends a confirmation link; the address changes after it.
 *  - If Firebase asks for a recent sign-in, the sheet asks to confirm (password or popup) and
 *    retries the change.
 */
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, MailCheck, ShieldCheck } from "lucide-react";
import { Avatar, Sheet, Spinner } from "./ui.jsx";
import { authErrorMessage, signInMethod, useAuthContext } from "../data/useAuth.js";
import { useToast } from "./providers.jsx";

const isHttpUrl = (s) => /^https?:\/\/\S+$/i.test(s.trim());

export default function ProfileEditSheet({ onClose }) {
  const { t } = useTranslation();
  const auth = useAuthContext();
  const toast = useToast();
  const user = auth.user;
  const method = signInMethod(user);
  const canChangeEmail = !user.isAnonymous && !!method;

  const [name, setName] = useState(user.displayName || "");
  const [email, setEmail] = useState(user.email || "");
  const [photoURL, setPhotoURL] = useState(user.photoURL || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [password, setPassword] = useState("");
  const [emailSentTo, setEmailSentTo] = useState(null);

  const emailChanged = canChangeEmail && email.trim().toLowerCase() !== (user.email || "").toLowerCase();
  const photoInvalid = photoURL.trim() !== "" && !isHttpUrl(photoURL);

  const requestEmailChange = async () => {
    try {
      await auth.changeEmail(email);
      setNeedsReauth(false);
      setEmailSentTo(email.trim());
      return true;
    } catch (err) {
      if (err?.code === "auth/requires-recent-login") {
        setNeedsReauth(true);
        setError(t("profileEdit.reauthNeeded"));
      } else setError(authErrorMessage(err));
      return false;
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (photoInvalid) return setError(t("profileEdit.photoInvalid"));
    setError(null);
    setSaving(true);
    try {
      if (name.trim() !== (user.displayName || "") || photoURL.trim() !== (user.photoURL || "")) {
        await auth.updateUserProfile({ displayName: name, photoURL });
      }
      if (emailChanged) {
        if (!(await requestEmailChange())) return; // keep the sheet open: reauth or fix the address
      }
      if (!emailChanged) {
        toast(t("profileEdit.saved"));
        onClose();
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // Popup reauth must start synchronously in the tap (iOS); the password path is a form submit.
  const confirmIdentity = () => {
    setError(null);
    setSaving(true);
    auth
      .reauthenticate(password)
      .then(() => requestEmailChange())
      .catch((err) => setError(authErrorMessage(err)))
      .finally(() => setSaving(false));
  };

  const providerName = method === "apple.com" ? "Apple" : "Google";

  return (
    <Sheet
      as="form"
      onSubmit={save}
      title={t("profileEdit.title")}
      onClose={onClose}
      labelId="profile-edit-title"
      footer={
        emailSentTo ? (
          <button type="button" className="fc-btn fc-btn-filled" onClick={onClose}>
            {t("common.done")}
          </button>
        ) : (
          <>
            <button type="button" className="fc-btn fc-btn-text" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="fc-btn fc-btn-filled" disabled={saving || needsReauth}>
              {saving && !needsReauth ? <Spinner size={18} /> : null} {t("common.save")}
            </button>
          </>
        )
      }
    >
      <div className="flex items-center gap-4">
        <Avatar photoURL={isHttpUrl(photoURL) ? photoURL.trim() : null} name={name || user.email} size={56} />
        <p className="text-body-sm text-on-surface-variant">{t("profileEdit.photoPreview")}</p>
      </div>

      <div>
        <label htmlFor="profile-name" className="fc-label">
          {t("profileEdit.name")}
        </label>
        <input id="profile-name" className="fc-input mt-1" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      {canChangeEmail ? (
        <div>
          <label htmlFor="profile-email" className="fc-label">
            {t("profileEdit.email")}
          </label>
          <input
            id="profile-email"
            className="fc-input mt-1"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            value={email}
            disabled={!!emailSentTo}
            onChange={(e) => {
              setEmail(e.target.value);
              setNeedsReauth(false);
            }}
          />
          {emailChanged && !emailSentTo ? <p className="text-body-sm text-on-surface-variant mt-1">{t("profileEdit.emailHint")}</p> : null}
        </div>
      ) : null}

      <div>
        <label htmlFor="profile-photo" className="fc-label">
          {t("profileEdit.photoURL")}
        </label>
        <input id="profile-photo" className="fc-input mt-1" type="url" inputMode="url" autoCapitalize="none" placeholder="https://…" value={photoURL} onChange={(e) => setPhotoURL(e.target.value)} />
        {photoInvalid ? <p className="text-body-sm fc-warn mt-1">{t("profileEdit.photoInvalid")}</p> : null}
      </div>

      {emailSentTo ? (
        <div className="fc-feedback-good rounded-xl p-3 text-body-md flex gap-2" role="status">
          <MailCheck size={18} className="shrink-0 mt-0.5" />
          <span>{t("profileEdit.emailSent", { email: emailSentTo })}</span>
        </div>
      ) : null}

      {error ? (
        <div className="fc-feedback-bad rounded-xl p-3 text-body-md flex gap-2" role="alert">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : null}

      {needsReauth ? (
        <div className="rounded-2xl bg-surface-container-high p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-title-sm">
            <ShieldCheck size={18} className="text-primary" /> {t("profileEdit.reauthTitle")}
          </div>
          {method === "password" ? (
            <>
              <label htmlFor="profile-reauth-password" className="fc-label -mb-2">
                {t("auth.email.password")}
              </label>
              <input id="profile-reauth-password" className="fc-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="fc-btn fc-btn-tonal" disabled={saving || !password} onClick={confirmIdentity}>
                {saving ? <Spinner size={18} /> : null} {t("profileEdit.reauthPassword")}
              </button>
            </>
          ) : (
            <button type="button" className="fc-btn fc-btn-tonal" disabled={saving} onClick={confirmIdentity}>
              {saving ? <Spinner size={18} /> : null} {t("profileEdit.reauthProvider", { provider: providerName })}
            </button>
          )}
        </div>
      ) : null}
    </Sheet>
  );
}
