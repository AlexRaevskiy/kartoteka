/**
 * /deck/:id — Quizlet-style set page.
 *
 *   Top bar   ← back · 🔖 add to folders · ⋮ menu (edit, download, add to class, copy, share,
 *             reset progress, set info, delete)
 *   Block 1   swipeable carousel of flip cards with dots
 *   Block 2   title · author · card count · grid of study modes
 *   Block 3   progress (not studied / still learning / mastered) → "Choose a goal" sheet
 *   Block 4   terms list: sort, ⭐ starred filter, speaker per term
 *   Smart FAB "Study this set" appears once the terms list scrolls into view.
 *
 * Works for your own sets and for sets shared by link (public or unlocked with a password).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Bookmark,
  BookmarkCheck,
  ChevronRight,
  Copy,
  Download,
  Info,
  Lock,
  Pencil,
  RotateCcw,
  SearchX,
  Share2,
  Star,
  Trash2,
  Users,
  Play,
} from "lucide-react";
import { useLibrary } from "../data/LibraryProvider.jsx";
import { useDeckResource } from "../data/useRemote.js";
import * as store from "../data/store.js";
import { useDialogs, useToast } from "../components/providers.jsx";
import { Avatar, EmptyPanel, ExampleBlock, Menu, ProgressBar, SpeakButton, TopBar } from "../components/ui.jsx";
import CardCarousel from "../components/CardCarousel.jsx";
import PasswordGate from "../components/PasswordGate.jsx";
import { DownloadSheet, FolderPickerSheet, GoalSheet, SetInfoSheet, ShareSheet } from "../components/sheets.jsx";
import { progressBreakdown } from "../lib/leitner.js";
import { speak } from "../lib/speech.js";
import { speechLang } from "../lib/languages.js";
import { shareLink } from "../lib/share.js";
import { cx } from "../lib/utils.js";
import { MODES } from "./StudyScreen.jsx";
import SEO from "../components/SEO.jsx";

export default function DeckScreen() {
  const { id } = useParams();
  const res = useDeckResource(id);
  const { t } = useTranslation();

  if (res.status === "ready" && res.deck) return <DeckView deck={res.deck} />;
  return (
    <div className="min-h-screen">
      <TopBar back title="" />
      <main className="fc-gutter">
        <div className="mx-auto max-w-3xl">
          {res.status === "loading" ? (
            <div className="flex flex-col gap-4 mt-2" role="status" aria-label={t("deck.loading")}>
              <div className="fc-skeleton h-60" />
              <div className="fc-skeleton h-8 w-2/3" />
              <div className="fc-skeleton h-28" />
            </div>
          ) : res.status === "locked" ? (
            <PasswordGate deckId={id} stub={res.stub} onUnlocked={res.retry} />
          ) : res.status === "private" ? (
            <EmptyPanel icon={Lock} title={t("deck.privateTitle")} body={res.stub?.title ? t("deck.privateBodyNamed", { title: res.stub.title }) : t("deck.privateBody")} className="mt-6" />
          ) : (
            <EmptyPanel icon={SearchX} title={t("deck.notFoundTitle")} body={t("deck.notFoundBody")} className="mt-6" />
          )}
        </div>
      </main>
    </div>
  );
}

function DeckView({ deck }) {
  const lib = useLibrary();
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useTranslation();
  const { confirm } = useDialogs();
  const [sheet, setSheet] = useState(null);
  const [sortMode, setSortMode] = useState("original");
  const [starredOnly, setStarredOnly] = useState(false);
  const [canEdit, setCanEdit] = useState(deck.own);
  const [fabVisible, setFabVisible] = useState(false);
  const termsRef = useRef(null);

  // Password editors may edit someone else's set.
  useEffect(() => {
    if (deck.own) return setCanEdit(true);
    if (deck.editPolicy !== "password") return setCanEdit(false);
    let alive = true;
    store.hasGrant(deck.id, lib.uid).then((ok) => alive && setCanEdit(ok));
    return () => {
      alive = false;
    };
  }, [deck.id, deck.own, deck.editPolicy, lib.uid]);

  // Smart FAB: visible once the terms list has scrolled into the lower part of the screen.
  useEffect(() => {
    const el = termsRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([entry]) => setFabVisible(entry.isIntersecting || entry.boundingClientRect.top < 0), {
      rootMargin: "0px 0px -35% 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [deck.cards.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const starredCount = deck.cards.filter((c) => deck.starred.has(c.id)).length;
  useEffect(() => {
    if (starredOnly && starredCount === 0) setStarredOnly(false);
  }, [starredOnly, starredCount]);

  const breakdown = useMemo(() => progressBreakdown(deck.cards), [deck.cards]);
  const terms = useMemo(() => {
    const list = [...deck.cards];
    if (sortMode === "alpha") list.sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: "base" }));
    return list;
  }, [deck.cards, sortMode]);

  const inFolders = lib.folders.some((f) => f.deckIds.includes(deck.id));
  const studyPath = (mode, goal = "memorize") => `/deck/${deck.id}/study?mode=${mode}&goal=${goal}${starredOnly ? "&starred=1" : ""}`;
  const onSpeak = (text, lang) =>
    speak(text, lang).then((r) => {
      if (r.message) toast(r.message, { duration: 5000 });
    });

  const changeVisibility = async (visibility) => {
    try {
      await lib.actions.saveDeck({ ...deck, visibility });
      toast(visibility === "public" ? t("deck.nowPublic") : t("deck.nowPrivate"));
    } catch (err) {
      lib.report(err);
    }
  };

  const share = async () => {
    if (deck.own) return setSheet("share");
    const r = await shareLink({ path: `/deck/${deck.id}`, title: deck.title, text: t("deck.shareText", { title: deck.title }) });
    if (r === "copied") toast(t("common.linkCopied"));
  };

  const menu = [
    { label: t("common.edit"), icon: Pencil, onClick: () => navigate(`/deck/${deck.id}/edit`), hidden: !canEdit },
    { label: t("deck.menu.download"), icon: Download, onClick: () => setSheet("download") },
    { label: t("deck.menu.addToClass"), icon: Users, onClick: () => toast(t("deck.classesSoon")) },
    {
      label: t("deck.menu.copy"),
      icon: Copy,
      onClick: async () => {
        try {
          const id = await lib.actions.copyDeck(deck);
          toast(t("deck.copied"));
          navigate(`/deck/${id}`);
        } catch (err) {
          lib.report(err);
        }
      },
    },
    { label: t("common.share"), icon: Share2, onClick: share },
    {
      label: t("deck.menu.reset"),
      icon: RotateCcw,
      onClick: async () => {
        if (await confirm({ title: t("deck.resetConfirm.title"), message: t("deck.resetConfirm.message"), confirmLabel: t("deck.resetConfirm.confirm"), danger: true })) {
          await lib.actions.resetProgress(deck.id);
          toast(t("deck.resetDone"));
        }
      },
    },
    { label: t("deck.menu.info"), icon: Info, onClick: () => setSheet("info") },
    { divider: true },
    {
      label: deck.own ? t("deck.menu.delete") : t("deck.menu.remove"),
      icon: Trash2,
      danger: true,
      onClick: async () => {
        const ok = await confirm(
          deck.own
            ? { title: t("deck.deleteConfirm.title"), message: t("deck.deleteConfirm.message", { title: deck.title }), confirmLabel: t("common.delete"), danger: true }
            : { title: t("deck.removeConfirm.title"), message: t("deck.removeConfirm.message"), confirmLabel: t("deck.removeConfirm.confirm"), danger: true }
        );
        if (!ok) return;
        try {
          await lib.actions.deleteDeck(deck);
          toast(deck.own ? t("deck.deleted") : t("deck.removed"));
          navigate("/", { replace: true });
        } catch (err) {
          lib.report(err);
        }
      },
    },
  ];

  return (
    <div className="min-h-screen pb-28">
      <SEO
        title={`${deck.title} | Kartoteka`}
        description={deck.description || `${t("deck.seoDescription", { title: deck.title, count: deck.cards.length })} ${t("seo.description")}`}
        type="article"
      />
      <TopBar
        back
        title=""
        actions={
          <>
            <button type="button" className={cx("fc-btn fc-icon-btn", inFolders && "is-on")} aria-label={t("deck.addToFolder")} onClick={() => setSheet("folders")}>
              {inFolders ? <BookmarkCheck size={22} /> : <Bookmark size={22} />}
            </button>
            <Menu items={menu} label={t("deck.actions")} />
          </>
        }
      />

      <main className="fc-gutter">
        <div className="mx-auto max-w-3xl flex flex-col gap-6">
          {/* Block 1: carousel */}
          {deck.cards.length ? (
            <CardCarousel deck={deck} reverse={lib.settings.reverse} onSpeak={onSpeak} onFullscreen={() => navigate(studyPath("flashcards"))} />
          ) : (
            <EmptyPanel title={t("deck.emptyTitle")} body={canEdit ? t("deck.emptyBody") : undefined} actions={canEdit ? <button type="button" className="fc-btn fc-btn-filled" onClick={() => navigate(`/deck/${deck.id}/edit`)}>{t("common.edit")}</button> : null} />
          )}

          {/* Block 2: info + modes */}
          <section>
            <h1 className="text-headline-md" style={{ overflowWrap: "anywhere" }}>
              {deck.title}
            </h1>
            <div className="flex items-center gap-2 mt-2 text-body-md text-on-surface-variant flex-wrap">
              <Avatar photoURL={deck.own ? lib.user.photoURL : deck.ownerPhotoURL} name={deck.own ? lib.ownerName : deck.ownerName} size={24} />
              <span>{deck.own ? t("deck.you") : deck.ownerName || t("deck.author")}</span>
              <span aria-hidden="true">·</span>
              <span className="fc-tabular">
                {t("deck.cardCount", { count: deck.cards.length })}
              </span>
              {deck.visibility !== "private" ? (
                <span className="fc-badge fc-badge-muted">{deck.visibility === "public" ? t("deck.badgePublic") : t("deck.badgePassword")}</span>
              ) : null}
            </div>
            {deck.description ? <p className="text-body-md mt-3 text-on-surface-variant">{deck.description}</p> : null}

            <div className="grid grid-cols-2 gap-3 mt-5">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={!deck.cards.length || (m.id === "quiz" && deck.cards.length < 2)}
                  className="rounded-2xl bg-surface-container-low p-4 flex items-center gap-3 text-left fc-focus disabled:opacity-40"
                  onClick={() => navigate(studyPath(m.id))}
                >
                  <span className="w-10 h-10 rounded-xl bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0">
                    <m.icon size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-title-sm">{t(`modes.${m.id}.label`)}</span>
                    <span className="block text-body-sm text-on-surface-variant truncate">{t(`modes.${m.id}.hint`)}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* Block 3: progress */}
          {deck.cards.length ? (
            <section>
              <h2 className="text-title-md mb-2">{t("deck.progress.title")}</h2>
              <button type="button" className="w-full rounded-2xl bg-surface-container-low p-4 flex items-center gap-4 text-left fc-focus" onClick={() => setSheet("goal")} aria-label={t("deck.progress.aria")}>
                <div className="flex-1 flex flex-col gap-3">
                  {[
                    ["notStudied", breakdown.notStudied, "var(--md-outline)"],
                    ["learning", breakdown.learning, "var(--md-streak)"],
                    ["mastered", breakdown.mastered, "var(--md-success)"],
                  ].map(([key, n, color]) => (
                    <div key={key}>
                      <div className="flex justify-between text-label-lg mb-1">
                        <span>{t(`deck.progress.${key}`)}</span>
                        <span className="fc-tabular">{n}</span>
                      </div>
                      <ProgressBar value={breakdown.total ? (n / breakdown.total) * 100 : 0} color={color} label={t(`deck.progress.${key}`)} />
                    </div>
                  ))}
                </div>
                <ChevronRight size={24} className="text-on-surface-variant shrink-0" />
              </button>
            </section>
          ) : null}

          {/* Block 4: terms */}
          {deck.cards.length ? (
            <section ref={termsRef} aria-labelledby="terms-h">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <h2 id="terms-h" className="text-title-md">
                  {t("deck.terms")} <span className="text-on-surface-variant fc-tabular">({deck.cards.length})</span>
                </h2>
                <label className="sr-only" htmlFor="sort-terms">
                  {t("deck.sort")}
                </label>
                <select id="sort-terms" className="fc-input py-2 w-auto text-body-md" style={{ fontSize: 14, borderRadius: 999 }} value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
                  <option value="original">{t("deck.sortOriginal")}</option>
                  <option value="alpha">{t("deck.sortAlpha")}</option>
                </select>
              </div>

              {starredCount > 0 ? (
                <div className="fc-seg mb-3 w-full sm:w-auto" role="group" aria-label={t("deck.whatToStudy")}>
                  <button type="button" className="flex-1" aria-pressed={!starredOnly} onClick={() => setStarredOnly(false)}>
                    {t("deck.studyAll")}
                  </button>
                  <button type="button" className="flex-1" aria-pressed={starredOnly} onClick={() => setStarredOnly(true)}>
                    <Star size={16} fill="currentColor" /> {t("deck.studyStarred", { count: starredCount })}
                  </button>
                </div>
              ) : null}

              <ul className="flex flex-col gap-2">
                {terms.map((c) => {
                  const starred = deck.starred.has(c.id);
                  return (
                    <li key={c.id} className={cx("rounded-2xl bg-surface-container-low pl-4 pr-1 py-2 flex items-start gap-2", starredOnly && !starred && "opacity-40")}>
                      <div className="flex-1 min-w-0 py-1.5">
                        <div className="text-title-md" style={{ overflowWrap: "anywhere" }}>
                          {c.term}
                        </div>
                        <div className="text-body-md text-on-surface-variant mt-0.5" style={{ overflowWrap: "anywhere" }}>
                          {c.definition}
                        </div>
                        <ExampleBlock sentence={c.exampleSentence} term={c.term} deck={deck} onSpeak={onSpeak} className="mt-1.5" textClassName="text-body-sm" />
                      </div>
                      <button
                        type="button"
                        className={cx("fc-btn fc-icon-btn", starred && "is-on")}
                        aria-pressed={starred}
                        aria-label={starred ? t("deck.unstar", { term: c.term }) : t("deck.star", { term: c.term })}
                        onClick={() => lib.actions.toggleStar(deck, c.id)}
                      >
                        <Star size={20} fill={starred ? "currentColor" : "none"} style={starred ? { color: "var(--md-streak)" } : undefined} />
                      </button>
                      <SpeakButton text={c.term} lang={speechLang(deck, "term", c.term)} onSpeak={onSpeak} />
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      </main>

      {/* Smart FAB */}
      {deck.cards.length ? (
        <div className={cx("fc-fab-wrap fixed left-0 right-0 z-20 flex justify-center pointer-events-none", !fabVisible && "is-hidden")} style={{ bottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }} aria-hidden={!fabVisible}>
          <button type="button" tabIndex={fabVisible ? 0 : -1} className="fc-fab fc-fab-primary pointer-events-auto px-6" onClick={() => navigate(studyPath("flashcards"))}>
            <Play size={20} fill="currentColor" /> {starredOnly ? t("deck.studyStarred", { count: starredCount }) : t("deck.studyThisSet")}
          </button>
        </div>
      ) : null}

      {sheet === "folders" ? <FolderPickerSheet deck={deck} onClose={() => setSheet(null)} /> : null}
      {sheet === "share" ? <ShareSheet kind="deck" item={deck} path={`/deck/${deck.id}`} canManage={deck.own} onVisibility={changeVisibility} onClose={() => setSheet(null)} /> : null}
      {sheet === "download" ? <DownloadSheet deck={deck} onClose={() => setSheet(null)} /> : null}
      {sheet === "info" ? <SetInfoSheet deck={deck} onClose={() => setSheet(null)} /> : null}
      {sheet === "goal" ? (
        <GoalSheet
          starredOnly={starredOnly}
          starredCount={starredCount}
          onClose={() => setSheet(null)}
          onStart={(goal) => {
            setSheet(null);
            navigate(studyPath("learn", goal));
          }}
        />
      ) : null}
    </div>
  );
}
