/**
 * Quick Import parser: turns pasted text into cards { term, definition, exampleSentence }.
 *
 * One card per line. Supported formats:
 *
 *   term — definition
 *   term - definition
 *   term = definition
 *   term: definition
 *   term<TAB>definition<TAB>example           (spreadsheet copy-paste)
 *   term | definition | example sentence
 *   term — definition — example sentence      (spaced em/en dashes)
 *
 * Leading numbering and bullets ("1.", "-", "•") are ignored, as are blank lines and
 * lines starting with # or //. Duplicate lines are skipped.
 */

// For the term/definition split. Tried in order; the first one found splits the line once.
const PRIMARY_SEPARATORS = [
  /\s*\|\s*/, // pipe
  /\t+/, // tab
  /\s+[—–]\s+/, // spaced em/en dash
  /\s*[—–]\s*/, // unspaced em/en dash
  /\s+-{1,2}\s+/, // spaced hyphen (keeps "well-known" intact)
  /\s*=>?\s*/, // = or =>
  /\s*:\s+/, // "term: definition"
  /\s*;\s*/,
  /\s*,\s*/, // CSV-ish, last resort before a bare hyphen
  /\s*-\s*/, // bare hyphen
];

// Separators that may split the definition from an example sentence (must be explicit).
const EXAMPLE_SEPARATORS = { pipe: /\s*\|\s*/, tab: /\t+/, dash: /\s+[—–]\s+/ };

const BULLET = /^\s*(?:[*•·▪]|-(?=\s)|\d+[.)])\s+/;
const unquote = (s) => s.replace(/^["'«]+|["'»]+$/g, "").trim();

function splitOnce(line, re) {
  const m = re.exec(line);
  if (!m || m.index === 0) return null;
  const left = line.slice(0, m.index).trim();
  const right = line.slice(m.index + m[0].length).trim();
  return left && right ? [left, right, m[0]] : null;
}

export function parseLine(raw) {
  const line = raw.replace(BULLET, "").trim();
  for (const re of PRIMARY_SEPARATORS) {
    const parts = splitOnce(line, re);
    if (!parts) continue;
    const [term, rest, sep] = parts;

    // Same separator type again → third column is the example sentence.
    let definition = rest;
    let exampleSentence = "";
    const kind = sep.includes("|") ? "pipe" : sep.includes("\t") ? "tab" : /[—–]/.test(sep) && /\s/.test(sep) ? "dash" : null;
    if (kind) {
      const more = splitOnce(rest, EXAMPLE_SEPARATORS[kind]);
      if (more) {
        definition = more[0];
        exampleSentence = more[1];
      }
    }
    return { term: unquote(term), definition: unquote(definition), exampleSentence: unquote(exampleSentence) };
  }
  return null;
}

/**
 * @param {string} text   pasted text
 * @param {boolean} swap  true if the list is "definition — term"
 * @returns {{ cards: {term, definition, exampleSentence}[], skipped: {line:number, text:string}[] }}
 */
export function parseImport(text, swap = false) {
  const cards = [];
  const skipped = [];
  const seen = new Set();

  String(text || "")
    .split(/\r?\n/)
    .forEach((raw, index) => {
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) return;
      const card = parseLine(raw);
      if (!card || !card.term || !card.definition) {
        skipped.push({ line: index + 1, text: trimmed });
        return;
      }
      if (swap) [card.term, card.definition] = [card.definition, card.term];
      const key = `${card.term.toLowerCase()}\u0000${card.definition.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      cards.push(card);
    });

  return { cards, skipped };
}
