/**
 * Translated wording for values computed by the pure modules in src/lib (which stay free of
 * i18n so they run in Node tests and Netlify Functions). Pass the `t` from useTranslation().
 */
import { daysBetween } from "../lib/leitner.js";

/** "today" / "tomorrow" / "in 3 days". */
export function relativeDay(t, ts, now = Date.now()) {
  const n = daysBetween(now, ts);
  if (n <= 0) return t("time.today");
  if (n === 1) return t("time.tomorrow");
  return t("time.inDays", { count: n });
}
