// Run with: npm test   (Node's built-in test runner, no extra dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateAnswer, levenshteinAlign, answerVariants } from "../src/lib/levenshtein.js";
import { parseImport } from "../src/lib/parser.js";
import { isDue, nextBox, gradeCard, nextProgress, progressBreakdown, DAY_MS } from "../src/lib/leitner.js";
import { normalizeDeck, normalizeFolder, normalizeCardContent, progressFromLegacyCard, withProgress } from "../src/lib/model.js";
import { readBackup } from "../src/lib/backup.js";
import { buildPool, summarizeRound, takeRound, toItems } from "../src/lib/rounds.js";
import { addDaysToKey, applyActivity, displayedStreak, goalStatus, motivationPhrase } from "../src/lib/goals.js";
import { PUSH_MESSAGES, PUSH_MESSAGES_EN, decideReminder, localHoursToUtcHours } from "../src/lib/reminders.js";
import { ttsCacheKey, voiceFor } from "../src/lib/tts.js";
import { profileBackfill } from "../src/lib/profileBackfill.js";
import { splitOnTerm } from "../src/lib/utils.js";
import { deckToText } from "../src/lib/share.js";

const NOW = Date.now();
const card = (box, daysAgo, id = Math.random().toString(36).slice(2)) => ({ id, term: id, definition: "d", box, lastReviewed: daysAgo == null ? null : NOW - daysAgo * DAY_MS, reviews: 0, lapses: 0 });

test("levenshtein alignment marks substitutions, extras and missing letters", () => {
  assert.equal(levenshteinAlign("recieve", "receive").distance, 2);
  assert.deepEqual(levenshteinAlign("postpne", "postpone").ops.find((o) => o.type === "del"), { type: "del", b: "o" });
  assert.deepEqual(levenshteinAlign("hellow", "hello").ops.find((o) => o.type === "ins"), { type: "ins", a: "w" });
});

test("evaluateAnswer: correct / almost / wrong", () => {
  assert.equal(evaluateAnswer("  HELLO ", "Hello").verdict, "correct");
  assert.equal(evaluateAnswer("excuse me!", "Sorry / Excuse me").verdict, "correct");
  assert.equal(evaluateAnswer("postpne", "postpone").verdict, "almost");
  assert.equal(evaluateAnswer("tee", "tea").verdict, "wrong");
  assert.equal(evaluateAnswer("გამარჯობ", "გამარჯობა").verdict, "almost");
  assert.deepEqual(answerVariants("Sorry / Excuse me"), ["Sorry / Excuse me", "Sorry", "Excuse me"]);
});

test("quick import parses 2 and 3 columns", () => {
  const { cards, skipped } = parseImport("ყავა — Coffee — ერთი ყავა.\nput off | postpone | Don't put off.\n1. well-known - famous\nnope");
  assert.equal(cards.length, 3);
  assert.equal(cards[0].exampleSentence, "ერთი ყავა.");
  assert.equal(cards[2].term, "well-known");
  assert.equal(skipped.length, 1);

  // " // " separates the example after any term/definition separator; URLs stay intact.
  const slash = parseImport("გამარჯობა - Привет // გამარჯობა, როგორ ხარ?\nsite = сайт // see https://example.com\nput off | postpone // Don't put it off.").cards;
  assert.deepEqual(slash.map((c) => [c.term, c.definition, c.exampleSentence]), [
    ["გამარჯობა", "Привет", "გამარჯობა, როგორ ხარ?"],
    ["site", "сайт", "see https://example.com"],
    ["put off", "postpone", "Don't put it off."],
  ]);
});

test("leitner scheduling + cram never skips ahead", () => {
  assert.equal(isDue(card(1, null)), true);
  assert.equal(isDue(card(1, 0)), false);
  assert.equal(isDue(card(2, 2)), true);
  assert.equal(isDue(card(5, 400)), false);
  assert.equal(nextBox(3, "know"), 4);
  assert.equal(nextBox(3, "almost"), 3);
  assert.equal(gradeCard({ box: 2, reviews: 1, lapses: 0 }, "again").lapses, 1);
  const notDue = card(3, 1);
  assert.equal(nextProgress(notDue, "know", { goal: "cram" }), null); // no promotion
  assert.equal(nextProgress(notDue, "again", { goal: "cram" }).box, 1); // mistakes still count
  assert.equal(nextProgress(card(1, null), "know", { goal: "cram" }).box, 2); // due → normal
  assert.deepEqual(progressBreakdown([card(1, null), card(2, 1), card(5, 3)]), { notStudied: 1, learning: 1, mastered: 1, total: 3 });
});

test("backward compatibility: v1/v2 decks and backups", () => {
  const legacy = normalizeDeck("x", { name: "Old deck", cards: [{ id: "a", front: "ყავა", back: "Coffee", box: 3, lastReviewed: NOW }] });
  assert.equal(legacy.title, "Old deck");
  assert.equal(legacy.visibility, "private");
  assert.equal(legacy.editPolicy, "owner");
  assert.deepEqual(legacy.cards[0], { id: "a", term: "ყავა", definition: "Coffee", exampleSentence: "" });
  assert.equal(progressFromLegacyCard({ box: 1, lastReviewed: null }), null);
  assert.equal(progressFromLegacyCard({ box: 3, lastReviewed: NOW }).box, 3);
  const f = normalizeFolder("f", { name: "Georgian" }); // folder without deckIds/tags
  assert.deepEqual([f.deckIds, f.tags, f.visibility], [[], [], "private"]);
  const { decks } = readBackup({ decks: [{ name: "Old", cards: [{ id: "c1", front: "a", back: "b", box: 4, lastReviewed: NOW }] }] });
  assert.equal(decks[0].title, "Old");
  assert.equal(decks[0].progress.c1.box, 4);
  assert.equal(withProgress([normalizeCardContent({ id: "c1", term: "a", definition: "b" })], decks[0].progress)[0].box, 4);
  assert.throws(() => readBackup({ hello: 1 }));
});

test("rounds: memorize takes only due cards, cram takes everything, summary lists mistakes", () => {
  const deck = { id: "d", cards: [card(1, null, "new"), card(2, 2, "due"), card(3, 1, "later"), card(5, 9, "mastered")] };
  const items = toItems(deck, deck.cards);
  assert.deepEqual(buildPool(items, { goal: "memorize" }).map((i) => i.card.id).sort(), ["due", "new"]);
  assert.equal(buildPool(items, { goal: "cram" }).length, 4);
  assert.equal(buildPool(items, { goal: "cram" }).at(-1).card.id, "mastered"); // weakest first
  assert.equal(buildPool(items, { goal: "cram", exclude: new Set(["d:new"]) }).length, 3);
  assert.equal(takeRound(buildPool(items, { goal: "cram" }), 2).length, 2);

  // Portions: at most `newLimit` new cards, in deck order; cram skips mastered until all are studied.
  const big = { id: "b", cards: [...Array.from({ length: 40 }, (_, i) => card(1, null, `n${i}`)), card(2, 2, "learning"), card(5, 9, "done")] };
  const bigItems = toItems(big, big.cards);
  const memo = buildPool(bigItems, { goal: "memorize", newLimit: 15 });
  assert.equal(memo.filter((i) => i.card.lastReviewed == null).length, 15);
  assert.deepEqual(memo.filter((i) => i.card.lastReviewed == null).map((i) => i.card.id).slice(0, 2), ["n0", "n1"]);
  assert.ok(memo.some((i) => i.card.id === "learning"));
  const cram = buildPool(bigItems, { goal: "cram", newLimit: 15 }).map((i) => i.card.id);
  assert.equal(cram.length, 16); // still learning + 15 new
  assert.ok(!cram.includes("done"));
  assert.equal(buildPool(bigItems, { goal: "cram", newLimit: 0 }).length, 1); // portion used up
  const studied = toItems(big, [card(2, 2, "a"), card(5, 9, "b")]);
  assert.equal(buildPool(studied, { goal: "cram", newLimit: 15 }).length, 2); // no new left → whole deck
  const s = summarizeRound([{ item: items[0], grade: "know" }, { item: items[1], grade: "again" }, { item: items[2], grade: "almost" }]);
  assert.deepEqual([s.total, s.correct, s.almost, s.mistakes.length, s.accuracy], [3, 2, 1, 1, 67]);
});

test("daily goal and streak", () => {
  const goal = { type: "rounds", value: 2 };
  const today = "2026-10-23";
  const yesterday = addDaysToKey(today, -1);
  assert.equal(yesterday, "2026-10-22");
  const profile = { currentStreak: 4, longestStreak: 4, lastStudyDate: yesterday };
  let p = applyActivity(profile, { rounds: 1 }, goal, today);
  assert.equal(p.justMetGoal, undefined);
  p = applyActivity({ ...profile, ...p }, { rounds: 1 }, goal, today);
  assert.equal(p.justMetGoal, true);
  assert.equal(p.currentStreak, 5);
  assert.equal(p.longestStreak, 5);
  // met twice the same day → no double count
  const again = applyActivity({ ...profile, ...p }, { rounds: 1 }, goal, today);
  assert.equal(again.currentStreak, undefined);
  // broken streak restarts at 1
  assert.equal(applyActivity({ currentStreak: 9, lastStudyDate: "2026-10-01" }, { rounds: 2 }, goal, today).currentStreak, 1);
  assert.equal(displayedStreak({ currentStreak: 9, lastStudyDate: "2026-10-01" }, today), 0);
  // minutes goal counts seconds
  const st = goalStatus({ type: "minutes", value: 15 }, { seconds: 600, rounds: 0 });
  assert.deepEqual([st.done, st.met, st.remaining], [10, false, 5]);
  assert.match(motivationPhrase({ status: goalStatus(goal, { seconds: 10, rounds: 1 }), streak: 2, todayKey: today }), /раунд/);
  assert.match(motivationPhrase({ status: goalStatus(goal, { seconds: 0, rounds: 0 }), streak: 7, todayKey: today }), /7 дней/);
});

test("smart reminders: only when the goal is not met, at the chosen hour, once", () => {
  const now = new Date("2026-10-23T16:00:00Z"); // 20:00 in Tbilisi (UTC+4)
  const user = {
    settings: { dailyGoal: { type: "rounds", value: 3 }, notify: { enabled: true, schedule: "evening", timezone: "Asia/Tbilisi", localHours: [20] } },
    currentStreak: 5,
    lastStudyDate: "2026-10-22",
    dailyProgress: { date: "2026-10-22", rounds: 3, seconds: 0 },
  };
  const d = decideReminder(user, now, () => 0);
  assert.equal(d.send, true);
  assert.equal(d.message, PUSH_MESSAGES[0]); // streak at risk
  assert.equal(decideReminder({ ...user, notifyState: { lastSentKey: d.slotKey } }, now).send, false);
  assert.equal(decideReminder({ ...user, dailyProgress: { date: "2026-10-23", rounds: 3 } }, now).send, false); // goal met
  assert.equal(decideReminder(user, new Date("2026-10-23T10:00:00Z")).send, false); // 14:00 local
  assert.equal(decideReminder({ ...user, currentStreak: 0, lastStudyDate: null, dailyProgress: { date: "2026-10-23", rounds: 1 } }, now, () => 0).message, PUSH_MESSAGES[3]);
  assert.equal(decideReminder({ ...user, currentStreak: 0, lastStudyDate: null, dailyProgress: { date: "2026-10-10", rounds: 1 } }, now, () => 0).message, PUSH_MESSAGES[4]);
  assert.deepEqual(localHoursToUtcHours([9, 20], { getTimezoneOffset: () => -240 }), [5, 16]);
  // English interface → English reminder, same situation index.
  const en = { ...user, settings: { ...user.settings, language: "en" } };
  assert.equal(decideReminder(en, now, () => 0).message, PUSH_MESSAGES_EN[0]);
  assert.equal(PUSH_MESSAGES_EN.length, PUSH_MESSAGES.length);
});

test("cloud speech: Georgian voice and a stable cache key shared by app and function", async () => {
  assert.equal(voiceFor("ka-GE"), "ka-GE-EkaNeural");
  assert.equal(voiceFor("xx-XX"), null);
  const a = await ttsCacheKey("  გამარჯობა ", "ka-GE");
  assert.equal(a, await ttsCacheKey("გამარჯობა", "ka-GE"));
  assert.notEqual(a, await ttsCacheKey("გამარჯობა", "en-US"));
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("v2 profile backfill rebuilds the streak from the review log", () => {
  const today = new Date();
  const k = (n) => addDaysToKey(new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10), n);
  const patch = profileBackfill({ log: { [k(0)]: 5, [k(-1)]: 3, [k(-3)]: 1 }, settings: { activeDeckId: "d1" } }, today);
  assert.equal(patch.currentStreak, 2);
  assert.equal(patch.settings.lastStudy.id, "d1");
  assert.equal(profileBackfill({ schemaVersion: 3 }), null);
});

test("example sentence matching and text export", () => {
  assert.deepEqual(splitOnTerm("She looks after him", "look after").filter((p) => p.hit).map((p) => p.text), ["looks after"]);
  const deck = { cards: [{ term: "a,b", definition: 'say "hi"', exampleSentence: "" }] };
  assert.equal(deckToText(deck, "csv").split("\r\n")[1], '"a,b","say ""hi""",'); // empty example column
  assert.equal(deckToText({ cards: [{ term: "t", definition: "d", exampleSentence: "e" }] }, "txt"), "t\td\te");
});
