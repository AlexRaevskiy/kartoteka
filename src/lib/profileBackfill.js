/**
 * Pure helper for the v2 → v3 migration (kept free of Firebase so it can be unit-tested).
 */
import { SCHEMA_VERSION } from "./model.js";
import { addDaysToKey, localDateKey } from "./goals.js";

/** Fill the v3 profile fields (streak etc.) for accounts created before v3. */
export function profileBackfill(profile, now = new Date()) {
  if (!profile || profile.schemaVersion >= SCHEMA_VERSION) return null;
  const patch = { schemaVersion: SCHEMA_VERSION };
  const log = profile.log || {};
  if (profile.currentStreak == null) {
    const today = localDateKey(now);
    let day = log[today] ? today : addDaysToKey(today, -1);
    let streak = 0;
    let last = null;
    while (log[day]) {
      if (!last) last = day;
      streak += 1;
      day = addDaysToKey(day, -1);
    }
    patch.currentStreak = streak;
    patch.longestStreak = Math.max(streak, Number(profile.longestStreak) || 0);
    patch.lastStudyDate = last;
  }
  // v2 remembered the active deck; v3 shows it in "Продолжить изучение".
  const s = profile.settings || {};
  if (s.activeDeckId && !s.lastStudy) {
    patch.settings = { lastStudy: { kind: "deck", id: s.activeDeckId, title: "", mode: "flashcards", goal: "memorize", at: Date.now() } };
  }
  return patch;
}
