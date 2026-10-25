/**
 * /folder/:id — a folder (label) and its sets.
 *
 *   Search · tag chips ("All" + your tags, "+ New tag") · sort: Recent / By title
 *   FAB "+" → add existing sets · big "Study All" → one session over every card of the
 *   (filtered) sets, progress saved per card in each original set.
 *   ⋮ menu: Add study material · Add/remove tags · Edit folder · Share · Delete
 */
import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FolderX, Lock, Pencil, Play, Plus, Search, Share2, Tag, Tags, Trash2, BookPlus, X, Check } from "lucide-react";
import { useLibrary } from "../data/LibraryProvider.jsx";
import { useDeckSet, useFolderResource } from "../data/useRemote.js";
import { useDialogs, useToast } from "../components/providers.jsx";
import { EmptyPanel, Menu, Sheet, TopBar } from "../components/ui.jsx";
import SEO from "../components/SEO.jsx";
import DeckListItem, { UnavailableDeckItem } from "../components/DeckListItem.jsx";
import { ShareSheet } from "../components/sheets.jsx";
import { useNow } from "../hooks/useNow.js";
import { FOLDER_COLORS } from "../lib/model.js";
import { cx } from "../lib/utils.js";

export default function FolderScreen() {
  const { id } = useParams();
  const res = useFolderResource(id);
  const { t } = useTranslation();
  if (res.status === "ready" && res.folder) return <FolderView folder={res.folder} />;
  return (
    <div className="min-h-screen">
      <TopBar back title="" />
      <main className="fc-gutter">
        <div className="mx-auto max-w-3xl mt-4">
          {res.status === "loading" ? (
            <div className="fc-skeleton h-40" role="status" aria-label={t("common.loading")} />
          ) : res.status === "private" ? (
            <EmptyPanel icon={Lock} title={t("folderScreen.privateTitle")} body={t("folderScreen.privateBody")} />
          ) : (
            <EmptyPanel icon={FolderX} title={t("folderScreen.notFoundTitle")} body={t("folderScreen.notFoundBody")} />
          )}
        </div>
      </main>
    </div>
  );
}

function FolderView({ folder }) {
  const lib = useLibrary();
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useTranslation();
  const { confirm, prompt } = useDialogs();
  const now = useNow();
  const own = folder.ownerId === lib.uid;

  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [sort, setSort] = useState("recent");
  const [sheet, setSheet] = useState(null);

  const { decks, unavailable, loading } = useDeckSet(folder.deckIds);
  const activeTag = folder.tags.find((tg) => tg.id === tagFilter);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = decks.filter((d) => (!activeTag || activeTag.deckIds.includes(d.id)) && (!q || d.title.toLowerCase().includes(q) || d.description.toLowerCase().includes(q)));
    list = [...list].sort((a, b) =>
      sort === "title" ? a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) : (b.lastStudiedAt || b.updatedAt) - (a.lastStudiedAt || a.updatedAt)
    );
    return list;
  }, [decks, activeTag, query, sort]);

  const totalCards = visible.reduce((n, d) => n + d.cards.length, 0);

  const newTag = async () => {
    const name = await prompt({ title: t("folderScreen.newTag.title"), message: t("folderScreen.newTag.message"), label: t("folderScreen.newTag.label"), placeholder: t("folderScreen.newTag.placeholder"), maxLength: 40, confirmLabel: t("folder.new.confirm") });
    if (!name) return;
    const tagId = lib.actions.createTag(folder, name);
    setTagFilter(tagId);
    setSheet("tags");
  };

  const menu = [
    { label: t("folderScreen.menu.addMaterials"), icon: BookPlus, onClick: () => setSheet("add"), hidden: !own },
    { label: t("folderScreen.menu.tags"), icon: Tags, onClick: () => setSheet("tags"), hidden: !own },
    { label: t("folderScreen.menu.edit"), icon: Pencil, onClick: () => setSheet("edit"), hidden: !own },
    { label: t("common.share"), icon: Share2, onClick: () => setSheet("share") },
    { divider: true, hidden: !own },
    {
      label: t("folderScreen.menu.delete"),
      icon: Trash2,
      danger: true,
      hidden: !own,
      onClick: async () => {
        if (!(await confirm({ title: t("folderScreen.deleteConfirm.title"), message: t("folderScreen.deleteConfirm.message", { name: folder.name }), confirmLabel: t("common.delete"), danger: true }))) return;
        await lib.actions.deleteFolder(folder.id);
        toast(t("folderScreen.deleted"));
        navigate("/", { replace: true });
      },
    },
  ];

  const studyAll = () =>
    navigate(`/folder/${folder.id}/study?mode=flashcards&goal=memorize${activeTag ? `&tag=${activeTag.id}` : ""}`);

  return (
    <div className="min-h-screen" style={{ paddingBottom: "calc(120px + env(safe-area-inset-bottom, 0px))" }}>
      <SEO title={`${folder.name} | Kartoteka`} description={t("folderScreen.seoDescription", { name: folder.name, sets: t("folder.setCount", { count: folder.deckIds.length }) })} />
      <TopBar back title={folder.name} actions={<Menu items={menu} label={t("folderScreen.actions")} />} />
      <main className="fc-gutter">
        <div className="mx-auto max-w-3xl flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <span className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-headline-sm shrink-0" style={{ background: folder.color }} aria-hidden="true">
              {folder.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="text-headline-sm truncate">{folder.name}</h1>
              <p className="text-body-md text-on-surface-variant">
                {t("folder.setCount", { count: folder.deckIds.length })}
                {!own ? ` · ${folder.ownerName || t("deck.author")}` : ""}
                {folder.visibility === "public" ? ` · ${t("deck.badgePublic")}` : ""}
              </p>
            </div>
          </div>

          {/* Search + filters */}
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
            <label htmlFor="folder-search" className="sr-only">
              {t("folderScreen.search")}
            </label>
            <input id="folder-search" type="search" className="fc-input rounded-full bg-surface-container-high border-transparent" style={{ paddingLeft: "2.75rem" }} placeholder={t("folderScreen.search")} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          <div className="fc-hscroll gap-2 -mx-4 px-4" role="group" aria-label={t("folderScreen.tagFilter")}>
            <button type="button" className="fc-chip" aria-pressed={tagFilter === "all"} onClick={() => setTagFilter("all")}>
              {tagFilter === "all" ? <Check size={16} /> : null} {t("folderScreen.allTags")}
            </button>
            {folder.tags.map((tg) => (
              <button key={tg.id} type="button" className="fc-chip" aria-pressed={tagFilter === tg.id} onClick={() => setTagFilter(tg.id)}>
                {tagFilter === tg.id ? <Check size={16} /> : <Tag size={14} />} {tg.name}
                <span className="opacity-70 fc-tabular">{tg.deckIds.length}</span>
              </button>
            ))}
            {own ? (
              <button type="button" className="fc-chip border-dashed" onClick={newTag}>
                <Plus size={16} /> {t("folderScreen.newTag.chip")}
              </button>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-body-md text-on-surface-variant fc-tabular">
              {t("folder.setCount", { count: visible.length })} · {t("deck.cardCount", { count: totalCards })}
            </span>
            <div className="fc-seg" role="group" aria-label={t("deck.sort")}>
              <button type="button" aria-pressed={sort === "recent"} onClick={() => setSort("recent")}>
                {t("folderScreen.sortRecent")}
              </button>
              <button type="button" aria-pressed={sort === "title"} onClick={() => setSort("title")}>
                {t("folderScreen.sortTitle")}
              </button>
            </div>
          </div>

          {folder.deckIds.length === 0 ? (
            <EmptyPanel
              icon={BookPlus}
              title={t("folderScreen.emptyTitle")}
              body={own ? t("folderScreen.emptyOwn") : t("folderScreen.emptyOther")}
              actions={
                own ? (
                  <button type="button" className="fc-btn fc-btn-filled" onClick={() => setSheet("add")}>
                    <Plus size={18} /> {t("folderScreen.addSets")}
                  </button>
                ) : null
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {visible.map((d) => (
                <DeckListItem key={d.id} deck={d} now={now} />
              ))}
              {loading ? <div className="fc-skeleton h-20" /> : null}
              {tagFilter === "all" && !query ? unavailable.map((id) => <UnavailableDeckItem key={id} />) : null}
              {!visible.length && !loading ? <p className="text-body-md text-on-surface-variant text-center py-6">{t("common.nothingFound")}</p> : null}
            </div>
          )}
        </div>
      </main>

      {/* FAB "+" and the big Study All button */}
      <div className="fixed left-0 right-0 bottom-0 z-20 fc-gutter pointer-events-none" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}>
        <div className="mx-auto max-w-3xl flex flex-col items-end gap-3">
          {own ? (
            <button type="button" className="fc-fab pointer-events-auto" aria-label={t("folderScreen.addSetsAria")} onClick={() => setSheet("add")}>
              <Plus size={24} />
            </button>
          ) : null}
          <button type="button" className="fc-btn fc-btn-filled fc-btn-lg w-full pointer-events-auto shadow-lg" disabled={!totalCards} onClick={studyAll}>
            <Play size={20} fill="currentColor" /> {t("folderScreen.studyAll")}
            {activeTag ? ` · ${activeTag.name}` : ""}
            <span className="opacity-80 font-normal fc-tabular">({totalCards})</span>
          </button>
        </div>
      </div>

      {sheet === "add" ? <AddDecksSheet folder={folder} onClose={() => setSheet(null)} /> : null}
      {sheet === "tags" ? <TagsSheet folder={folder} decks={decks} initialTag={activeTag?.id} onNewTag={newTag} onClose={() => setSheet(null)} /> : null}
      {sheet === "edit" ? <EditFolderSheet folder={folder} onClose={() => setSheet(null)} /> : null}
      {sheet === "share" ? (
        <ShareSheet
          kind="folder"
          item={folder}
          path={`/folder/${folder.id}`}
          canManage={own}
          onVisibility={(visibility) => {
            lib.actions.updateFolder(folder.id, { visibility });
            toast(visibility === "public" ? t("folderScreen.nowPublic") : t("folderScreen.nowPrivate"));
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>
  );
}

/* ---------- FAB: add existing sets ---------- */
function AddDecksSheet({ folder, onClose }) {
  const lib = useLibrary();
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const list = lib.decks.filter((d) => d.title.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Sheet title={t("deck.addToFolder")} subtitle={folder.name} onClose={onClose} labelId="add-title" footer={<button type="button" className="fc-btn fc-btn-filled" onClick={onClose}>{t("common.done")}</button>}>
      <input type="search" className="fc-input" placeholder={t("folderScreen.searchSets")} aria-label={t("folderScreen.searchSets")} value={q} onChange={(e) => setQ(e.target.value)} />
      {lib.decks.length === 0 ? <p className="text-body-md text-on-surface-variant">{t("folderScreen.noSets")}</p> : null}
      <div className="flex flex-col -mx-2">
        {list.map((d) => (
          <label key={d.id} className="fc-list-item rounded-xl cursor-pointer">
            <span className="flex-1 min-w-0">
              <span className="block text-body-lg truncate">{d.title}</span>
              <span className="block text-body-sm text-on-surface-variant">
                {t("deck.cardCount", { count: d.cards.length })}
                {!d.own ? ` · ${d.ownerName}` : ""}
              </span>
            </span>
            <input
              type="checkbox"
              className="w-5 h-5"
              style={{ accentColor: "var(--md-primary)" }}
              checked={folder.deckIds.includes(d.id)}
              onChange={(e) => lib.actions.setFolderMembership(folder, d.id, e.target.checked)}
            />
          </label>
        ))}
      </div>
    </Sheet>
  );
}

/* ---------- Tags inside the folder ---------- */
function TagsSheet({ folder, decks, initialTag, onNewTag, onClose }) {
  const lib = useLibrary();
  const { t } = useTranslation();
  const { confirm } = useDialogs();
  const [tagId, setTagId] = useState(initialTag || folder.tags[0]?.id || null);
  const tag = folder.tags.find((tg) => tg.id === tagId);
  return (
    <Sheet title={t("folderScreen.tagsTitle")} subtitle={t("folderScreen.tagsSubtitle")} onClose={onClose} labelId="tags-title" footer={<button type="button" className="fc-btn fc-btn-filled" onClick={onClose}>{t("common.done")}</button>}>
      <div className="flex flex-wrap gap-2">
        {folder.tags.map((tg) => (
          <button key={tg.id} type="button" className="fc-chip" aria-pressed={tg.id === tagId} onClick={() => setTagId(tg.id)}>
            <Tag size={14} /> {tg.name}
          </button>
        ))}
        <button type="button" className="fc-chip border-dashed" onClick={onNewTag}>
          <Plus size={16} /> {t("folderScreen.newTag.chip")}
        </button>
      </div>
      {tag ? (
        <>
          <div className="flex flex-col -mx-2">
            {decks.map((d) => (
              <label key={d.id} className="fc-list-item rounded-xl cursor-pointer">
                <span className="flex-1 min-w-0 text-body-lg truncate">{d.title}</span>
                <input
                  type="checkbox"
                  className="w-5 h-5"
                  style={{ accentColor: "var(--md-primary)" }}
                  checked={tag.deckIds.includes(d.id)}
                  onChange={(e) => lib.actions.setTagMembership(folder, tag.id, d.id, e.target.checked)}
                />
              </label>
            ))}
            {!decks.length ? <p className="text-body-md text-on-surface-variant px-2">{t("folderScreen.addSetsFirst")}</p> : null}
          </div>
          <button
            type="button"
            className="fc-btn fc-btn-text self-start"
            style={{ color: "var(--md-error)" }}
            onClick={async () => {
              if (await confirm({ title: t("folderScreen.deleteTagConfirm.title", { name: tag.name }), message: t("folderScreen.deleteTagConfirm.message"), confirmLabel: t("common.delete"), danger: true })) {
                lib.actions.deleteTag(folder, tag.id);
                setTagId(folder.tags.find((tg) => tg.id !== tag.id)?.id || null);
              }
            }}
          >
            <X size={18} /> {t("folderScreen.deleteTag")}
          </button>
        </>
      ) : (
        <p className="text-body-md text-on-surface-variant">{t("folderScreen.noTags")}</p>
      )}
    </Sheet>
  );
}

/* ---------- Edit folder: name, colour, tag names ---------- */
function EditFolderSheet({ folder, onClose }) {
  const lib = useLibrary();
  const { t } = useTranslation();
  const [name, setName] = useState(folder.name);
  const [color, setColor] = useState(folder.color);
  const [tags, setTags] = useState(folder.tags);
  const save = (e) => {
    e.preventDefault();
    lib.actions.updateFolder(folder.id, { name: name.trim().slice(0, 80) || folder.name, color, tags: tags.filter((tg) => tg.name.trim()) });
    onClose();
  };
  return (
    <Sheet
      as="form"
      onSubmit={save}
      title={t("folderScreen.menu.edit")}
      onClose={onClose}
      labelId="edit-folder-title"
      footer={
        <>
          <button type="button" className="fc-btn fc-btn-text" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="fc-btn fc-btn-filled">
            {t("common.save")}
          </button>
        </>
      }
    >
      <div>
        <label htmlFor="folder-name" className="fc-label">
          {t("folder.new.label")}
        </label>
        <input id="folder-name" className="fc-input mt-1" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <div className="fc-label mb-2">{t("folderScreen.color")}</div>
        <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label={t("folderScreen.colorAria")}>
          {FOLDER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={c}
              className={cx("w-10 h-10 rounded-full flex items-center justify-center text-white", color === c && "ring-2 ring-offset-2 ring-primary ring-offset-surface")}
              style={{ background: c }}
              onClick={() => setColor(c)}
            >
              {color === c ? <Check size={18} /> : null}
            </button>
          ))}
        </div>
      </div>
      {tags.length ? (
        <div>
          <div className="fc-label mb-2">{t("folderScreen.tags")}</div>
          <div className="flex flex-col gap-2">
            {tags.map((tg, i) => (
              <div key={tg.id} className="flex items-center gap-2">
                <input
                  className="fc-input"
                  aria-label={t("folderScreen.tagN", { n: i + 1 })}
                  maxLength={40}
                  value={tg.name}
                  onChange={(e) => setTags(tags.map((x) => (x.id === tg.id ? { ...x, name: e.target.value } : x)))}
                />
                <button type="button" className="fc-btn fc-icon-btn" aria-label={t("folderScreen.deleteTagNamed", { name: tg.name })} onClick={() => setTags(tags.filter((x) => x.id !== tg.id))}>
                  <Trash2 size={20} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
