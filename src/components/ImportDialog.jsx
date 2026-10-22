/**
 * Quick Import: paste text (or open a .txt/.csv/.tsv file) → live preview → new deck or append.
 */
import React, { useMemo, useRef, useState, useEffect } from "react";
import { Check, FileText, Plus, Sparkles } from "lucide-react";
import { Modal } from "./ui.jsx";
import { parseImport } from "../lib/parser.js";
import { MAX_CARDS_PER_DECK } from "../lib/model.js";

const EXAMPLE = `გამარჯობა — Hello — გამარჯობა, როგორ ხარ?
look after	take care of	She looks after her little brother.
put off | postpone | Don't put off your homework.
apple - яблоко`;

export default function ImportDialog({ kind, focus, deck, onClose, onCreate, onAppend }) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [swap, setSwap] = useState(false);
  const nameRef = useRef(null);
  const textRef = useRef(null);
  const parsed = useMemo(() => parseImport(text, swap), [text, swap]);

  useEffect(() => {
    (focus === "name" && kind === "new" ? nameRef : textRef).current?.focus();
    // focus once on open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result || ""));
      if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const room = kind === "append" ? Math.max(0, MAX_CARDS_PER_DECK - deck.cards.length) : MAX_CARDS_PER_DECK;
  const count = Math.min(parsed.cards.length, room);
  const over = parsed.cards.length - count;
  const withExamples = parsed.cards.filter((c) => c.exampleSentence).length;
  const canSubmit = kind === "append" ? count > 0 : count > 0 || name.trim();

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    const cards = parsed.cards.slice(0, count);
    if (kind === "append") onAppend(cards);
    else onCreate(name.trim() || `Imported ${new Date().toLocaleDateString()}`, cards);
  };

  return (
    <Modal
      as="form"
      onSubmit={submit}
      labelId="import-title"
      title={kind === "append" ? `Add cards to “${deck.name}”` : "New deck"}
      subtitle="One card per line: term — definition — example. Tabs, | , dashes, = and : all work."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="fc-btn fc-btn-ghost px-4 py-2.5" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="fc-btn fc-btn-primary px-4 py-2.5" disabled={!canSubmit}>
            {kind === "append" ? (
              <>
                <Plus size={16} /> Add {count} card{count === 1 ? "" : "s"}
              </>
            ) : (
              <>
                <Sparkles size={16} /> {count ? `Create deck with ${count} card${count === 1 ? "" : "s"}` : "Create empty deck"}
              </>
            )}
          </button>
        </>
      }
    >
      {kind === "new" ? (
        <div>
          <label htmlFor="import-name" className="text-xs font-bold fc-muted">
            Deck name
          </label>
          <input
            id="import-name"
            ref={nameRef}
            className="fc-input mt-1"
            maxLength={120}
            placeholder="e.g. Georgian food words"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      ) : null}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="import-text" className="text-xs font-bold fc-muted">
            Word list
          </label>
          <div className="flex items-center gap-1">
            <button type="button" className="fc-btn fc-btn-quiet px-2 py-1 text-xs" onClick={() => setText(EXAMPLE)}>
              Try example
            </button>
            <label className="fc-btn fc-btn-quiet px-2 py-1 text-xs">
              <FileText size={14} /> Open .txt / .csv
              <input type="file" accept=".txt,.csv,.tsv,text/plain,text/csv" className="sr-only" onChange={loadFile} />
            </label>
          </div>
        </div>
        <textarea
          id="import-text"
          ref={textRef}
          className="fc-input mt-1 fc-mono"
          rows={7}
          placeholder={EXAMPLE}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
      </div>

      <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
        <input type="checkbox" checked={swap} onChange={(e) => setSwap(e.target.checked)} className="w-5 h-5" style={{ accentColor: "var(--accent)" }} />
        Swap sides (my list is definition first)
      </label>

      {text.trim() ? (
        <div className="fc-surface2 rounded-xl p-3 sm:p-4" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="fc-chip fc-chip-good fc-mono">
              <Check size={12} /> {count} card{count === 1 ? "" : "s"}
            </span>
            {withExamples ? <span className="fc-chip fc-chip-accent fc-mono">{withExamples} with examples</span> : null}
            {parsed.skipped.length ? (
              <span className="fc-chip fc-chip-muted fc-mono">
                {parsed.skipped.length} line{parsed.skipped.length === 1 ? "" : "s"} skipped
              </span>
            ) : null}
            {over > 0 ? <span className="fc-chip fc-chip-warn fc-mono">{over} over the {MAX_CARDS_PER_DECK}-card limit</span> : null}
          </div>
          {count ? (
            <ul className="mt-3 flex flex-col gap-2 text-sm max-h-56 overflow-auto">
              {parsed.cards.slice(0, 60).map((c, i) => (
                <li key={i} className="min-w-0">
                  <div className="grid grid-cols-2 gap-3">
                    <span className="font-bold min-w-0" style={{ overflowWrap: "anywhere" }}>{c.term}</span>
                    <span className="fc-muted min-w-0" style={{ overflowWrap: "anywhere" }}>{c.definition}</span>
                  </div>
                  {c.exampleSentence ? <div className="fc-example text-xs mt-0.5">{c.exampleSentence}</div> : null}
                </li>
              ))}
              {count > 60 ? <li className="fc-muted text-xs">…and {count - 60} more</li> : null}
            </ul>
          ) : null}
          {parsed.skipped.length ? (
            <div className="mt-3 text-xs fc-muted">
              No separator found on line{parsed.skipped.length === 1 ? "" : "s"} {parsed.skipped.slice(0, 6).map((s) => s.line).join(", ")}
              {parsed.skipped.length > 6 ? "…" : ""}. Put a dash, tab or | between the term and its definition.
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
