/**
 * "Download audio": stores the cloud pronunciation of every term and example sentence of the
 * given decks in IndexedDB, so the speaker works offline. Shows "15/50…" while downloading and
 * a check mark once everything is on the device.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Download } from "lucide-react";
import { Spinner } from "./ui.jsx";
import { useToast } from "./providers.jsx";
import { audioEntries, countOffline, downloadAudio } from "../data/tts.js";
import { speechLang } from "../lib/languages.js";
import { cx } from "../lib/utils.js";

export default function AudioDownloadButton({ decks, className }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [entries, setEntries] = useState(null);
  const [stored, setStored] = useState(0);
  const [progress, setProgress] = useState(null); // { done, total } while downloading
  const abort = useRef(null);

  // Recompute when the cards change (text or count), not on every snapshot.
  const signature = useMemo(() => decks.map((d) => `${d.id}:${d.cards.map((c) => `${c.term}|${c.exampleSentence}`).join("¦")}`).join("§"), [decks]);

  useEffect(() => {
    let alive = true;
    const pairs = decks.flatMap((deck) =>
      deck.cards.flatMap((c) => [
        { text: c.term, lang: speechLang(deck, "term", c.term) },
        ...(c.exampleSentence ? [{ text: c.exampleSentence, lang: speechLang(deck, "term", c.exampleSentence) }] : []),
      ])
    );
    audioEntries(pairs).then(async (list) => {
      const have = await countOffline(list);
      if (!alive) return;
      setEntries(list);
      setStored(have);
    });
    return () => {
      alive = false;
    };
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => abort.current?.abort(), []);

  if (!entries || entries.length === 0) return null;
  const complete = stored >= entries.length;

  const start = async () => {
    abort.current = new AbortController();
    setProgress({ done: stored, total: entries.length });
    const res = await downloadAudio(entries, { concurrency: 3, signal: abort.current.signal, onProgress: (done, total) => setProgress({ done, total }) });
    if (abort.current.signal.aborted) return;
    const have = await countOffline(entries);
    setStored(have);
    setProgress(null);
    toast(res.failed ? t("audioDownload.partial", { count: res.failed }) : t("audioDownload.done"), { duration: res.failed ? 6000 : 3600 });
  };

  if (progress) {
    return (
      <div className={cx("fc-btn fc-btn-tonal pointer-events-none fc-tabular", className)} role="status" aria-live="polite">
        <Spinner size={18} /> {t("audioDownload.progress", { done: progress.done, total: progress.total })}
      </div>
    );
  }
  if (complete) {
    return (
      <div className={cx("inline-flex items-center gap-2 text-label-lg fc-good py-2", className)} role="status">
        <CheckCircle2 size={18} /> {t("audioDownload.offline")}
      </div>
    );
  }
  return (
    <button type="button" className={cx("fc-btn fc-btn-outlined", className)} onClick={start}>
      <Download size={18} /> {t("audioDownload.button")}
      {stored > 0 ? <span className="opacity-70 font-normal fc-tabular">({stored}/{entries.length})</span> : null}
    </button>
  );
}
