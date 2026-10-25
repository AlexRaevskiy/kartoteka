/**
 * Sharing, password hashing and text downloads.
 */

/** Absolute link to an in-app route, e.g. shareUrl("/deck/abc"). */
export const shareUrl = (path) => `${window.location.origin}${path}`;

/**
 * Open the native share sheet (phones, Safari, Edge) or copy the link.
 * @returns "shared" | "copied" | "cancelled" | "failed"
 */
export async function shareLink({ path, title, text }) {
  const url = shareUrl(path);
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (err) {
      if (err?.name === "AbortError") return "cancelled";
    }
  }
  return (await copyText(url)) ? "copied" : "failed";
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older WebViews
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * SHA-256 of "deckId:password" as hex. The rules compare this with deckSecrets/{deckId},
 * so the plain password never leaves the device and the hash only works for that one deck.
 */
export async function hashPassword(deckId, password) {
  const data = new TextEncoder().encode(`${deckId}:${password.normalize("NFC")}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- downloads ---------- */

const csvCell = (s) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/**
 * Cards as text.
 *   "txt" → term<TAB>definition<TAB>example  (pastes straight into Quick Import or a spreadsheet)
 *   "csv" → RFC 4180 with a header row
 */
export function deckToText(deck, format = "txt") {
  if (format === "csv") {
    const rows = [["term", "definition", "example"], ...deck.cards.map((c) => [c.term, c.definition, c.exampleSentence || ""])];
    return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  }
  return deck.cards
    .map((c) => [c.term, c.definition, c.exampleSentence].filter(Boolean).map((s) => s.replace(/[\t\r\n]+/g, " ")).join("\t"))
    .join("\n");
}

export function safeFilename(name) {
  return (name || "kartoteka").replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 80) || "kartoteka";
}

/** Save text as a file. Uses the share sheet on iOS (the only reliable way in the installed app). */
export async function downloadText(text, filename, mime = "text/plain") {
  const blob = new Blob(["﻿", text], { type: `${mime};charset=utf-8` }); // BOM so Excel reads UTF-8
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS && navigator.canShare) {
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
