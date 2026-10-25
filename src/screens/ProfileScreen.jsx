/**
 * /profile — account, daily goal, round size, reminders (push), appearance, backup, install.
 */
import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bell, BellOff, Cloud, Download, Flame, FolderInput, Languages, LogOut, Monitor, Moon, Smartphone, Sun, Trophy, UserRound } from "lucide-react";
import { useLibrary } from "../data/LibraryProvider.jsx";
import { useAuthContext } from "../data/useAuth.js";
import { mergeGuestInto } from "../data/merge.js";
import { useDialogs, useToast } from "../components/providers.jsx";
import { Switch, TopBar } from "../components/ui.jsx";
import SEO from "../components/SEO.jsx";
import { useInstallPrompt } from "../hooks/useInstallPrompt.js";
import { GOAL_TYPES, displayedStreak, localDateKey, normalizeGoal } from "../lib/goals.js";
import { LANGUAGES, goalAmount, goalText, setLanguage } from "../i18n/index.js";
import { ROUND_SIZES } from "../lib/rounds.js";
import { REMINDER_SCHEDULES, localHoursToUtcHours } from "../lib/reminders.js";
import { enablePush, permissionState, pushSupport } from "../lib/push.js";
import { backupFilename, buildBackup, readBackup } from "../lib/backup.js";
import { downloadText } from "../lib/share.js";
import { cx } from "../lib/utils.js";

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-title-sm text-primary px-1 mb-2">{title}</h2>
      <div className="bg-surface-container-low rounded-3xl p-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

export default function ProfileScreen() {
  const lib = useLibrary();
  const { t, i18n } = useTranslation();
  const auth = useAuthContext();
  const toast = useToast();
  const { confirm } = useDialogs();
  const install = useInstallPrompt();
  const location = useLocation();
  const fileRef = useRef(null);
  const { settings, profile, user } = lib;
  const goal = normalizeGoal(settings.dailyGoal);
  const notify = settings.notify;
  const [permission, setPermission] = useState(permissionState());
  const [busy, setBusy] = useState(false);
  const support = pushSupport();

  useEffect(() => {
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView({ behavior: "smooth" });
  }, [location.hash]);

  /* ----- goal ----- */
  const setGoal = (patch) => lib.actions.updateSettings({ dailyGoal: { ...goal, ...patch } });
  const switchGoalType = (type) => setGoal({ type, value: type === "minutes" ? 15 : 3 });

  /* ----- notifications ----- */
  const saveNotify = (patch) => {
    const next = { ...notify, ...patch };
    const hours = REMINDER_SCHEDULES[next.schedule]?.hours || [20];
    lib.actions.updateSettings({
      notify: {
        enabled: !!next.enabled,
        schedule: next.schedule,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        localHours: hours,
        utcHours: next.enabled ? localHoursToUtcHours(hours) : [],
      },
    });
  };

  const requestPermission = async () => {
    if (typeof Notification === "undefined") return toast(support.message || t("toast.notificationsUnsupported"));
    const p = await Notification.requestPermission();
    setPermission(p);
    toast(p === "granted" ? t("toast.permissionGranted") : t("toast.permissionDenied"));
  };

  const toggleNotifications = async (on) => {
    if (!on) {
      saveNotify({ enabled: false });
      return toast(t("toast.remindersOff"));
    }
    setBusy(true);
    const res = await enablePush((token) => lib.actions.addPushToken(token));
    setBusy(false);
    setPermission(permissionState());
    if (!res.ok) return toast(res.message, { duration: 7000 });
    saveNotify({ enabled: true });
    toast(t("toast.remindersOn"));
  };

  const testNotification = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification("Kartoteka", { body: t("toast.testBody"), icon: "/pwa-192x192.png", badge: "/pwa-192x192.png", tag: "test" });
    } catch {
      toast(t("toast.testFailed"));
    }
  };

  /* ----- backup ----- */
  const exportData = async () => {
    const data = buildBackup({ user, profile, decks: lib.decks, library: lib.library, folders: lib.folders });
    await downloadText(JSON.stringify(data, null, 2), backupFilename(), "application/json");
    toast(t("toast.exported", { count: lib.decks.length }));
  };
  const restore = async (file) => {
    try {
      const parsed = readBackup(JSON.parse(await file.text()));
      const cards = parsed.decks.reduce((n, d) => n + d.cards.length, 0);
      if (!(await confirm({ title: "Восстановить из копии?", message: `Будут добавлены наборы: ${parsed.decks.length} (${cards} карточек) с прогрессом${parsed.folders.length ? ` и папки: ${parsed.folders.length}` : ""}. Существующие данные не меняются.`, confirmLabel: "Добавить" }))) return;
      const n = await lib.actions.restore(parsed);
      toast(`Восстановлено наборов: ${n}`);
    } catch (err) {
      toast(err instanceof SyntaxError ? "Файл не похож на JSON." : err.message, { duration: 6000 });
    }
  };

  /* ----- account ----- */
  const linkGoogle = async () => {
    const res = await auth.linkGuestToGoogle();
    if (res?.linked) toast("Готово! Входите через Google на любом устройстве.");
    else if (res?.conflict) await mergeGuestInto(auth, lib, res.conflict, toast);
  };
  const signOut = async () => {
    const ok = await confirm(
      user.isAnonymous
        ? { title: "Выйти из гостевого режима?", message: "Гостевые наборы нельзя будет восстановить. Сначала сохраните их в Google или экспортируйте.", confirmLabel: "Выйти", danger: true }
        : { title: "Выйти из аккаунта?", confirmLabel: "Выйти" }
    );
    if (ok) auth.signOut();
  };

  const streak = displayedStreak(profile, localDateKey());

  return (
    <div className="min-h-screen">
      <SEO title={`${t("profile.title")} | Kartoteka`} noindex />
      <TopBar title={t("profile.title")} />
      <main className="fc-gutter pb-8">
        <div className="mx-auto max-w-2xl flex flex-col gap-6">
          {/* Account */}
          <div className="flex items-center gap-4 px-1">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="w-16 h-16 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <span className="w-16 h-16 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center">
                <UserRound size={30} />
              </span>
            )}
            <div className="min-w-0">
              <div className="text-title-lg truncate">{user.isAnonymous ? t("profile.guest") : user.displayName || user.email}</div>
              <div className="text-body-md text-on-surface-variant truncate">{user.isAnonymous ? t("profile.guestHint") : user.email}</div>
            </div>
          </div>
          {user.isAnonymous ? (
            <button type="button" className="fc-btn fc-btn-tonal fc-btn-lg" onClick={linkGoogle}>
              <Cloud size={20} /> {t("profile.saveToGoogle")}
            </button>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-3xl bg-primary-container text-on-primary-container p-4">
              <Flame size={22} style={{ color: "var(--md-streak)", fill: "var(--md-streak)" }} />
              <div className="text-headline-md fc-tabular mt-2">{streak}</div>
              <div className="text-label-md">{t("streak.inARow", { count: streak, days: t("streak.days", { count: streak }) }).replace(/^\d+\s*/, "")}</div>
            </div>
            <div className="rounded-3xl bg-surface-container-high p-4">
              <Trophy size={22} className="text-primary" />
              <div className="text-headline-md fc-tabular mt-2">{Number(profile.longestStreak) || 0}</div>
              <div className="text-label-md text-on-surface-variant">{t("streak.recordLabel")}</div>
            </div>
          </div>

          {/* Daily goal */}
          <Section id="goal" title={t("profile.goalSection")}>
            <div className="fc-seg w-full" role="group" aria-label={t("profile.goalType")}>
              {Object.keys(GOAL_TYPES).map((type) => (
                <button key={type} type="button" className="flex-1 justify-center" aria-pressed={goal.type === type} onClick={() => goal.type !== type && switchGoalType(type)}>
                  {t(type === "minutes" ? "goal.typeMinutes" : "goal.typeRounds")}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t("profile.goalSize")}>
              {GOAL_TYPES[goal.type].options.map((v) => (
                <button key={v} type="button" className="fc-chip" aria-pressed={goal.value === v} onClick={() => setGoal({ value: v })}>
                  {goalAmount(t, goal.type, v)}
                </button>
              ))}
            </div>
            <p className="text-body-sm text-on-surface-variant">
              {t("profile.goalNow", { goal: goalText(t, goal) })}
              {goal.type === "minutes" ? t("profile.goalActiveTime") : ""}
            </p>
            <div className="border-t border-outline-variant pt-4">
              <div className="text-title-sm mb-2">{t("profile.roundSize")}</div>
              <div className="flex gap-2" role="group" aria-label={t("profile.roundSize")}>
                {ROUND_SIZES.map((n) => (
                  <button key={n} type="button" className="fc-chip" aria-pressed={(settings.roundSize || 20) === n} onClick={() => lib.actions.updateSettings({ roundSize: n })}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          {/* Notifications */}
          <Section id="notifications" title={t("profile.notifications")}>
            <div className="flex items-center gap-4">
              {notify.enabled ? <Bell size={22} className="text-primary" /> : <BellOff size={22} className="text-on-surface-variant" />}
              <div className="flex-1 min-w-0">
                <div className="text-body-lg">{t("profile.push")}</div>
                <div className="text-body-sm text-on-surface-variant">{t("profile.pushHint")}</div>
              </div>
              <Switch checked={!!notify.enabled} onChange={toggleNotifications} label={t("profile.push")} disabled={busy} />
            </div>
            <div role="radiogroup" aria-label={t("profile.schedule")} className="flex flex-col -mx-2">
              {Object.entries(REMINDER_SCHEDULES).map(([key, s]) => (
                <label key={key} className={cx("fc-list-item rounded-xl cursor-pointer", !notify.enabled && "opacity-50")}>
                  <input
                    type="radio"
                    name="schedule"
                    className="w-5 h-5"
                    style={{ accentColor: "var(--md-primary)" }}
                    checked={notify.schedule === key}
                    disabled={!notify.enabled}
                    onChange={() => saveNotify({ schedule: key })}
                  />
                  <span>
                    <span className="block text-body-lg">{t(`profile.schedules.${key}`, { defaultValue: s.label })}</span>
                    <span className="block text-body-sm text-on-surface-variant">{s.hours.map((h) => `${String(h).padStart(2, "0")}:00`).join(t("profile.and"))}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body-sm text-on-surface-variant flex-1 min-w-[12rem]">
                {t("profile.permission")}{" "}
                <b className="font-medium">{t(permission === "granted" ? "profile.permGranted" : permission === "denied" ? "profile.permDenied" : permission === "unsupported" ? "profile.permUnsupported" : "profile.permDefault")}</b>
              </span>
              {permission !== "granted" && permission !== "unsupported" ? (
                <button type="button" className="fc-btn fc-btn-outlined" onClick={requestPermission}>
                  {t("profile.requestPermission")}
                </button>
              ) : null}
              {permission === "granted" ? (
                <button type="button" className="fc-btn fc-btn-text" onClick={testNotification}>
                  {t("profile.test")}
                </button>
              ) : null}
            </div>
            {!support.ok ? <p className="text-body-sm fc-warn">{support.message}</p> : null}
          </Section>

          {/* Appearance */}
          <Section title={t("profile.appearance")}>
            <div className="fc-seg w-full" role="group" aria-label={t("profile.theme")}>
              {[
                ["system", Monitor, "profile.themeSystem"],
                ["light", Sun, "profile.themeLight"],
                ["dark", Moon, "profile.themeDark"],
              ].map(([value, Icon, label]) => (
                <button key={value} type="button" className="flex-1 justify-center" aria-pressed={settings.theme === value} onClick={() => lib.actions.updateSettings({ theme: value })}>
                  <Icon size={16} className="hidden sm:block" /> {t(label)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="text-body-lg">{t("profile.reverse")}</div>
                <div className="text-body-sm text-on-surface-variant">Reverse mode: Definition → Term</div>
              </div>
              <Switch checked={!!settings.reverse} onChange={(reverse) => lib.actions.updateSettings({ reverse })} label={t("profile.reverse")} />
            </div>
            <div className="border-t border-outline-variant pt-4">
              <div className="text-title-sm mb-2 inline-flex items-center gap-2">
                <Languages size={18} className="text-on-surface-variant" /> {t("profile.language")}
              </div>
              <div className="fc-seg w-full" role="group" aria-label={t("profile.language")}>
                {LANGUAGES.map(({ code, label }) => (
                  <button key={code} type="button" lang={code} className="flex-1 justify-center" aria-pressed={i18n.resolvedLanguage === code} onClick={() => setLanguage(code)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          {/* Data */}
          <Section title={t("profile.data")}>
            <button type="button" className="fc-list-item rounded-xl -mx-2" onClick={exportData}>
              <Download size={22} className="text-on-surface-variant" />
              <span>
                <span className="block text-body-lg">{t("profile.export")}</span>
                <span className="block text-body-sm text-on-surface-variant">{t("profile.exportHint")}</span>
              </span>
            </button>
            <button type="button" className="fc-list-item rounded-xl -mx-2" onClick={() => fileRef.current?.click()}>
              <FolderInput size={22} className="text-on-surface-variant" />
              <span>
                <span className="block text-body-lg">{t("profile.restore")}</span>
                <span className="block text-body-sm text-on-surface-variant">{t("profile.restoreHint")}</span>
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) restore(f);
              }}
            />
            {install.canInstall ? (
              <button type="button" className="fc-list-item rounded-xl -mx-2" onClick={install.promptInstall}>
                <Smartphone size={22} className="text-on-surface-variant" />
                <span className="block text-body-lg">{t("profile.install")}</span>
              </button>
            ) : null}
          </Section>

          <button type="button" className="fc-btn fc-btn-outlined fc-btn-lg" style={{ color: "var(--md-error)" }} onClick={signOut}>
            <LogOut size={20} /> {t("profile.signOut")}
          </button>
          <p className="text-body-sm text-on-surface-variant text-center">Kartoteka 3.0</p>
        </div>
      </main>
    </div>
  );
}
