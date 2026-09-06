/* The reply validator: what gets through to the app, and what is refused. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, extractJson } from "../src/schema.js";

const good = () => ({
  words: [
    { said: "я", expected: "я", lemma: "я", status: "ok", tags: [] },
    { said: "читаю", expected: "читаю", lemma: "читать", status: "ok", tags: [] },
    { said: "книга", expected: "книгу", lemma: "книга", status: "sub", tags: ["CASE"] },
  ],
  grammar: [{ tag: "CASE", note: "«книгу» — accusative after «читать», not nominative «книга»." }],
  wordChoice: [],
  overall: "minor",
  praise: "Good verb form.",
});

test("a well-formed reply passes and is returned trimmed to the schema", () => {
  const r = validate({ ...good(), extra: "ignored" });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.value).sort(), ["grammar", "overall", "praise", "wordChoice", "words"]);
});

test("an unknown tag on a word is refused, by name", () => {
  const g = good(); g.words[2].tags = ["CASE", "SPELLING"];
  const r = validate(g);
  assert.equal(r.ok, false);
  assert.match(r.errors.join("\n"), /unknown tag "SPELLING"/);
});

test("an unknown grammar tag is refused", () => {
  const g = good(); g.grammar[0].tag = "case";
  assert.equal(validate(g).ok, false);
});

test("a status outside ok|sub|del|ins is refused", () => {
  const g = good(); g.words[0].status = "wrong";
  assert.match(validate(g).errors.join("\n"), /words\[0\]\.status/);
});

test("a note over twenty words is refused", () => {
  const g = good();
  g.grammar[0].note = Array.from({ length: 21 }, (_, i) => `w${i}`).join(" ");
  assert.match(validate(g).errors.join("\n"), /grammar\[0\]\.note: over 20 words/);
});

test("praise over twelve words is refused; missing praise becomes empty", () => {
  const g = good(); g.praise = Array.from({ length: 13 }, () => "nice").join(" ");
  assert.equal(validate(g).ok, false);
  const h = good(); delete h.praise;
  const r = validate(h);
  assert.equal(r.ok, true);
  assert.equal(r.value.praise, "");
});

test("overall must be ok|minor|major", () => {
  const g = good(); g.overall = "great";
  assert.match(validate(g).errors.join("\n"), /overall/);
});

test("said and expected may be null for del and ins, but lemma must be a string", () => {
  const g = good();
  g.words.push({ said: null, expected: "сегодня", lemma: "сегодня", status: "del", tags: ["MISSING_WORD"] });
  g.words.push({ said: "очень", expected: null, lemma: "очень", status: "ins", tags: ["EXTRA_WORD"] });
  assert.equal(validate(g).ok, true);
  g.words[0].lemma = null;
  assert.match(validate(g).errors.join("\n"), /words\[0\]\.lemma/);
});

test("a non-object, or arrays where objects belong, is refused without throwing", () => {
  assert.equal(validate(null).ok, false);
  assert.equal(validate([]).ok, false);
  assert.equal(validate("{}").ok, false);
  const g = good(); g.words = [null, 3];
  const r = validate(g);
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 2);
});

test("extractJson takes the outermost object out of prose or fences", () => {
  assert.deepEqual(extractJson("Here you go:\n```json\n{\"a\":1}\n```"), { a: 1 });
  assert.deepEqual(extractJson("{\"a\":{\"b\":2}} trailing"), { a: { b: 2 } });
  assert.equal(extractJson("no json here"), null);
  assert.equal(extractJson("{broken"), null);
  assert.equal(extractJson(undefined), null);
});
