/* The chapter-end task route (ROADMAP P10.5).
 *
 * The validator's job here is narrower than the feedback one's and more
 * important: the model is being asked to judge a learner's attempt against a
 * fixed list of requirements, and every way it can quietly change that list —
 * renaming one, dropping one, judging one twice, or adding one of its own — is
 * a way of marking a learner against something nobody set.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTask, taskMessage, SYSTEM_TASK } from "../src/task.js";
import { TASKS, taskFor, taskForUnit, MAX_SENTENCES } from "../../core/tasks.js";

const must = ["your own name", "that this other person is not you"];
const good = () => ({
  points: [
    { must: must[0], met: true, note: "" },
    { must: must[1], met: true, note: "" },
  ],
  grammar: [],
  praise: "Clear and to the point.",
});

test("a well-formed marking passes, and done is derived rather than asked for", () => {
  const r = validateTask(good(), must);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.value.done, true);
});

test("one requirement missed is not done", () => {
  const g = good();
  g.points[1].met = false;
  g.points[1].note = "No second person mentioned.";
  const r = validateTask(g, must);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.value.done, false);
});

test("a requirement the model invented is refused", () => {
  const g = good();
  g.points.push({ must: "correct use of the accusative", met: false, note: "" });
  assert.match(validateTask(g, must).errors.join("\n"), /not one of the requirements given/);
});

test("a requirement quietly dropped is refused", () => {
  const g = good();
  g.points.pop();
  assert.match(validateTask(g, must).errors.join("\n"), /nothing said about/);
});

test("a requirement judged twice is refused", () => {
  const g = good();
  g.points[1] = { must: must[0], met: false, note: "" };
  assert.match(validateTask(g, must).errors.join("\n"), /judged twice/);
});

test("an unknown grammar tag is refused, and notes are capped", () => {
  const g = good();
  g.grammar = [{ tag: "VIBES", note: "off" }];
  assert.match(validateTask(g, must).errors.join("\n"), /unknown tag/);
  const h = good();
  h.grammar = [{ tag: "CASE", note: Array(30).fill("word").join(" ") }];
  assert.match(validateTask(h, must).errors.join("\n"), /over 20 words/);
});

test("praise is capped and dashes never reach the app", () => {
  const g = good();
  g.praise = Array(20).fill("good").join(" ");
  assert.match(validateTask(g, must).errors.join("\n"), /over 12 words/);
  const h = good();
  h.praise = "Clear - and to the point";
  assert.ok(!validateTask(h, must).value.praise.includes("-"));
});

test("absent grammar is an empty list, not a failure", () => {
  const g = good();
  delete g.grammar;
  const r = validateTask(g, must);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.value.grammar, []);
});

test("the message carries the goal, the requirements and the studied words", () => {
  const m = taskMessage({ goal: "Say who you are.", must, attempt: "Это я.",
                          studied: ["я", "это"], chapter: 1 });
  assert.match(m, /Say who you are\./);
  must.forEach((x) => assert.match(m, new RegExp(x)));
  assert.match(m, /Это я\./);
  assert.match(m, /я, это/);
});

test("the prompt tells the model to judge the goal and not to reach past what was taught", () => {
  assert.match(SYSTEM_TASK, /Judge the goal, not the grammar/);
  assert.match(SYSTEM_TASK, /Do not invent further requirements/);
  assert.match(SYSTEM_TASK, /never been taught/);
});

test("every chapter has a task, and none of them writes any Russian", () => {
  assert.equal(TASKS.length, 10);
  TASKS.forEach((t, i) => {
    assert.equal(t.chapter, i + 1);
    assert.ok(t.goal && t.title && t.unit);
    assert.ok(t.must.length >= 2 && t.must.length <= 3, `${t.unit}: ${t.must.length} requirements`);
    // No Cyrillic anywhere in the file: the goal is in English and the doing is
    // in Russian, which is what keeps this clear of §30a entirely.
    const text = [t.title, t.goal].concat(t.must).join(" ");
    assert.ok(!/[а-яё]/i.test(text), `${t.unit} writes Russian`);
  });
  assert.equal(taskFor(3).unit, "core3");
  assert.equal(taskForUnit("core3").chapter, 3);
  assert.equal(taskFor(99), null);
  // A chapter-1 learner has thirty words of Russian; asking for four sentences
  // would be asking them to fail.
  assert.ok(MAX_SENTENCES(1) < MAX_SENTENCES(10));
});
