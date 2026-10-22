/**
 * "Cards" tab: deck settings, add a card (term / definition / example), and the searchable card list.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, RotateCcw, Search, Trash2, Undo2, Upload } from "lucide-react";
import { BoxBadge, ConfirmButton, SpeakButton } from "./ui.jsx";
import { BOXES, dueLabel, isDue } from "../lib/leitner.js";
import { MAX_CARDS_PER_DECK } from "../lib/model.js";
import { cx } from "../lib/utils.js";

const PAGE = 100; // cards rendered at a time (keeps huge decks smooth on phones)

function CardEditor({ card, onSave, onCancel }) {
  const [draft, setDraft] = useState({ term: card.term, definition: card.definition, exampleSentence: card.exampleSentence || "" });
  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.value });
  const esc = (e) => e.key === "Escape" && onCancel();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.term.trim() && draft.definition.trim()) onSave(draft);
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label htmlFor={`edit-term-${card.id}`} className="sr-only">Term</label>
          <input id={`edit-term-${card.id}`} className="fc-input" value={draft.term} onChange={set("term")} onKeyDown={esc} autoFocus />
        </div>
        <div>
          <label htmlFor={`edit-def-${card.id}`} className="sr-only">Definition</label>
          <input id={`edit-def-${card.id}`} className="fc-input" value={draft.definition} onChange={set("definition")} onKeyDown={esc} />
        </div>
      </div>
      <label htmlFor={`edit-ex-${card.id}`} className="sr-only">Example sentence</label>
      <input
        id={`edit-ex-${card.id}`}
        className="fc-input"
        placeholder="Example sentence (optional)"
        value={draft.exampleSentence}
        onChange={set("exampleSentence")}
        onKeyDown={esc}
      />
      <div className="flex gap-2">
        <button type="submit" className="fc-btn fc-btn-primary px-3 py-2 text-sm">Save</button>
        <button type="button" className="fc-btn fc-btn-ghost px-3 py-2 text-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function CardsManager({ deck, now, actions, onDeleteDeck, onPaste, onSpeak, toast }) {
  const [name, setName] = useState(deck.name);
  const [desc, setDesc] = useState(deck.description || "");
  const [form, setForm] = useState({ term: "", definition: "", exampleSentence: "" });
  const [query, setQuery] = useState("");
  const [boxFilter, setBoxFilter] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [limit, setLimit] = useState(PAGE);
  const termRef = useRef(null);

  // Follow remote renames (another device) unless the field is being edited.
  useEffect(() => {
    setName(deck.name);
    setDesc(deck.description || "");
  }, [deck.id, deck.name, deck.description]);

  const saveMeta = () => {
    const n = name.trim() || deck.name;
    setName(n);
    if (n !== deck.name || desc.trim() !== (deck.description || "")) actions.renameDeck(deck.id, { name: n, description: desc });
  };

  const addCard = (e) => {
    e.preventDefault();
    if (!form.term.trim() || !form.definition.trim()) return;
    const added = actions.addCards(deck.id, [form]);
    if (!added) toast(`A deck can hold up to ${MAX_CARDS_PER_DECK} cards. Start a new deck for more.`);
    setForm({ term: "", definition: "", exampleSentence: "" });
    termRef.current?.focus();
  };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return deck.cards.filter(
      (c) =>
        (!boxFilter || c.box === boxFilter) &&
        (!q || c.term.toLowerCase().includes(q) || c.definition.toLowerCase().includes(q) || (c.exampleSentence || "").toLowerCase().includes(q))
    );
  }, [deck.cards, query, boxFilter]);

  return (
    <div className="flex flex-col gap-5 fc-in">
      {/* Deck settings */}
      <div className="fc-panel p-4 sm:p-5 flex flex-col gap-3">
        <div className="fc-eyebrow">Deck settings</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="deck-name" className="text-xs font-bold fc-muted">Name</label>
            <input
              id="deck-name"
              className="fc-input mt-1"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveMeta}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          </div>
          <div>
            <label htmlFor="deck-desc" className="text-xs font-bold fc-muted">Description</label>
            <input
              id="deck-desc"
              className="fc-input mt-1"
              value={desc}
              placeholder="Optional"
              onChange={(e) => setDesc(e.target.value)}
              onBlur={saveMeta}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="fc-btn fc-btn-ghost px-3 py-2 text-sm" onClick={onPaste}>
            <Upload size={15} /> Paste more cards
          </button>
          <ConfirmButton
            label="Reset progress"
            confirmLabel="Tap again to reset"
            icon={RotateCcw}
            onConfirm={() => {
              actions.resetDeck(deck.id);
              toast("Progress reset. All cards are back in Box 1.");
            }}
          />
          <ConfirmButton label="Delete deck" confirmLabel="Tap again to delete" icon={Trash2} onConfirm={onDeleteDeck} />
        </div>
      </div>

      {/* Add a card */}
      <form className="fc-panel p-4 sm:p-5 flex flex-col gap-3" onSubmit={addCard}>
        <div className="flex items-baseline justify-between gap-2">
          <div className="fc-eyebrow">Add a card</div>
          <div className="text-xs fc-muted fc-mono">
            {deck.cards.length}/{MAX_CARDS_PER_DECK}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor="new-term" className="sr-only">Term</label>
            <input
              id="new-term"
              ref={termRef}
              className="fc-input"
              placeholder="Term, e.g. გამარჯობა"
              value={form.term}
              onChange={(e) => setForm({ ...form, term: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="new-definition" className="sr-only">Definition</label>
            <input
              id="new-definition"
              className="fc-input"
              placeholder="Definition, e.g. Hello"
              value={form.definition}
              onChange={(e) => setForm({ ...form, definition: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label htmlFor="new-example" className="sr-only">Example sentence</label>
          <input
            id="new-example"
            className="fc-input"
            placeholder="Example sentence (optional), e.g. გამარჯობა, როგორ ხარ?"
            value={form.exampleSentence}
            onChange={(e) => setForm({ ...form, exampleSentence: e.target.value })}
          />
        </div>
        <div>
          <button type="submit" className="fc-btn fc-btn-primary px-4 py-2.5 text-sm" disabled={!form.term.trim() || !form.definition.trim()}>
            <Plus size={16} /> Add card
          </button>
        </div>
      </form>

      {/* Card list */}
      <div className="fc-panel overflow-hidden">
        <div className="p-4 sm:p-5 flex flex-wrap items-center gap-3 fc-border-b">
          <div className="relative flex-1" style={{ minWidth: "min(100%, 14rem)" }}>
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 fc-muted pointer-events-none" />
            <label htmlFor="card-search" className="sr-only">Search cards</label>
            <input
              id="card-search"
              type="search"
              className="fc-input"
              style={{ paddingLeft: "2.2rem" }}
              placeholder={`Search ${deck.cards.length} cards`}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
            />
          </div>
          <div className="fc-seg inline-flex fc-scroll-x max-w-full" role="group" aria-label="Filter by box">
            {[0, ...BOXES].map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={boxFilter === b}
                className="px-2.5 py-1.5 text-xs whitespace-nowrap"
                onClick={() => {
                  setBoxFilter(b);
                  setLimit(PAGE);
                }}
              >
                {b === 0 ? "All" : `Box ${b}`}
              </button>
            ))}
          </div>
        </div>

        {list.length === 0 ? (
          <div className="p-8 text-center fc-muted text-sm">{deck.cards.length ? "No cards match." : "No cards yet. Add one above or paste a list."}</div>
        ) : (
          <ul>
            {list.slice(0, limit).map((c, i) => (
              <li key={c.id} className={cx("fc-row px-4 sm:px-5 py-3", i > 0 && "fc-border-t")}>
                {editingId === c.id ? (
                  <CardEditor
                    card={c}
                    onCancel={() => setEditingId(null)}
                    onSave={(draft) => {
                      actions.updateCard(deck.id, c.id, {
                        term: draft.term.trim(),
                        definition: draft.definition.trim(),
                        exampleSentence: draft.exampleSentence.trim(),
                      });
                      setEditingId(null);
                    }}
                  />
                ) : (
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5">
                        <div className="font-bold min-w-0" style={{ overflowWrap: "anywhere" }}>{c.term}</div>
                        <div className="fc-muted min-w-0" style={{ overflowWrap: "anywhere" }}>{c.definition}</div>
                      </div>
                      {c.exampleSentence ? (
                        <div className="fc-example text-sm mt-1 truncate" title={c.exampleSentence}>
                          {c.exampleSentence}
                        </div>
                      ) : null}
                    </div>
                    <div className="hidden md:flex flex-col items-end gap-0.5 shrink-0 w-28">
                      <BoxBadge box={c.box} />
                      <span className={cx("text-xs", isDue(c, now) ? "fc-accent font-bold" : "fc-muted")}>{dueLabel(c, now)}</span>
                    </div>
                    <div className="flex items-center shrink-0">
                      <span
                        className="md:hidden w-2.5 h-2.5 rounded-full inline-block mr-1"
                        style={{ background: `var(--box-${c.box})` }}
                        title={`Box ${c.box}`}
                        aria-label={`Box ${c.box}`}
                      />
                      <SpeakButton text={c.term} onSpeak={onSpeak} className="hidden sm:inline-flex" />
                      <button type="button" className="fc-btn fc-btn-quiet fc-icon-btn" aria-label={`Edit ${c.term}`} onClick={() => setEditingId(c.id)}>
                        <Pencil size={16} />
                      </button>
                      {c.box > 1 || c.lastReviewed ? (
                        <button
                          type="button"
                          className="fc-btn fc-btn-quiet fc-icon-btn hidden sm:inline-flex"
                          aria-label={`Move ${c.term} back to Box 1`}
                          title="Back to Box 1"
                          onClick={() => actions.resetCard(deck.id, c.id)}
                        >
                          <Undo2 size={16} />
                        </button>
                      ) : null}
                      <button type="button" className="fc-btn fc-btn-quiet fc-icon-btn" aria-label={`Delete ${c.term}`} onClick={() => actions.deleteCard(deck.id, c.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {list.length > limit ? (
          <div className="p-3 text-center fc-border-t">
            <button type="button" className="fc-btn fc-btn-ghost px-4 py-2 text-sm" onClick={() => setLimit((l) => l + PAGE)}>
              Show {Math.min(PAGE, list.length - limit)} more
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
