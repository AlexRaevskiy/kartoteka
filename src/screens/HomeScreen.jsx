/**
 * Home: streak widget · "continue studying" · folders (horizontal swipe) · my sets.
 */
import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Archive, ArrowRight, Cloud, CloudOff, CloudUpload, FolderPlus, Play, Plus, Search, Upload } from "lucide-react";
import { useLibrary } from "../data/LibraryProvider.jsx";
import { useDialogs, useToast } from "../components/providers.jsx";
import { useInstallPrompt } from "../hooks/useInstallPrompt.js";
import StreakWidget from "../components/StreakWidget.jsx";
import SEO from "../components/SEO.jsx";
import DeckListItem from "../components/DeckListItem.jsx";
import { InstallBanner } from "../components/PwaPrompts.jsx";
import { EmptyPanel, Spinner } from "../components/ui.jsx";
import { useNow } from "../hooks/useNow.js";
import { useTranslation } from "react-i18next";
import { deckStats } from "../lib/leitner.js";
import { MODES } from "./StudyScreen.jsx";

function SyncIcon({ sync }) {
  const { t } = useTranslation();
  const map = {
    saved: [Cloud, t("home.sync.saved"), "text-on-surface-variant"],
    saving: [CloudUpload, t("home.sync.saving"), "text-primary"],
    offline: [CloudOff, t("home.sync.offline"), "fc-warn"],
  };
  if (sync === "connecting") return <Spinner size={18} className="text-on-surface-variant" />;
  const [Icon, label, cls] = map[sync] || map.saved;
  return (
    <span className={`inline-flex ${cls}`} title={label} aria-label={label} role="img">
      <Icon size={20} />
    </span>
  );
}

function ContinueWidget({ lib, now }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const last = lib.settings.lastStudy;
  let target = null;
  if (last?.kind === "folder" && lib.foldersById[last.id]) {
    const f = lib.foldersById[last.id];
    target = { title: f.name, sub: t("home.folder"), path: `/folder/${f.id}/study?mode=${last.mode || "flashcards"}&goal=${last.goal || "memorize"}` };
  } else {
    const deck = (last?.kind === "deck" && lib.decksById[last.id]) || lib.decks.find((d) => d.lastStudiedAt);
    if (deck) {
      const s = deckStats(deck, now);
      const mode = last?.id === deck.id ? last.mode || "flashcards" : "flashcards";
      const goal = last?.id === deck.id ? last.goal || "memorize" : "memorize";
      target = {
        title: deck.title,
        sub: s.due ? t("home.cardsWaiting", { count: s.due }) : t("home.masteredPct", { pct: s.pct }),
        mode: MODES.some((m) => m.id === mode) ? t(`modes.${mode}.label`) : undefined,
        path: `/deck/${deck.id}/study?mode=${mode}&goal=${goal}`,
        pct: s.pct,
      };
    }
  }
  if (!target) return null;
  return (
    <section className="bg-surface-container-low rounded-3xl p-4 flex items-center gap-4">
      <div className="w-12 h-12 rounded-2xl bg-tertiary-container text-on-tertiary-container flex items-center justify-center shrink-0">
        <Play size={22} fill="currentColor" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-label-md text-on-surface-variant truncate">
          {t("home.continueStudying")}
          {target.mode ? ` · ${target.mode}` : ""}
        </div>
        <div className="text-title-md truncate">{target.title}</div>
        <div className="text-body-sm text-on-surface-variant">{target.sub}</div>
      </div>
      <button type="button" className="fc-btn fc-btn-filled shrink-0 px-4 sm:px-6" onClick={() => navigate(target.path)} aria-label={t("home.continueAria", { title: target.title })}>
        <span className="hidden sm:inline">{t("home.continue")}</span>
        <ArrowRight size={20} />
      </button>
    </section>
  );
}

export default function HomeScreen() {
  const lib = useLibrary();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { prompt } = useDialogs();
  const toast = useToast();
  const now = useNow();
  const install = useInstallPrompt();
  const [query, setQuery] = useState("");

  const decks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? lib.decks.filter((d) => d.title.toLowerCase().includes(q)) : lib.decks;
  }, [lib.decks, query]);

  const newFolder = async () => {
    const name = await prompt({ title: t("folder.new.title"), label: t("folder.new.label"), placeholder: t("folder.new.placeholder"), confirmLabel: t("folder.new.confirm") });
    if (!name) return;
    const id = await lib.actions.createFolder({ name });
    toast(t("folder.created", { name }));
    navigate(`/folder/${id}`);
  };

  const firstName = (lib.user.displayName || "").split(" ")[0];

  return (
    <div className="fc-gutter">
      <SEO />
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center gap-3 pt-4 pb-2" style={{ paddingTop: "calc(16px + env(safe-area-inset-top, 0px))" }}>
          <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center" aria-hidden="true">
            <Archive size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-label-md text-on-surface-variant">Kartoteka</div>
            <h1 className="text-title-lg truncate">{firstName ? t("home.helloName", { name: firstName }) : t("home.hello")}</h1>
          </div>
          <SyncIcon sync={lib.sync} />
        </header>

        <div className="flex flex-col gap-4 mt-2">
          {!lib.settings.installHintDismissed ? <InstallBanner install={install} onDismiss={() => lib.actions.updateSettings({ installHintDismissed: true })} /> : null}
          <StreakWidget profile={lib.profile} settings={lib.settings} now={now} />
          <ContinueWidget lib={lib} now={now} />
        </div>

        {/* Folders: horizontal swipe */}
        <section className="mt-7" aria-labelledby="folders-h">
          <div className="flex items-center justify-between mb-2">
            <h2 id="folders-h" className="text-title-md">
              {t("home.folders")}
            </h2>
            <button type="button" className="fc-btn fc-btn-text -mr-3" onClick={newFolder}>
              <FolderPlus size={18} /> {t("home.newFolder")}
            </button>
          </div>
          <div className="fc-hscroll gap-3 -mx-4 px-4 pb-1" style={{ scrollPaddingLeft: 16 }}>
            {lib.folders.map((f) => (
              <Link key={f.id} to={`/folder/${f.id}`} className="w-40 rounded-3xl p-4 bg-surface-container-low fc-focus flex flex-col gap-6">
                <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-title-md" style={{ background: f.color }} aria-hidden="true">
                  {f.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block text-title-md truncate">{f.name}</span>
                  <span className="block text-body-sm text-on-surface-variant fc-tabular">
                    {t("folder.setCount", { count: f.deckIds.length })}
                  </span>
                </span>
              </Link>
            ))}
            <button type="button" onClick={newFolder} className="w-40 rounded-3xl p-4 border-2 border-dashed border-outline-variant text-on-surface-variant flex flex-col items-start justify-between gap-6 fc-focus">
              <span className="w-11 h-11 rounded-2xl bg-surface-container-high flex items-center justify-center">
                <Plus size={22} />
              </span>
              <span className="text-title-sm text-left">{t("home.createFolder")}</span>
            </button>
          </div>
        </section>

        {/* Sets */}
        <section className="mt-7 pb-6" aria-labelledby="sets-h">
          <div className="flex items-center justify-between mb-2">
            <h2 id="sets-h" className="text-title-md">
              {t("home.mySets")}
            </h2>
            <Link to="/create" className="fc-btn fc-btn-text -mr-3">
              <Plus size={18} /> {t("nav.create")}
            </Link>
          </div>
          {lib.decks.length > 6 ? (
            <div className="relative mb-3">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
              <label htmlFor="home-search" className="sr-only">
                {t("folderScreen.searchSets")}
              </label>
              <input id="home-search" type="search" className="fc-input rounded-full bg-surface-container-high border-transparent" style={{ paddingLeft: "2.75rem" }} placeholder={t("folderScreen.searchSets")} value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          ) : null}
          {lib.decks.length === 0 ? (
            <EmptyPanel
              icon={Archive}
              title={t("home.emptyTitle")}
              body={t("home.emptyBody")}
              actions={
                <>
                  <Link to="/create" className="fc-btn fc-btn-filled">
                    <Plus size={18} /> {t("home.createSet")}
                  </Link>
                  <Link to="/create?import=1" className="fc-btn fc-btn-outlined">
                    <Upload size={18} /> {t("home.pasteList")}
                  </Link>
                </>
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {decks.map((d) => (
                <DeckListItem key={d.id} deck={d} now={now} />
              ))}
              {!decks.length ? <p className="text-body-md text-on-surface-variant py-4 text-center">{t("common.nothingFound")}</p> : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
