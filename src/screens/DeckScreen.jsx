/**
 * /deck/:id — Quizlet-style set page.
 *
 *   Top bar   ← back · 🔖 add to folders · ⋮ menu (edit, download, add to class, copy, share,
 *             reset progress, set info, delete)
 *   Block 1   swipeable carousel of flip cards with dots
 *   Block 2   title · author · card count · grid of study modes
 *   Block 3   Your progress (not studied / still learning / mastered) → "Choose a goal" sheet
 *   Block 4   terms list: sort, ⭐ starred filter, speaker per term
 *   Smart FAB "Study this set" appears once the terms list scrolls into view.
 *
 * Works for your own sets and for sets shared by link (public or unlocked with a password).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { EmptyPanel, Menu, ProgressBar, SpeakButton, TopBar } from "../components/ui.jsx";
import CardCarousel from "../components/CardCarousel.jsx";
import PasswordGate from "../components/PasswordGate.jsx";
import { DownloadSheet, FolderPickerSheet, GoalSheet, SetInfoSheet, ShareSheet } from "../components/sheets.jsx";
import { progressBreakdown, plural } from "../lib/leitner.js";
import { speak } from "../lib/speech.js";
import { speechLang } from "../lib/languages.js";
import { shareLink } from "../lib/share.js";
import { cx } from "../lib/utils.js";
import { MODES } from "./StudyScreen.jsx";

export default function DeckScreen() {
  const { id } = useParams();
  const res = useDeckResource(id);

  if (res.status === "ready" && res.deck) return <DeckView deck={res.deck} />;
  return (
    <div className="min-h-screen">
      <TopBar back title="" />
      <main className="fc-gutter">
        <div className="mx-auto max-w-3xl">
          {res.status === "loading" ? (
            <div className="flex flex-col gap-4 mt-2" role="status" aria-label="Загрузка набора">
              <div className="fc-skeleton h-60" />
              <div className="fc-skeleton h-8 w-2/3" />
              <div className="fc-skeleton h-28" />
            </div>
          ) : res.status === "locked" ? (
            <PasswordGate deckId={id} stub={res.stub} onUnlocked={res.retry} />
          ) : res.status === "private" ? (
            <EmptyPanel icon={Lock} title="Набор закрыт" body={`${res.stub?.title ? `«${res.stub.title}» ` : ""}виден только автору. Попросите открыть доступ по ссылке.`} className="mt-6" />
          ) : (
            <EmptyPanel icon={SearchX} title="Набор не найден" body="Возможно, его удалили или ссылка неполная." className="mt-6" />
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
  const onSpeak = (text, lang) => {
    const r = speak(text, lang);
    if (r.message) toast(r.message, { duration: 5000 });
  };

  const changeVisibility = async (visibility) => {
    try {
      await lib.actions.saveDeck({ ...deck, visibility });
      toast(visibility === "public" ? "Теперь набор открыт по ссылке" : "Теперь набор видите только вы");
    } catch (err) {
      lib.report(err);
    }
  };

  const share = async () => {
    if (deck.own) return setSheet("share");
    const r = await shareLink({ path: `/deck/${deck.id}`, title: deck.title, text: `Набор карточек «${deck.title}»` });
    if (r === "copied") toast("Ссылка скопирована");
  };

  const menu = [
    { label: "Редактировать", icon: Pencil, onClick: () => navigate(`/deck/${deck.id}/edit`), hidden: !canEdit },
    { label: "Скачать", icon: Download, onClick: () => setSheet("download") },
    { label: "Добавить в класс", icon: Users, onClick: () => toast("Классы и группы скоро появятся 🙂") },
    {
      label: "Сделать копию",
      icon: Copy,
      onClick: async () => {
        try {
          const id = await lib.actions.copyDeck(deck);
          toast("Копия создана — прогресс в ней с нуля");
          navigate(`/deck/${id}`);
        } catch (err) {
          lib.report(err);
        }
      },
    },
    { label: "Поделиться", icon: Share2, onClick: share },
    {
      label: "Сбросить прогресс",
      icon: RotateCcw,
      onClick: async () => {
        if (await confirm({ title: "Сбросить прогресс?", message: "Все карточки вернутся в статус «Не изучено». Это нельзя отменить.", confirmLabel: "Сбросить", danger: true })) {
          await lib.actions.resetProgress(deck.id);
          toast("Прогресс сброшен");
        }
      },
    },
    { label: "Информация", icon: Info, onClick: () => setSheet("info") },
    { divider: true },
    {
      label: deck.own ? "Удалить набор" : "Убрать из библиотеки",
      icon: Trash2,
      danger: true,
      onClick: async () => {
        const ok = await confirm(
          deck.own
            ? { title: "Удалить набор?", message: `«${deck.title}» исчезнет у вас и у всех, с кем вы им поделились.`, confirmLabel: "Удалить", danger: true }
            : { title: "Убрать из библиотеки?", message: "Набор останется у автора, ваш прогресс будет удалён.", confirmLabel: "Убрать", danger: true }
        );
        if (!ok) return;
        try {
          await lib.actions.deleteDeck(deck);
          toast(deck.own ? "Набор удалён" : "Набор убран из библиотеки");
          navigate("/", { replace: true });
        } catch (err) {
          lib.report(err);
        }
      },
    },
  ];

  return (
    <div className="min-h-screen pb-28">
      <TopBar
        back
        title=""
        actions={
          <>
            <button type="button" className={cx("fc-btn fc-icon-btn", inFolders && "is-on")} aria-label="Добавить в папку" onClick={() => setSheet("folders")}>
              {inFolders ? <BookmarkCheck size={22} /> : <Bookmark size={22} />}
            </button>
            <Menu items={menu} label="Действия с набором" />
          </>
        }
      />

      <main className="fc-gutter">
        <div className="mx-auto max-w-3xl flex flex-col gap-6">
          {/* Block 1: carousel */}
          {deck.cards.length ? (
            <CardCarousel deck={deck} reverse={lib.settings.reverse} onSpeak={onSpeak} onFullscreen={() => navigate(studyPath("flashcards"))} />
          ) : (
            <EmptyPanel title="В наборе нет карточек" body={canEdit ? "Добавьте их в редакторе." : undefined} actions={canEdit ? <button type="button" className="fc-btn fc-btn-filled" onClick={() => navigate(`/deck/${deck.id}/edit`)}>Редактировать</button> : null} />
          )}

          {/* Block 2: info + modes */}
          <section>
            <h1 className="text-headline-md" style={{ overflowWrap: "anywhere" }}>
              {deck.title}
            </h1>
            <div className="flex items-center gap-2 mt-2 text-body-md text-on-surface-variant flex-wrap">
              <span className="w-6 h-6 rounded-full bg-tertiary-container text-on-tertiary-container inline-flex items-center justify-center text-label-md" aria-hidden="true">
                {(deck.own ? lib.ownerName : deck.ownerName || "?").slice(0, 1).toUpperCase()}
              </span>
              <span>{deck.own ? "Вы" : deck.ownerName || "Автор"}</span>
              <span aria-hidden="true">·</span>
              <span className="fc-tabular">
                {deck.cards.length} {plural(deck.cards.length, ["карточка", "карточки", "карточек"])}
              </span>
              {deck.visibility !== "private" ? (
                <span className="fc-badge fc-badge-muted">{deck.visibility === "public" ? "по ссылке" : "по паролю"}</span>
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
                    <span className="block text-title-sm">{m.label}</span>
                    <span className="block text-body-sm text-on-surface-variant truncate">{m.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* Block 3: progress */}
          {deck.cards.length ? (
            <section>
              <h2 className="text-title-md mb-2">Your progress</h2>
              <button type="button" className="w-full rounded-2xl bg-surface-container-low p-4 flex items-center gap-4 text-left fc-focus" onClick={() => setSheet("goal")} aria-label="Ваш прогресс. Выбрать цель и начать">
                <div className="flex-1 flex flex-col gap-3">
                  {[
                    ["Not studied", "Не изучено", breakdown.notStudied, "var(--md-outline)"],
                    ["Still learning", "Ещё учу", breakdown.learning, "var(--md-streak)"],
                    ["Mastered", "Выучено", breakdown.mastered, "var(--md-success)"],
                  ].map(([en, ru, n, color]) => (
                    <div key={en}>
                      <div className="flex justify-between text-label-lg mb-1">
                        <span>
                          {en} <span className="text-on-surface-variant font-normal">· {ru}</span>
                        </span>
                        <span className="fc-tabular">{n}</span>
                      </div>
                      <ProgressBar value={breakdown.total ? (n / breakdown.total) * 100 : 0} color={color} label={ru} />
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
                  Термины <span className="text-on-surface-variant fc-tabular">({deck.cards.length})</span>
                </h2>
                <label className="sr-only" htmlFor="sort-terms">
                  Сортировка
                </label>
                <select id="sort-terms" className="fc-input py-2 w-auto text-body-md" style={{ fontSize: 14, borderRadius: 999 }} value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
                  <option value="original">Исходный порядок</option>
                  <option value="alpha">По алфавиту</option>
                </select>
              </div>

              {starredCount > 0 ? (
                <div className="fc-seg mb-3 w-full sm:w-auto" role="group" aria-label="Что учить">
                  <button type="button" className="flex-1" aria-pressed={!starredOnly} onClick={() => setStarredOnly(false)}>
                    Учить все
                  </button>
                  <button type="button" className="flex-1" aria-pressed={starredOnly} onClick={() => setStarredOnly(true)}>
                    <Star size={16} fill="currentColor" /> Учить отмеченные ({starredCount})
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
                        {c.exampleSentence ? <div className="fc-example text-body-sm mt-1">{c.exampleSentence}</div> : null}
                      </div>
                      <button
                        type="button"
                        className={cx("fc-btn fc-icon-btn", starred && "is-on")}
                        aria-pressed={starred}
                        aria-label={starred ? `Убрать «${c.term}» из избранного` : `Отметить «${c.term}» звёздочкой`}
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
            <Play size={20} fill="currentColor" /> {starredOnly ? `Учить отмеченные (${starredCount})` : "Study this set"}
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
