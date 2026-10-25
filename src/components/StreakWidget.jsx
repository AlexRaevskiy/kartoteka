/**
 * Home dashboard widget: 🔥 streak, progress to today's goal, a motivating phrase.
 */
import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, Flame, Trophy } from "lucide-react";
import { ProgressBar } from "./ui.jsx";
import { displayedStreak, goalStatus, localDateKey, motivationPhrase, todayProgress } from "../lib/goals.js";
import { goalAmount, goalText } from "../i18n/index.js";
import { cx } from "../lib/utils.js";

export default function StreakWidget({ profile, settings, now }) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const todayKey = localDateKey(new Date(now));
  const dp = todayProgress(profile, todayKey);
  const status = goalStatus(settings.dailyGoal, dp);
  const streak = displayedStreak(profile, todayKey);
  const daysWord = (n) => t("streak.days", { count: n });
  const phrase = useMemo(
    () => motivationPhrase({ status, streak, todayKey, phrases: t("streak.phrases", { returnObjects: true }), daysWord }),
    [status.met, status.started, status.remaining, streak, todayKey, i18n.language] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // "2/3 раунда" — the unit agrees with the target, the done count is shown separately.
  const unit = goalAmount(t, status.goal.type, status.target).replace(/^\d+\s*/, "");

  return (
    <section
      className={cx("rounded-3xl p-5 relative overflow-hidden", status.met ? "bg-success-container" : "bg-primary-container")}
      aria-label={t("streak.aria")}
    >
      <div className="flex items-start gap-4">
        <div className="flex flex-col items-center shrink-0" aria-label={t("streak.inARow", { count: streak, days: daysWord(streak) })}>
          <div className={cx("w-16 h-16 rounded-2xl flex items-center justify-center", streak > 0 || status.met ? "bg-surface-container-lowest" : "bg-surface-container-lowest/60")}>
            <Flame size={36} strokeWidth={2} style={{ color: streak > 0 || status.met ? "var(--md-streak)" : "var(--md-outline)", fill: streak > 0 || status.met ? "var(--md-streak)" : "none" }} />
          </div>
          <div className="text-title-lg font-bold mt-1 fc-tabular" aria-hidden="true">
            {streak}
          </div>
          <div className="text-label-sm opacity-80" aria-hidden="true">
            {daysWord(streak)}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className={cx("text-title-md", status.met ? "text-on-surface" : "text-on-primary-container")}>{phrase}</p>
          <div className="mt-3">
            <div className="flex justify-between text-label-md mb-1.5 opacity-90">
              <span>{t("streak.goal", { goal: goalText(t, settings.dailyGoal) })}</span>
              <span className="fc-tabular">
                {status.done}/{status.target} {unit}
              </span>
            </div>
            <ProgressBar value={status.pct} color={status.met ? "var(--md-success)" : "var(--md-primary)"} label={t("streak.goalProgress")} className="bg-surface-container-lowest/70" />
          </div>
          <div className="flex items-center justify-between mt-3 text-label-md opacity-90">
            <span className="inline-flex items-center gap-1">
              <Trophy size={14} /> {t("streak.record", { count: Number(profile.longestStreak) || 0 })}
            </span>
            <button type="button" className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline" onClick={() => navigate("/profile#goal")}>
              {t("streak.changeGoal")} <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
