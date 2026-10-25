/**
 * Languages for terms and definitions (deck settings). The code is a BCP-47 tag that the
 * Web Speech API understands, so the speaker button reads words with the right accent.
 * "auto" = guess from the script (Georgian, Cyrillic, …).
 */
import { detectLang } from "./speech.js";

export const LANGUAGES = [
  { code: "auto", label: "Определять автоматически" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "ka-GE", label: "ქართული — грузинский" },
  { code: "ru-RU", label: "Русский" },
  { code: "uk-UA", label: "Українська" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "pt-PT", label: "Português (Portugal)" },
  { code: "es-ES", label: "Español" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
  { code: "it-IT", label: "Italiano" },
  { code: "tr-TR", label: "Türkçe" },
  { code: "hy-AM", label: "Հայերեն — армянский" },
  { code: "az-AZ", label: "Azərbaycan" },
  { code: "pl-PL", label: "Polski" },
  { code: "zh-CN", label: "中文" },
  { code: "ja-JP", label: "日本語" },
  { code: "ko-KR", label: "한국어" },
  { code: "ar-SA", label: "العربية" },
  { code: "he-IL", label: "עברית" },
];

export const languageLabel = (code) => LANGUAGES.find((l) => l.code === code)?.label || code;

/** Speech language for one side of a card. */
export function speechLang(deck, side, text) {
  const code = side === "definition" ? deck?.defLang : deck?.termLang;
  return code && code !== "auto" ? code : detectLang(text);
}
