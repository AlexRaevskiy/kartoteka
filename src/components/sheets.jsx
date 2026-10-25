/**
 * Bottom sheets shared by the Deck and Folder screens:
 *   ShareSheet         link + native share / copy + who can see it (owner)
 *   FolderPickerSheet  bookmark: tick the folders this deck belongs to, "+ New folder"
 *   GoalSheet          "Choose a goal for these sessions": Cram for a test / Memorize it all
 *   DownloadSheet      .txt / .csv export of a deck
 *   SetInfoSheet       metadata of a deck
 */
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, FileSpreadsheet, FileText, FolderPlus, Globe, Lock, KeyRound, Share2, Timer, Brain } from "lucide-react";
import { Sheet } from "./ui.jsx";
import { useDialogs, useToast } from "./providers.jsx";
import { useLibrary } from "../data/LibraryProvider.jsx";
import { copyText, deckToText, downloadText, safeFilename, shareLink, shareUrl } from "../lib/share.js";
import { languageLabel } from "../lib/languages.js";
import { cx } from "../lib/utils.js";

/* ---------- Share ---------- */

export function ShareSheet({ kind, item, path, canManage, onVisibility, onClose }) {
  const toast = useToast();
  const { t } = useTranslation();
  const url = shareUrl(path);
  const title = kind === "deck" ? item.title : item.name;
  const options =
    kind === "deck"
      ? [
          { value: "public", label: t("share.anyoneWithLink"), icon: Globe },
          { value: "password", label: t("visibility.password.label"), icon: KeyRound, disabled: true },
          { value: "private", label: t("visibility.private.label"), icon: Lock },
        ]
      : [
          { value: "public", label: t("share.anyoneWithLink"), icon: Globe },
          { value: "private", label: t("visibility.private.label"), icon: Lock },
        ];
  const doShare = async () => {
    const r = await shareLink({ path, title, text: kind === "deck" ? t("deck.shareText", { title }) : t("folder.shareText", { title }) });
    if (r === "copied") toast(t("common.linkCopied"));
    if (r === "failed") toast(t("share.failed"));
  };
  return (
    <Sheet title={t("common.share")} subtitle={title} onClose={onClose} labelId="share-title">
      <div className="flex items-center gap-2 bg-surface-container-high rounded-xl pl-4 pr-1 py-1">
        <span className="flex-1 min-w-0 truncate text-body-md fc-mono">{url}</span>
        <button
          type="button"
          className="fc-btn fc-icon-btn"
          aria-label={t("share.copyLink")}
          onClick={async () => toast((await copyText(url)) ? t("common.linkCopied") : t("share.copyFailed"))}
        >
          <Copy size={20} />
        </button>
      </div>
      <button type="button" className="fc-btn fc-btn-filled w-full" onClick={doShare}>
        <Share2 size={18} /> {t("share.shareEllipsis")}
      </button>

      {canManage ? (
        <div>
          <div className="text-title-sm mb-1">{t("share.whoCanOpen")}</div>
          <div role="radiogroup" className="flex flex-col">
            {options.map((o) => {
              const selected = item.visibility === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={o.disabled && !selected}
                  className="fc-list-item rounded-xl disabled:opacity-50"
                  onClick={() => !selected && onVisibility(o.value)}
                >
                  <o.icon size={20} className="text-on-surface-variant" />
                  <span className="flex-1 text-body-lg">{o.label}</span>
                  {selected ? <Check size={20} className="text-primary" /> : null}
                </button>
              );
            })}
          </div>
          {kind === "deck" ? (
            <p className="text-body-sm text-on-surface-variant mt-1">{t("share.passwordHint")}</p>
          ) : (
            <p className="text-body-sm text-on-surface-variant mt-1">{t("share.folderHint")}</p>
          )}
          {item.visibility === "private" ? <p className="text-body-sm fc-warn mt-2">{t("share.privateWarning")}</p> : null}
        </div>
      ) : null}
    </Sheet>
  );
}

/* ---------- Bookmark: add to folders ---------- */

export function FolderPickerSheet({ deck, onClose }) {
  const lib = useLibrary();
  const { prompt } = useDialogs();
  const toast = useToast();
  const { t } = useTranslation();
  const newFolder = async () => {
    const name = await prompt({ title: t("folder.new.title"), label: t("folder.new.label"), placeholder: t("folder.new.placeholder"), confirmLabel: t("folder.new.confirm") });
    if (!name) return;
    if (!deck.inLibrary) lib.actions.addToLibrary(deck);
    await lib.actions.createFolder({ name, deckIds: [deck.id] });
    toast(t("folder.created", { name }));
  };
  return (
    <Sheet title={t("deck.addToFolder")} subtitle={deck.title} onClose={onClose} labelId="folders-title">
      {lib.folders.length ? (
        <div className="flex flex-col -mx-2">
          {lib.folders.map((f) => {
            const checked = f.deckIds.includes(deck.id);
            return (
              <label key={f.id} className="fc-list-item rounded-xl cursor-pointer">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: f.color }} aria-hidden="true">
                  {f.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-body-lg truncate">{f.name}</span>
                  <span className="block text-body-sm text-on-surface-variant">{t("folder.setCount", { count: f.deckIds.length })}</span>
                </span>
                <input
                  type="checkbox"
                  className="w-5 h-5"
                  style={{ accentColor: "var(--md-primary)" }}
                  checked={checked}
                  onChange={(e) => lib.actions.setFolderMembership(f, deck.id, e.target.checked)}
                />
              </label>
            );
          })}
        </div>
      ) : (
        <p className="text-body-md text-on-surface-variant">{t("folderPicker.empty")}</p>
      )}
      <button type="button" className="fc-btn fc-btn-tonal self-start" onClick={newFolder}>
        <FolderPlus size={18} /> {t("folder.new.title")}
      </button>
    </Sheet>
  );
}

/* ---------- Choose a goal ---------- */

export const GOALS = [
  { value: "cram", icon: Timer },
  { value: "memorize", icon: Brain },
];

export function GoalSheet({ defaultGoal = "memorize", starredOnly, starredCount, onStart, onClose }) {
  const [goal, setGoal] = useState(defaultGoal);
  const { t } = useTranslation();
  return (
    <Sheet
      title={t("goalSheet.title")}
      subtitle={starredOnly ? t("goalSheet.starredOnly", { count: starredCount }) : t("goalSheet.subtitle")}
      onClose={onClose}
      labelId="goal-title"
      footer={
        <button type="button" className="fc-btn fc-btn-filled fc-btn-lg w-full" onClick={() => onStart(goal)}>
          {t("goalSheet.start")}
        </button>
      }
    >
      <div role="radiogroup" className="flex flex-col gap-3">
        {GOALS.map((g) => {
          const selected = goal === g.value;
          return (
            <button
              key={g.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={cx("text-left rounded-2xl p-4 flex gap-4 border-2 transition-colors", selected ? "border-primary bg-primary-container/40" : "border-outline-variant")}
              onClick={() => setGoal(g.value)}
            >
              <span className={cx("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", selected ? "bg-primary text-on-primary" : "bg-surface-container-highest text-on-surface-variant")}>
                <g.icon size={22} />
              </span>
              <span className="min-w-0">
                <span className="block text-title-md">{t(`goalSheet.${g.value}.title`)}</span>
                <span className="block text-body-md text-on-surface-variant mt-1">{t(`goalSheet.${g.value}.body`)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

/* ---------- Download ---------- */

export function DownloadSheet({ deck, onClose }) {
  const { t } = useTranslation();
  const save = async (format) => {
    const text = deckToText(deck, format);
    await downloadText(text, `${safeFilename(deck.title)}.${format}`, format === "csv" ? "text/csv" : "text/plain");
    onClose();
  };
  return (
    <Sheet title={t("download.title")} subtitle={t("deck.cardCount", { count: deck.cards.length })} onClose={onClose} labelId="download-title">
      <button type="button" className="fc-list-item rounded-xl -mx-2" onClick={() => save("txt")}>
        <FileText size={22} className="text-on-surface-variant" />
        <span className="flex-1">
          <span className="block text-body-lg">{t("download.txt")}</span>
          <span className="block text-body-sm text-on-surface-variant">{t("download.txtHint")}</span>
        </span>
      </button>
      <button type="button" className="fc-list-item rounded-xl -mx-2" onClick={() => save("csv")}>
        <FileSpreadsheet size={22} className="text-on-surface-variant" />
        <span className="flex-1">
          <span className="block text-body-lg">{t("download.csv")}</span>
          <span className="block text-body-sm text-on-surface-variant">{t("download.csvHint")}</span>
        </span>
      </button>
    </Sheet>
  );
}

/* ---------- Set info ---------- */

export function SetInfoSheet({ deck, onClose }) {
  const { t, i18n } = useTranslation();
  const fmt = (ts) => new Date(ts).toLocaleDateString(i18n.resolvedLanguage, { day: "numeric", month: "long", year: "numeric" });
  const rows = [
    [t("info.description"), deck.description || "—"],
    [t("deck.author"), deck.own ? t("deck.you") : deck.ownerName || "—"],
    [t("info.created"), fmt(deck.createdAt)],
    [t("info.updated"), fmt(deck.updatedAt)],
    [t("info.cards"), String(deck.cards.length)],
    [t("info.termLang"), languageLabel(deck.termLang)],
    [t("info.defLang"), languageLabel(deck.defLang)],
    [t("info.whoSees"), t(`visibility.${deck.visibility}.label`)],
    [t("info.whoEdits"), t(`editPolicy.${deck.editPolicy}.label`)],
  ];
  return (
    <Sheet title={t("info.title")} subtitle={deck.title} onClose={onClose} labelId="info-title">
      <dl className="grid gap-x-4 gap-y-3" style={{ gridTemplateColumns: "auto minmax(0,1fr)" }}>
        {rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="text-body-md text-on-surface-variant">{k}</dt>
            <dd className="text-body-md" style={{ overflowWrap: "anywhere" }}>
              {v}
            </dd>
          </React.Fragment>
        ))}
      </dl>
    </Sheet>
  );
}
