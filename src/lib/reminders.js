/**
 * Smart push reminders — pure decision logic shared by:
 *   - the app (Profile → Уведомления: computes the UTC hours to store)
 *   - netlify/functions/send-reminders.mjs (runs every hour and decides who gets a push)
 *
 * Rule: a reminder is sent at the user's chosen local hour(s) ONLY if today's goal is not met.
 * The evening slot is 20:00 — four hours before the day ends.
 */
import { addDaysToKey, dateKeyInTimeZone, goalStatus, hourInTimeZone, todayProgress } from "./goals.js";

export const PUSH_MESSAGES = [
  "Твой ударный режим в опасности! Пора спасать огонёк 🔥",
  "Карточки сами себя не выучат. Удели всего 5 минут! 🧠",
  "До конца дня еще 4 часа, самое время закрыть цель и отдыхать ☕️",
  "Ты уже на пути к цели! Зайди и добей сегодняшний раунд 🎯",
  "Эй, мы скучаем! Твои колоды заждались тебя 👀",
];

export const REMINDER_SCHEDULES = {
  evening: { label: "Раз в день вечером", hours: [20] },
  morning_evening: { label: "Утром и вечером", hours: [9, 20] },
};

/**
 * Local hours → UTC hours for the user's current offset (stored so the server can query
 * `where("settings.notify.utcHours", "array-contains", currentUtcHour)` instead of scanning everyone).
 * Half-hour time zones round down (a 20:00 reminder in UTC+5:30 arrives at 19:30).
 */
export function localHoursToUtcHours(localHours, now = new Date()) {
  const offsetMin = -now.getTimezoneOffset();
  return [...new Set(localHours.map((h) => (((Math.floor((h * 60 - offsetMin) / 60)) % 24) + 24) % 24))].sort((a, b) => a - b);
}

/**
 * Decide whether to notify one user right now.
 * @param user  the users/{uid} document data
 * @param now   Date
 * @returns { send: false, reason } | { send: true, message, slotKey }
 */
export function decideReminder(user, now = new Date(), rnd = Math.random) {
  const notify = user?.settings?.notify;
  if (!notify?.enabled) return { send: false, reason: "disabled" };
  const tz = notify.timezone || "UTC";
  const todayKey = dateKeyInTimeZone(now, tz);
  const hour = hourInTimeZone(now, tz);
  const hours = notify.localHours?.length ? notify.localHours : REMINDER_SCHEDULES[notify.schedule]?.hours || [20];
  // ±1 h tolerance for half-hour zones and DST changes since the user last opened the app.
  const slot = hours.find((h) => h === hour || h === hour + 1);
  if (slot == null) return { send: false, reason: "not-now" };

  const slotKey = `${todayKey}:${slot}`;
  if (user.notifyState?.lastSentKey === slotKey) return { send: false, reason: "already-sent" };

  const dp = todayProgress(user, todayKey);
  const status = goalStatus(user.settings?.dailyGoal, dp);
  if (status.met) return { send: false, reason: "goal-met" };

  const yesterday = addDaysToKey(todayKey, -1);
  const lastActive = user.dailyProgress?.date || null;
  const streakAtRisk = (Number(user.currentStreak) || 0) > 0 && user.lastStudyDate === yesterday;
  const missedDays = !lastActive || lastActive < addDaysToKey(todayKey, -2);
  const isEvening = slot >= 17;

  let candidates;
  if (streakAtRisk) candidates = [0];
  else if (status.started) candidates = [3];
  else if (missedDays) candidates = [4];
  else if (isEvening) candidates = [2, 1];
  else candidates = [1];

  const message = PUSH_MESSAGES[candidates[Math.floor(rnd() * candidates.length)]];
  return { send: true, message, slotKey };
}
