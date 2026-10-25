/**
 * /create and /deck/:id/edit — "Create flashcard set" editor (full screen).
 *
 *   Title · Description · cards (Term / Definition / optional example) · bulk import
 *   ⚙ Settings: term & definition language (for speech), Visible to (everyone / password / just me),
 *              Editable by (password / just me), password field when needed.
 *
 * Owners save everything; users who unlocked an editable set with its password can change
 * the content only (the Firestore rules enforce this too).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeftRight, Check, FileText, Plus, Quote, Settings, Trash2, X, Lock, SearchX } from "lucide-react";
import { useLibrary } from "../data/LibraryProvider.jsx";
import { useDeckResource } from "../data/useRemote.js";
import * as store from "../data/store.js";
import { useDialogs, useToast } from "../components/providers.jsx";
import { EmptyPanel, Sheet, Spinner } from "../components/ui.jsx";
import SEO from "../components/SEO.jsx";
import { EDIT_OPTIONS, MAX_CARDS_PER_DECK, VISIBILITY_OPTIONS, newCard } from "../lib/model.js";
import { LANGUAGES, languageLabel } from "../lib/languages.js";
import { parseImport } from "../lib/parser.js";
import { hashPassword } from "../lib/share.js";
import { cx } from "../lib/utils.js";

const blankDraft = () => ({
  id: "",
  title: "",
  description: "",
  termLang: "auto",
  defLang: "auto",
  visibility: "private",
  editPolicy: "owner",
  cards: [newCard(), newCard(), newCard()],
});

export default function EditorScreen() {
  const { id } = useParams();
  if (!id) return <Editor initial={null} />;
  return <EditExisting id={id} />;
}

function EditExisting({ id }) {
  const lib = useLibrary();
  const res = useDeckResource(id);
  const { t } = useTranslation();
  const [allowed, setAllowed] = useState(null);
  useEffect(() => {
    if (res.status !== "ready" || !res.deck) return;
    if (res.deck.own) setAllowed("owner");
    else if (res.deck.editPolicy === "password") store.hasGrant(id, lib.uid).then((ok) => setAllowed(ok ? "editor" : "none"));
    else setAllowed("none");
  }, [res.status, res.deck, id, lib.uid]);

  if (res.status === "loading" || (res.status === "ready" && !allowed)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }
  if (res.status !== "ready" || allowed === "none") {
    return (
      <div className="fc-gutter pt-16">
        <EmptyPanel icon={res.status === "ready" ? Lock : SearchX} title={res.status === "ready" ? t("editor.noAccess") : t("deck.notFoundTitle")} className="max-w-md mx-auto" />
      </div>
    );
  }
  return <Editor initial={res.deck} asEditor={allowed === "editor"} />;
}

function Editor({ initial, asEditor = false }) {
  const lib = useLibrary();
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useTranslation();
  const { confirm } = useDialogs();
  const [params] = useSearchParams();

  const [draft, setDraft] = useState(() =>
    initial
      ? {
          ...initial,
          cards: initial.cards.length ? initial.cards.map(({ id, term, definition, exampleSentence }) => ({ id, term, definition, exampleSentence })) : [newCard()],
        }
      : blankDraft()
  );
  const [password, setPassword] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [sheet, setSheet] = useState(params.get("import") ? "import" : null);
  const [showExamples, setShowExamples] = useState(() => new Set(draft.cards.filter((c) => c.exampleSentence).map((c) => c.id)));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const dirty = useRef(false);
  const lastCardRef = useRef(null);

  useEffect(() => {
    if (initial?.own) store.secretExists(initial.id).then(setHasPassword);
  }, [initial]);

  const set = (patch) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, ...patch }));
  };
  const setCard = (id, patch) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, cards: d.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  };
  const addCard = () => {
    if (draft.cards.length >= MAX_CARDS_PER_DECK) return toast(t("editor.maxCards", { max: MAX_CARDS_PER_DECK }));
    set({ cards: [...draft.cards, newCard()] });
    requestAnimationFrame(() => lastCardRef.current?.focus());
  };
  const removeCard = (id) => set({ cards: draft.cards.length > 1 ? draft.cards.filter((c) => c.id !== id) : [newCard()] });

  const needsPassword = draft.visibility === "password" || draft.editPolicy === "password";
  const filled = draft.cards.filter((c) => c.term.trim() && c.definition.trim());

  const close = async () => {
    if (dirty.current && !(await confirm({ title: t("editor.leaveConfirm.title"), message: t("editor.leaveConfirm.message"), confirmLabel: t("editor.leaveConfirm.confirm"), danger: true }))) return;
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(initial ? `/deck/${initial.id}` : "/", { replace: true });
  };

  const save = async () => {
    const e = {};
    if (!draft.title.trim()) e.title = t("editor.errors.title");
    if (!filled.length) e.cards = t("editor.errors.noCards");
    const half = draft.cards.find((c) => !!c.term.trim() !== !!c.definition.trim());
    if (half) e.cards = t("editor.errors.halfCards");
    if (!asEditor && needsPassword && !hasPassword && password.length < 4) e.password = t("editor.errors.setPassword");
    if (password && password.length < 4) e.password = t("editor.errors.passwordShort");
    setErrors(e);
    if (Object.keys(e).length) {
      if (e.password) setSheet("settings");
      return;
    }
    setSaving(true);
    try {
      const id = draft.id || store.newId("decks");
      const passwordHash = !asEditor && needsPassword && password ? await hashPassword(id, password) : undefined;
      await lib.actions.saveDeck({ ...draft, id, cards: filled }, { passwordHash, asEditor });
      dirty.current = false;
      toast(initial ? t("editor.saved") : t("editor.created"));
      navigate(`/deck/${id}`, { replace: true });
    } catch (err) {
      lib.report(err);
    } finally {
      setSaving(false);
    }
  };

  const addImported = (cards) => {
    const room = MAX_CARDS_PER_DECK - filled.length;
    const toAdd = cards.slice(0, room).map((c) => newCard(c));
    const keep = draft.cards.filter((c) => c.term.trim() || c.definition.trim());
    set({ cards: [...keep, ...toAdd] });
    setShowExamples((s) => new Set([...s, ...toAdd.filter((c) => c.exampleSentence).map((c) => c.id)]));
    toast(t("editor.imported", { count: toAdd.length }));
    setSheet(null);
  };

  return (
    <div className="min-h-screen pb-28">
      <SEO title={`${t("editor.seoTitle")} | Kartoteka`} noindex />
      <header className="fc-topbar sticky top-0 z-30 is-scrolled">
        <div className="fc-gutter">
          <div className="mx-auto max-w-3xl flex items-center gap-1 h-16">
            <button type="button" className="fc-btn fc-icon-btn -ml-3 text-on-surface" aria-label={t("common.close")} onClick={close}>
              <X size={24} />
            </button>
            <h1 className="flex-1 text-title-md sm:text-title-lg truncate">{initial ? t("editor.editTitle") : t("editor.newTitle")}</h1>
            <button type="button" className="fc-btn fc-icon-btn" aria-label={t("editor.settings")} onClick={() => setSheet("settings")}>
              <Settings size={22} />
            </button>
            <button type="button" className="fc-btn fc-btn-filled ml-1" onClick={save} disabled={saving}>
              {saving ? <Spinner size={16} /> : <Check size={18} />} {t("common.done")}
            </button>
          </div>
        </div>
      </header>

      <main className="fc-gutter">
        <div className="mx-auto max-w-3xl flex flex-col gap-5 pt-2">
          <div>
            <input
              id="deck-title"
              className="fc-input fc-input-underline text-headline-sm"
              style={{ fontSize: "1.5rem" }}
              placeholder={t("editor.titlePlaceholder")}
              value={draft.title}
              maxLength={200}
              onChange={(e) => set({ title: e.target.value })}
              aria-invalid={!!errors.title}
              autoFocus={!initial}
            />
            <label htmlFor="deck-title" className={cx("fc-label block mt-1", errors.title && "fc-bad")}>
              {errors.title || t("editor.titleLabel")}
            </label>
          </div>
          <div>
            <input id="deck-desc" className="fc-input fc-input-underline" placeholder={t("editor.descriptionPlaceholder")} value={draft.description} maxLength={500} onChange={(e) => set({ description: e.target.value })} />
            <label htmlFor="deck-desc" className="fc-label block mt-1">
              {t("editor.descriptionLabel")}
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="fc-btn fc-btn-tonal" onClick={() => setSheet("import")}>
              <FileText size={18} /> {t("editor.import")}
            </button>
            <button
              type="button"
              className="fc-btn fc-btn-outlined"
              onClick={() => set({ cards: draft.cards.map((c) => ({ ...c, term: c.definition, definition: c.term })), termLang: draft.defLang, defLang: draft.termLang })}
            >
              <ArrowLeftRight size={18} /> {t("editor.swapSides")}
            </button>
          </div>

          {errors.cards ? (
            <p className="fc-bad text-body-md" role="alert">
              {errors.cards}
            </p>
          ) : null}

          <ol className="flex flex-col gap-3">
            {draft.cards.map((c, i) => {
              const exampleOpen = showExamples.has(c.id) || !!c.exampleSentence;
              return (
                <li key={c.id} className="fc-panel p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-label-lg text-on-surface-variant fc-tabular">{i + 1}</span>
                    <div className="flex items-center -mr-3">
                      {!exampleOpen ? (
                        <button type="button" className="fc-btn fc-btn-text" onClick={() => setShowExamples((s) => new Set([...s, c.id]))}>
                          <Quote size={16} /> {t("editor.example")}
                        </button>
                      ) : null}
                      <button type="button" className="fc-btn fc-icon-btn" aria-label={t("editor.deleteCard", { n: i + 1 })} onClick={() => removeCard(c.id)}>
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <input
                        ref={i === draft.cards.length - 1 ? lastCardRef : undefined}
                        id={`term-${c.id}`}
                        className="fc-input fc-input-underline"
                        value={c.term}
                        lang={draft.termLang !== "auto" ? draft.termLang : undefined}
                        onChange={(e) => setCard(c.id, { term: e.target.value })}
                      />
                      <label htmlFor={`term-${c.id}`} className="fc-label block mt-1">
                        {t("editor.termLabel")}
                        {draft.termLang !== "auto" ? ` · ${languageLabel(draft.termLang)}` : ""}
                      </label>
                    </div>
                    <div>
                      <input
                        id={`def-${c.id}`}
                        className="fc-input fc-input-underline"
                        value={c.definition}
                        lang={draft.defLang !== "auto" ? draft.defLang : undefined}
                        onChange={(e) => setCard(c.id, { definition: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Tab" && !e.shiftKey && i === draft.cards.length - 1 && !exampleOpen) {
                            e.preventDefault();
                            addCard();
                          }
                        }}
                      />
                      <label htmlFor={`def-${c.id}`} className="fc-label block mt-1">
                        {t("editor.definitionLabel")}
                        {draft.defLang !== "auto" ? ` · ${languageLabel(draft.defLang)}` : ""}
                      </label>
                    </div>
                  </div>
                  {exampleOpen ? (
                    <div className="mt-4">
                      <input id={`ex-${c.id}`} className="fc-input fc-input-underline" value={c.exampleSentence} onChange={(e) => setCard(c.id, { exampleSentence: e.target.value })} />
                      <label htmlFor={`ex-${c.id}`} className="fc-label block mt-1">
                        {t("editor.exampleLabel")}
                      </label>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>

          <button type="button" className="fc-btn fc-btn-outlined fc-btn-lg w-full border-dashed" onClick={addCard}>
            <Plus size={20} /> {t("editor.addCard")}
          </button>
          <p className="text-body-sm text-on-surface-variant text-center fc-tabular">
            {t("editor.filled", { count: filled.length, max: MAX_CARDS_PER_DECK })}
          </p>
        </div>
      </main>

      {sheet === "settings" ? (
        <SettingsSheet draft={draft} set={set} asEditor={asEditor} password={password} setPassword={setPassword} hasPassword={hasPassword} passwordError={errors.password} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === "import" ? <ImportSheet onAdd={addImported} onClose={() => setSheet(null)} /> : null}
    </div>
  );
}

/* ---------- ⚙ Settings ---------- */
function SettingsSheet({ draft, set, asEditor, password, setPassword, hasPassword, passwordError, onClose }) {
  const needsPassword = draft.visibility === "password" || draft.editPolicy === "password";
  const { t } = useTranslation();
  return (
    <Sheet title={t("editor.settings")} onClose={onClose} labelId="settings-title" footer={<button type="button" className="fc-btn fc-btn-filled" onClick={onClose}>{t("common.done")}</button>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="term-lang" className="fc-label">
            {t("info.termLang")}
          </label>
          <select id="term-lang" className="fc-input mt-1" value={draft.termLang} onChange={(e) => set({ termLang: e.target.value })}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {languageLabel(l.code)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="def-lang" className="fc-label">
            {t("info.defLang")}
          </label>
          <select id="def-lang" className="fc-input mt-1" value={draft.defLang} onChange={(e) => set({ defLang: e.target.value })}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {languageLabel(l.code)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-body-sm text-on-surface-variant -mt-2">{t("editor.langHint")}</p>

      {asEditor ? (
        <p className="text-body-md text-on-surface-variant">{t("editor.onlyAuthorAccess")}</p>
      ) : (
        <>
          <fieldset>
            <legend className="text-title-sm mb-1">{t("editor.whoCanView")}</legend>
            {VISIBILITY_OPTIONS.map((o) => (
              <label key={o.value} className="fc-list-item rounded-xl -mx-2 cursor-pointer">
                <input type="radio" name="visibility" className="w-5 h-5" style={{ accentColor: "var(--md-primary)" }} checked={draft.visibility === o.value} onChange={() => set({ visibility: o.value })} />
                <span>
                  <span className="block text-body-lg">{t(`visibility.${o.value}.label`)}</span>
                  <span className="block text-body-sm text-on-surface-variant">{t(`visibility.${o.value}.hint`)}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend className="text-title-sm mb-1">{t("editor.whoCanEdit")}</legend>
            {EDIT_OPTIONS.map((o) => (
              <label key={o.value} className="fc-list-item rounded-xl -mx-2 cursor-pointer">
                <input type="radio" name="edit" className="w-5 h-5" style={{ accentColor: "var(--md-primary)" }} checked={draft.editPolicy === o.value} onChange={() => set({ editPolicy: o.value })} />
                <span>
                  <span className="block text-body-lg">{t(`editPolicy.${o.value}.label`)}</span>
                  <span className="block text-body-sm text-on-surface-variant">{t(`editPolicy.${o.value}.hint`)}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {needsPassword ? (
            <div>
              <label htmlFor="deck-pass" className="fc-label">
                {t("editor.password")}
              </label>
              <input
                id="deck-pass"
                type="password"
                autoComplete="new-password"
                className="fc-input mt-1"
                placeholder={hasPassword ? t("editor.passwordKeep") : t("editor.errors.passwordShort")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!passwordError}
              />
              <p className={cx("text-body-sm mt-1", passwordError ? "fc-bad" : "text-on-surface-variant")}>
                {passwordError || t("editor.passwordHint")}
              </p>
            </div>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

/* ---------- Bulk import (Quick Import) ---------- */
const EXAMPLE = `გამარჯობა — Hello — გამარჯობა, როგორ ხარ?
look after\ttake care of\tShe looks after her brother.
put off | postpone | Don't put off your homework.
apple - яблоко`;

function ImportSheet({ onAdd, onClose }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [swap, setSwap] = useState(false);
  const parsed = useMemo(() => parseImport(text, swap), [text, swap]);
  const loadFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => setText(String(r.result || ""));
    r.readAsText(file);
    e.target.value = "";
  };
  return (
    <Sheet
      wide
      title={t("editor.import")}
      subtitle={t("editor.importHint")}
      onClose={onClose}
      labelId="import-title"
      footer={
        <>
          <button type="button" className="fc-btn fc-btn-text" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="button" className="fc-btn fc-btn-filled" disabled={!parsed.cards.length} onClick={() => onAdd(parsed.cards)}>
            {t("editor.add")} {parsed.cards.length || ""}
          </button>
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        <button type="button" className="fc-btn fc-btn-text -ml-3" onClick={() => setText(EXAMPLE)}>
          {t("editor.example")}
        </button>
        <label className="fc-btn fc-btn-text cursor-pointer">
          <FileText size={16} /> {t("editor.openFile")}
          <input type="file" accept=".txt,.csv,.tsv,text/plain,text/csv" className="sr-only" onChange={loadFile} />
        </label>
      </div>
      <textarea className="fc-input fc-mono" rows={8} placeholder={EXAMPLE} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label={t("editor.wordList")} autoFocus />
      <label className="inline-flex items-center gap-2 text-body-md cursor-pointer">
        <input type="checkbox" className="w-5 h-5" style={{ accentColor: "var(--md-primary)" }} checked={swap} onChange={(e) => setSwap(e.target.checked)} />
        {t("editor.definitionFirst")}
      </label>
      {text.trim() ? (
        <div className="bg-surface-container-high rounded-2xl p-4" aria-live="polite">
          <div className="text-title-sm">
            {t("editor.recognized", { count: parsed.cards.length })}
            {parsed.skipped.length ? <span className="text-on-surface-variant font-normal"> · {t("editor.skipped", { count: parsed.skipped.length })}</span> : null}
          </div>
          <ul className="mt-2 flex flex-col gap-1.5 max-h-48 overflow-auto text-body-md">
            {parsed.cards.slice(0, 50).map((c, i) => (
              <li key={i} className="grid grid-cols-2 gap-3">
                <b className="font-medium" style={{ overflowWrap: "anywhere" }}>
                  {c.term}
                </b>
                <span className="text-on-surface-variant" style={{ overflowWrap: "anywhere" }}>
                  {c.definition}
                </span>
              </li>
            ))}
          </ul>
          {parsed.skipped.length ? <p className="text-body-sm text-on-surface-variant mt-2">{t("editor.noSeparator", { lines: parsed.skipped.slice(0, 8).map((s) => s.line).join(", ") })}</p> : null}
        </div>
      ) : null}
    </Sheet>
  );
}
