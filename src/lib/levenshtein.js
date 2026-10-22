/**
 * Smart answer checking for Write mode.
 *
 * 1. `levenshteinAlign(a, b)` computes the Levenshtein edit distance AND the alignment
 *    (which letters match, which were substituted, inserted or deleted), so the UI can
 *    highlight exactly which letters are wrong or missing.
 * 2. `evaluateAnswer(given, expected)` normalises both strings, tries every accepted variant
 *    ("Sorry / Excuse me" accepts either), and returns a verdict:
 *        "correct" → exact match (case-insensitive)
 *        "almost"  → within the typo tolerance for that word length
 *        "wrong"   → too far off
 *
 * Tune `typoTolerance()` to make the checker stricter or more forgiving.
 */

/** Ignore accents when comparing (é = e)? Useful for French/Spanish/Portuguese decks. */
export const IGNORE_ACCENTS = false;

/**
 * How many edits still count as "almost", by length of the expected answer.
 * Short words must be exact; long words forgive 1–2 typos.
 */
export function typoTolerance(length) {
  if (length <= 3) return 0;
  if (length <= 6) return 1;
  return 2;
}

/** Trim, collapse spaces, strip quotes and trailing punctuation. Keeps the original case for display. */
export function tidy(s) {
  return String(s ?? "")
    .normalize("NFC")
    .replace(/[“”"«»„]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?¿¡…]+$/u, "")
    .trim();
}

/** Comparison key for one character. */
function foldChar(ch) {
  let c = ch.toLowerCase();
  if (IGNORE_ACCENTS) c = c.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return c;
}

/**
 * Levenshtein distance with a full alignment.
 * `a` = what the user typed, `b` = the correct answer.
 * Returns { distance, ops } where each op is one of:
 *   { type: "match", a, b }  same letter
 *   { type: "sub",   a, b }  user typed `a` where `b` was expected
 *   { type: "ins",   a }     user typed an extra letter `a`
 *   { type: "del",   b }     user missed letter `b`
 *
 * Uses code points (Array.from), so Georgian, Cyrillic, emoji etc. are handled correctly.
 */
export function levenshteinAlign(aStr, bStr) {
  const a = Array.from(aStr);
  const b = Array.from(bStr);
  const m = a.length;
  const n = b.length;
  const fa = a.map(foldChar);
  const fb = b.map(foldChar);

  // dp[i][j] = distance between a[0..i) and b[0..j)
  const dp = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array(n + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = fa[i - 1] === fb[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // extra letter typed (insertion)
        dp[i][j - 1] + 1, // letter missing (deletion)
        dp[i - 1][j - 1] + cost // match / substitution
      );
    }
  }

  // Backtrace: prefer diagonal moves so substitutions read naturally.
  const ops = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const cost = fa[i - 1] === fb[j - 1] ? 0 : 1;
      if (dp[i][j] === dp[i - 1][j - 1] + cost) {
        ops.push({ type: cost ? "sub" : "match", a: a[i - 1], b: b[j - 1] });
        i -= 1;
        j -= 1;
        continue;
      }
    }
    if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({ type: "ins", a: a[i - 1] });
      i -= 1;
    } else {
      ops.push({ type: "del", b: b[j - 1] });
      j -= 1;
    }
  }
  ops.reverse();
  return { distance: dp[m][n], ops };
}

/** Plain distance (convenience). */
export function levenshtein(a, b) {
  return levenshteinAlign(a, b).distance;
}

/**
 * All accepted forms of an answer:
 *   "Sorry / Excuse me"  → "Sorry / Excuse me", "Sorry", "Excuse me"
 *   "Yes (polite)"       → "Yes (polite)", "Yes"
 */
export function answerVariants(expected) {
  const full = tidy(expected);
  const noParens = tidy(full.replace(/\([^)]*\)/g, " "));
  const parts = noParens.split(/\s*[/;,]\s*|\s+or\s+/i).map(tidy);
  return [...new Set([full, noParens, ...parts].filter(Boolean))];
}

/**
 * Grade a typed answer.
 * Returns { verdict, distance, tolerance, ops, target } where `target` is the variant
 * the answer was compared against (the closest one) and `ops` is its alignment.
 */
export function evaluateAnswer(given, expected) {
  const g = tidy(given);
  const variants = answerVariants(expected);
  if (!g) {
    return { verdict: "wrong", distance: Infinity, tolerance: 0, ops: [], target: variants[0] || tidy(expected) };
  }

  let best = null;
  for (const v of variants) {
    const { distance, ops } = levenshteinAlign(g, v);
    if (!best || distance < best.distance) best = { distance, ops, target: v };
    if (distance === 0) break;
  }

  const tolerance = typoTolerance(Array.from(best.target).length);
  const verdict = best.distance === 0 ? "correct" : best.distance <= tolerance ? "almost" : "wrong";
  return { verdict, distance: best.distance, tolerance, ops: best.ops, target: best.target };
}

/** Is the alignment close enough that showing a letter-by-letter diff is helpful? */
export function diffIsUseful(result) {
  if (!result.ops.length || !Number.isFinite(result.distance)) return false;
  const len = Array.from(result.target).length;
  return result.distance <= Math.max(3, Math.ceil(len / 2));
}
