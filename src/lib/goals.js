/**
 * Daily goal + streak (Duolingo-style). Pure functions shared by the app and the
 * reminder function on Netlify, so both agree on "is today's goal done?".
 *
 * Stored on users/{uid}:
 *   currentStreak   days in a row with the goal met
 *   longestStreak   best ever
 *   lastStudyDate   "YYYY-MM-DD" (local) of the last day the goal was met
 *   dailyProgress   { date: "YYYY-MM-DD", seconds, rounds, cards, goalMet }
 *
 * A day counts for the streak when the daily goal is met (not just when the app was opened).
 */

export const GOAL_TYPES = {
  minutes: { label: "По времени", options: [5, 10, 15, 20, 30], unit: "мин" },
  rounds: { label: "По раундам", options: [1, 2, 3, 5], unit: "раунд." },
};
export const DEFAULT_GOAL = { type: "rounds", value: 3 };

/* ---------- date keys ---------- */

export function localDateKey(date = new Date()) {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/** "YYYY-MM-DD" for `date` in an IANA time zone (used by the server). */
export function dateKeyInTimeZone(date, timeZone) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function hourInTimeZone(date, timeZone) {
  try {
    const h = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(date);
    return parseInt(h, 10) % 24;
  } catch {
    return date.getUTCHours();
  }
}

export function addDaysToKey(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/* ---------- progress ---------- */

export function normalizeGoal(goal) {
  const type = goal?.type === "minutes" ? "minutes" : "rounds";
  const value = Math.max(1, Number(goal?.value) || (type === "minutes" ? 15 : 3));
  return { type, value };
}

/** Today's counters (zeros if the stored day is not today). */
export function todayProgress(profile, todayKey) {
  const dp = profile?.dailyProgress;
  if (!dp || dp.date !== todayKey) return { date: todayKey, seconds: 0, rounds: 0, cards: 0, goalMet: false };
  return { date: todayKey, seconds: Number(dp.seconds) || 0, rounds: Number(dp.rounds) || 0, cards: Number(dp.cards) || 0, goalMet: !!dp.goalMet };
}

export function goalStatus(goalIn, dp) {
  const goal = normalizeGoal(goalIn);
  const done = goal.type === "minutes" ? Math.floor(dp.seconds / 60) : dp.rounds;
  const target = goal.value;
  const pct = Math.min(100, Math.round(((goal.type === "minutes" ? dp.seconds / 60 : dp.rounds) / target) * 100));
  const met = done >= target;
  return { goal, done: Math.min(done, target), target, pct, met, remaining: Math.max(0, target - done), started: dp.seconds > 0 || dp.rounds > 0 };
}

/** Streak shown in the UI: it's broken if the goal wasn't met yesterday or today. */
export function displayedStreak(profile, todayKey) {
  const last = profile?.lastStudyDate;
  if (!last) return 0;
  if (last === todayKey || last === addDaysToKey(todayKey, -1)) return Number(profile.currentStreak) || 0;
  return 0;
}

/**
 * Add activity and return the Firestore patch for users/{uid}.
 * @param delta { seconds?, rounds?, cards? }
 */
export function applyActivity(profile, delta, goalIn, todayKey) {
  const before = todayProgress(profile, todayKey);
  const dp = {
    date: todayKey,
    seconds: before.seconds + Math.max(0, Math.round(delta.seconds || 0)),
    rounds: before.rounds + (delta.rounds || 0),
    cards: before.cards + (delta.cards || 0),
    goalMet: before.goalMet,
  };
  const patch = { dailyProgress: dp };
  const metNow = goalStatus(goalIn, dp).met;

  if (metNow && !before.goalMet) {
    dp.goalMet = true;
    const last = profile?.lastStudyDate;
    const current = Number(profile?.currentStreak) || 0;
    const next = last === todayKey ? current : last === addDaysToKey(todayKey, -1) ? current + 1 : 1;
    patch.currentStreak = next;
    patch.longestStreak = Math.max(Number(profile?.longestStreak) || 0, next);
    patch.lastStudyDate = todayKey;
    patch.justMetGoal = true; // UI hint only; stripped before writing
  }
  return patch;
}

/* ---------- widget phrases ---------- */

const PHRASES = {
  start: ["Отличный день, чтобы начать!", "Пара минут — и огонёк загорится 🔥", "Начнём? Первый раунд — самый важный."],
  started: ["Отличный старт!", "Хорошее начало, продолжай!", "Разогрелись — идём дальше!"],
  streak: ["Уже {n} {days} подряд — ты в ударе!", "{n} {days} подряд! Не останавливайся.", "Серия {n} {days}. Береги огонёк!"],
  almostRounds: ["Цель близка, остался еще один раунд!", "Ещё один раунд — и план выполнен!"],
  almostMinutes: ["Цель близка, осталось всего {m} мин!", "Ещё {m} мин — и цель закрыта!"],
  met: ["Молодец, план на сегодня выполнен!", "Цель дня закрыта. Огонёк горит 🔥", "Сегодня ты молодец! Можно отдыхать ☕️"],
};

function plural(n, [one, few, many]) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** Deterministic pick so the phrase doesn't change on every render, only when the state changes. */
function seededPick(list, seed) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

/** `phrases` / `daysWord` let the UI pass translated texts; defaults are the Russian ones above. */
export function motivationPhrase({ status, streak, todayKey, rnd, phrases = PHRASES, daysWord = (n) => plural(n, ["день", "дня", "дней"]) }) {
  let key;
  if (status.met) key = "met";
  else if (status.started && status.goal.type === "rounds" && status.remaining === 1) key = "almostRounds";
  else if (status.started && status.goal.type === "minutes" && status.remaining <= 5) key = "almostMinutes";
  else if (streak >= 3) key = "streak";
  else if (status.started) key = "started";
  else key = "start";
  const list = phrases[key] || PHRASES[key];
  const raw = rnd ? list[Math.floor(rnd() * list.length)] : seededPick(list, `${todayKey}:${key}`);
  return raw
    .replace("{n}", String(streak))
    .replace("{days}", daysWord(streak))
    .replace("{m}", String(Math.max(1, status.remaining)));
}

export function goalLabel(goalIn) {
  const g = normalizeGoal(goalIn);
  return g.type === "minutes" ? `${g.value} мин в день` : `${g.value} ${plural(g.value, ["раунд", "раунда", "раундов"])} в день`;
}
