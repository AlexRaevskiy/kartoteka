/**
 * Interface language (ru / en). The choice is stored per device in localStorage.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ru from "./locales/ru.json";
import en from "./locales/en.json";
import { normalizeGoal } from "../lib/goals.js";

export const LANGUAGES = [
  { code: "en", label: "🇬🇧 English" },
  { code: "ru", label: "🇷🇺 Русский" },
];
const STORAGE_KEY = "kartoteka.lang";

function initialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGUAGES.some((l) => l.code === saved)) return saved;
  } catch {
    /* storage blocked: fall through */
  }
  // No saved choice: Russian for Russian-language browsers, English for everyone else.
  const browser = (typeof navigator !== "undefined" && (navigator.languages?.[0] || navigator.language)) || "";
  return browser.toLowerCase().startsWith("ru") ? "ru" : "en";
}

export function setLanguage(code) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* storage blocked: the choice lasts for this session only */
  }
  return i18n.changeLanguage(code);
}

/** "15 мин" / "3 rounds" — the amount of a goal or chip, without "per day". */
export function goalAmount(t, type, value) {
  return t(type === "minutes" ? "goal.minutes" : "goal.rounds", { count: value });
}

/** Daily goal wording: "3 раунда в день" / "3 rounds a day". */
export function goalText(t, goalIn) {
  const g = normalizeGoal(goalIn);
  return t("goal.perDay", { value: goalAmount(t, g.type, g.value) });
}

i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});

i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru }, en: { translation: en } },
  lng: initialLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
