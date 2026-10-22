// Run with: npm test   (Node's built-in test runner, no extra dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateAnswer, levenshteinAlign, answerVariants } from "../src/lib/levenshtein.js";
import { parseImport } from "../src/lib/parser.js";
import { isDue, nextBox, gradeCard, DAY_MS } from "../src/lib/leitner.js";
import { normalizeCard } from "../src/lib/model.js";
import { readBackup } from "../src/lib/backup.js";

test("levenshtein alignment marks substitutions, extras and missing letters", () => {
  const { distance, ops } = levenshteinAlign("recieve", "receive");
  assert.equal(distance, 2);
  assert.equal(ops.filter((o) => o.type !== "match").length, 2);
  const missing = levenshteinAlign("postpne", "postpone");
  assert.equal(missing.distance, 1);
  assert.deepEqual(missing.ops.find((o) => o.type === "del"), { type: "del", b: "o" });
  const extra = levenshteinAlign("hellow", "hello");
  assert.deepEqual(extra.ops.find((o) => o.type === "ins"), { type: "ins", a: "w" });
});

test("evaluateAnswer: correct / almost / wrong with typo tolerance", () => {
  assert.equal(evaluateAnswer("  HELLO ", "Hello").verdict, "correct");
  assert.equal(evaluateAnswer("excuse me!", "Sorry / Excuse me").verdict, "correct");
  assert.equal(evaluateAnswer("yes", "Yes (polite)").verdict, "correct");
  assert.equal(evaluateAnswer("postpne", "postpone").verdict, "almost"); // 1 edit, 8 letters
  assert.equal(evaluateAnswer("recieve", "receive").verdict, "almost"); // 2 edits, 7 letters
  assert.equal(evaluateAnswer("tee", "tea").verdict, "wrong"); // short words must be exact
  assert.equal(evaluateAnswer("bred", "bread").verdict, "almost");
  assert.equal(evaluateAnswer("banana", "postpone").verdict, "wrong");
  assert.equal(evaluateAnswer("", "x").verdict, "wrong");
  assert.equal(evaluateAnswer("გამარჯობ", "გამარჯობა").verdict, "almost"); // Georgian code points
  assert.deepEqual(answerVariants("Sorry / Excuse me"), ["Sorry / Excuse me", "Sorry", "Excuse me"]);
});

test("quick import parses 2 and 3 columns", () => {
  const { cards, skipped } = parseImport(
    [
      "გამარჯობა — Hello — გამარჯობა, როგორ ხარ?",
      "apple - яблоко",
      "look after\ttake care of someone\tShe looks after her little brother.",
      "put off | postpone | Don't put off your homework.",
      "1. well-known - famous",
      "no separator",
      "# comment",
    ].join("\n")
  );
  assert.equal(cards.length, 5);
  assert.deepEqual(cards[0], { term: "გამარჯობა", definition: "Hello", exampleSentence: "გამარჯობა, როგორ ხარ?" });
  assert.equal(cards[1].exampleSentence, "");
  assert.equal(cards[2].exampleSentence, "She looks after her little brother.");
  assert.equal(cards[3].definition, "postpone");
  assert.equal(cards[4].term, "well-known");
  assert.equal(skipped.length, 1);
});

test("leitner scheduling", () => {
  const now = Date.now();
  const card = (box, daysAgo) => ({ box, lastReviewed: daysAgo == null ? null : now - daysAgo * DAY_MS });
  assert.equal(isDue(card(1, null), now), true);
  assert.equal(isDue(card(1, 0), now), false);
  assert.equal(isDue(card(1, 1), now), true);
  assert.equal(isDue(card(2, 1), now), false);
  assert.equal(isDue(card(3, 4), now), true);
  assert.equal(isDue(card(5, 400), now), false);
  assert.equal(nextBox(3, "know"), 4);
  assert.equal(nextBox(5, "know"), 5);
  assert.equal(nextBox(4, "again"), 1);
  assert.equal(nextBox(3, "almost"), 3);
  assert.equal(gradeCard({ box: 2, reviews: 1, lapses: 0 }, "again").lapses, 1);
});

test("v1 cards and backups migrate to the v2 model", () => {
  const c = normalizeCard({ id: "a", front: "ყავა", back: "Coffee", box: 9 });
  assert.equal(c.term, "ყავა");
  assert.equal(c.definition, "Coffee");
  assert.equal(c.exampleSentence, "");
  assert.equal(c.box, 5);
  const { decks } = readBackup({ decks: [{ name: "Old", cards: [{ front: "a", back: "b" }] }] });
  assert.equal(decks[0].cards[0].term, "a");
  assert.throws(() => readBackup({ hello: 1 }));
});
