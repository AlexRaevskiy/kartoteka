/**
 * Languages for terms and definitions (deck settings). The code is a BCP-47 tag that the
 * Web Speech API understands, so the speaker button reads words with the right accent.
 * "auto" = guess from the script (Georgian, Cyrillic, …).
 */
import { detectLang } from "./speech.js";
import i18n from "../i18n/index.js";

export const LANGUAGES = [
  { code: "auto", label: null }, // translated: languages.auto
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "ka-GE", label: "ქართული" },
  { code: "ru-RU", label: "Русский" },
  { code: "uk-UA", label: "Українська" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "pt-PT", label: "Português (Portugal)" },
  { code: "es-ES", label: "Español" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
  { code: "it-IT", label: "Italiano" },
  { code: "tr-TR", label: "Türkçe" },
  { code: "hy-AM", label: "Հայերեն" },
  { code: "az-AZ", label: "Azərbaycan" },
  { code: "pl-PL", label: "Polski" },
  { code: "zh-CN", label: "中文" },
  { code: "ja-JP", label: "日本語" },
  { code: "ko-KR", label: "한국어" },
  { code: "ar-SA", label: "العربية" },
  { code: "he-IL", label: "עברית" },
];

/** "ქართული — грузинский": the native name, plus the name in the interface language when it differs. */
export function languageLabel(code) {
  if (!code || code === "auto") return i18n.t("languages.auto");
  const native = LANGUAGES.find((l) => l.code === code)?.label || code;
  let local = null;
  try {
    local = new Intl.DisplayNames([i18n.resolvedLanguage || "en"], { type: "language" }).of(code.slice(0, 2));
  } catch {
    /* old browser: native name only */
  }
  return local && local.toLowerCase() !== native.toLowerCase() && !native.includes("(") ? `${native} — ${local}` : native;
}

/** Speech language for one side of a card. */
export function speechLang(deck, side, text) {
  const code = side === "definition" ? deck?.defLang : deck?.termLang;
  return code && code !== "auto" ? code : detectLang(text);
}
