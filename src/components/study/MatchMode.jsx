/**
 * Mode: Match — find the pairs against the clock.
 *
 * The round's words and translations are mixed on one grid; tap a word, then its translation
 * (or the other way round). A pair → both tiles flash green and disappear. Not a pair → red
 * flash and a shake, the selection resets. Boards hold up to MATCH_BOARD_PAIRS pairs, so the
 * tiles stay big enough on a phone; the next board appears when one is cleared.
 *
 * Audio: a tap on a word reads it at once — there is nothing to spoil here and speed matters.
 * Translations are read too when "Translation" is on (settings.autoAudio).
 *
 * Leitner, through the round engine (useRounds answer(grade, key)): a pair found without a single
 * wrong pair involving that word = "know"; any wrong pair = "again" (both words of a wrong pair
 * count it). The round summary follows the last pair; onFinish(seconds) reports the time.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Timer } from "lucide-react";
import { useAutoSpeak } from "../../hooks/useAutoSpeak.js";
import { formatClock, matchBoards, matchGrade, matchPairKey } from "../../lib/games.js";
import { speechLang } from "../../lib/languages.js";
import { cx, shuffle } from "../../lib/utils.js";

const VANISH_MS = 380;
const WRONG_MS = 500;

const tilesFor = (board) =>
  shuffle(
    board.flatMap((i) => [
      { id: `${i.key}|t`, key: i.key, side: "term", text: i.card.term, lang: speechLang(i.deck, "term", i.card.term), htmlLang: i.deck.termLang },
      { id: `${i.key}|d`, key: i.key, side: "definition", text: i.card.definition, lang: speechLang(i.deck, "definition", i.card.definition), htmlLang: i.deck.defLang },
    ])
  );

const textSize = (text) => (text.length > 40 ? "text-body-sm" : text.length > 18 ? "text-body-md" : "text-body-lg");

export default function MatchMode({ items, onAnswerItem, onFinish, onSpeak, tracked, goal }) {
  const { t } = useTranslation();
  const { audio } = useAutoSpeak(); // toggles + stops audio when the round ends
  // Fixed for the round (the component is keyed per round).
  const boards = useMemo(() => matchBoards(items), []); // eslint-disable-line react-hooks/exhaustive-deps
  const total = items.length;
  const [boardNo, setBoardNo] = useState(0);
  const [tiles, setTiles] = useState(() => tilesFor(boards[0] || []));
  const [selected, setSelected] = useState(null); // tile id
  const [vanishing, setVanishing] = useState(() => new Set()); // tile ids flashing green
  const [gone, setGone] = useState(() => new Set()); // tile ids matched on this board
  // The same, for the delayed callbacks (several pairs can vanish at once).
  const board = useRef(0);
  const boardTiles = useRef(tiles);
  const goneRef = useRef(gone);
  const [wrong, setWrong] = useState({ ids: [], n: 0 });
  const [found, setFound] = useState(0);
  const [live, setLive] = useState("");
  const matched = useRef(new Set()); // card keys
  const errors = useRef(new Set()); // card keys that were in a wrong pair
  const timers = useRef([]);

  const startedAt = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    if (finished) return undefined;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 250);
    return () => clearInterval(id);
  }, [finished]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
  const boardCards = useMemo(() => (boards[boardNo] || []).map((i) => ({ key: i.key, term: i.card.term, definition: i.card.definition })), [boards, boardNo]);

  const tap = (tile) => {
    if (gone.has(tile.id) || vanishing.has(tile.id)) return;
    // Read on tap (synchronously, inside the gesture): words always per the toggle, no spoiler rule.
    if (audio[tile.side]) onSpeak(tile.text, tile.lang);

    const first = selected ? tiles.find((x) => x.id === selected) : null;
    if (!first || first.id === tile.id) return setSelected(first ? null : tile.id);
    if (first.side === tile.side) return setSelected(tile.id); // two words / two translations: switch

    const termTile = first.side === "term" ? first : tile;
    const defTile = first.side === "term" ? tile : first;
    setSelected(null);
    const key = matchPairKey(termTile, defTile, boardCards, matched.current);

    if (!key) {
      errors.current.add(termTile.key);
      errors.current.add(defTile.key);
      const n = wrong.n + 1;
      setWrong({ ids: [termTile.id, defTile.id], n });
      setLive(t("match.wrong"));
      later(() => setWrong((w) => (w.n === n ? { ids: [], n } : w)), WRONG_MS);
      return;
    }

    matched.current.add(key);
    const grade = matchGrade(key, errors.current);
    const pairIds = [termTile.id, defTile.id];
    const isLast = matched.current.size === total;
    setFound(matched.current.size);
    setLive(t("match.matched"));
    setVanishing((v) => new Set([...v, ...pairIds]));
    if (isLast) {
      setFinished(true);
      onFinish?.(Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)));
    }
    later(() => {
      setVanishing((v) => new Set([...v].filter((id) => !pairIds.includes(id))));
      const next = new Set([...goneRef.current, ...pairIds]);
      // Board cleared → the next one (the last pair of the round goes to the summary instead).
      const nextBoard = board.current + 1;
      if (next.size === boardTiles.current.length && nextBoard < boards.length) {
        board.current = nextBoard;
        boardTiles.current = tilesFor(boards[nextBoard]);
        goneRef.current = new Set();
        setBoardNo(nextBoard);
        setTiles(boardTiles.current);
        setSelected(null);
      } else {
        goneRef.current = next;
      }
      setGone(goneRef.current);
      onAnswerItem(key, grade); // the last one ends the round → round summary
    }, VANISH_MS);
  };

  const rule = !tracked ? t("ratingHint.retry") : goal === "cram" ? t("ratingHint.cram") : t("match.rule");

  return (
    <div className="flex flex-col gap-4 w-full max-w-2xl mx-auto fc-in">
      <div className="flex items-center justify-between gap-3">
        <span className="fc-badge fc-badge-muted text-title-md fc-tabular py-1.5 px-3" role="timer" aria-label={t("match.time")}>
          <Timer size={18} /> {formatClock(elapsed)}
        </span>
        <span className="text-label-lg text-on-surface-variant fc-tabular">
          {boards.length > 1 ? `${t("match.board", { n: boardNo + 1, total: boards.length })} · ` : ""}
          {t("match.pairs", { done: found, total })}
        </span>
      </div>

      <div key={boardNo} className="grid grid-cols-3 sm:grid-cols-4 gap-2 fc-in">
        {tiles.map((tile) => {
          const isGone = gone.has(tile.id);
          const isWrong = wrong.ids.includes(tile.id);
          return (
            <button
              key={isWrong ? `${tile.id}-w${wrong.n}` : tile.id}
              type="button"
              disabled={isGone}
              aria-pressed={selected === tile.id}
              lang={tile.htmlLang && tile.htmlLang !== "auto" ? tile.htmlLang : undefined}
              className={cx(
                "fc-opt fc-tile fc-focus min-w-0",
                tile.side === "term" && "fc-term",
                vanishing.has(tile.id) ? "is-correct fc-vanish" : isWrong ? "is-wrong fc-shake" : selected === tile.id && "is-selected"
              )}
              style={isGone ? { visibility: "hidden" } : undefined}
              onClick={() => tap(tile)}
            >
              <span className={cx(textSize(tile.text), "font-medium")} style={{ overflowWrap: "anywhere" }}>
                {tile.text}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-body-sm text-on-surface-variant text-center">
        {t("match.hint")} {rule}
      </p>
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
    </div>
  );
}
