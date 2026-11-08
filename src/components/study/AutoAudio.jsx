/**
 * Auto-play UI shared by every study mode:
 *   AudioSettingsButton — the gear in the study top bar
 *   AudioSettingsSheet  — word / translation / example toggles, saved in the profile
 *                         (settings.autoAudio) and applied to all modes
 *   TapToListen         — shown when iOS refused to start audio without a tap
 */
import React from "react";
import { useTranslation } from "react-i18next";
import { Play, Settings } from "lucide-react";
import { useLibrary } from "../../data/LibraryProvider.jsx";
import { Sheet, Switch } from "../ui.jsx";
import { AUTO_AUDIO_PARTS, autoAudioSettings } from "../../lib/autoSpeak.js";
import { cx } from "../../lib/utils.js";

export function AudioSettingsButton({ onClick, className }) {
  const { t } = useTranslation();
  return (
    <button type="button" className={cx("fc-btn fc-icon-btn", className)} aria-label={t("autoAudio.settings")} title={t("autoAudio.settings")} onClick={onClick}>
      <Settings size={22} />
    </button>
  );
}

export function AudioSettingsSheet({ onClose }) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const audio = autoAudioSettings(lib.settings);
  const setAudio = (patch) => lib.actions.updateSettings({ autoAudio: { ...audio, ...patch } });
  return (
    <Sheet
      title={t("autoAudio.settings")}
      subtitle={t("autoAudio.settingsHint")}
      onClose={onClose}
      labelId="auto-audio-title"
      footer={
        <button type="button" className="fc-btn fc-btn-filled" onClick={onClose}>
          {t("common.done")}
        </button>
      }
    >
      {AUTO_AUDIO_PARTS.map((part) => (
        <div key={part} className="flex items-center gap-4 min-h-12">
          <span className="flex-1 text-body-lg">{t(`autoAudio.${part}`)}</span>
          <Switch checked={!!audio[part]} onChange={(on) => setAudio({ [part]: on })} label={t(`autoAudio.${part}`)} />
        </div>
      ))}
      <p className="text-body-sm text-on-surface-variant">{t("autoAudio.spoilerNote")}</p>
    </Sheet>
  );
}

export function TapToListen({ onClick, className }) {
  const { t } = useTranslation();
  return (
    <button type="button" className={cx("fc-btn fc-btn-tonal self-center fc-in", className)} onClick={onClick}>
      <Play size={18} fill="currentColor" /> {t("autoAudio.tapToListen")}
    </button>
  );
}
