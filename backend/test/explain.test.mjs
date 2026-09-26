/* POST /v1/explain — why a wrong answer was wrong (2026-09-26).
 *
 * The reply is two short fields rather than a paragraph: the owner read the
 * first, 55-word version on his phone as "a large ugly verbose block of text".
 * What is asserted is the caps, the guillemets the renderer depends on, and
 * that an answer that is not a word leaves `yours` empty.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateExplain, explainMessage, SYSTEM_EXPLAIN, WHY_WORDS, YOURS_WORDS } from "../src/explain.js";
import { handle } from "../src/index.js";

const TOKEN = "test-app-token-0123456789";
function fakeKv() {
  const store = new Map();
  return { store, async get(k) { return store.has(k) ? store.get(k) : null; }, async put(k, v) { store.set(k, v); } };
}
const env = (over = {}) => ({ APP_TOKEN: TOKEN, ANTHROPIC_API_KEY: "sk-test", MODEL: "m",
  DAILY_CAP: "300", USAGE: fakeKv(), ...over });
const req = (body, headers = {}) => new Request("https://x/v1/explain", {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const auth = { authorization: `Bearer ${TOKEN}` };
const upstream = (texts) => {
  const calls = [];
  return { calls, fetch: async (url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ content: [{ type: "text", text: texts[Math.min(calls.length - 1, texts.length - 1)] }],
      usage: { input_tokens: 40, output_tokens: 20 } }), { status: 200 });
  } };
};

test("two short lines pass, dashes come off, and the learner's own form is optional", () => {
  const r = validateExplain({ why: "«книги» is the genitive — «нет» always takes it.",
                              yours: "«книгу» is the accusative." });
  assert.equal(r.ok, true);
  assert.equal(/—/.test(r.value.why), false);
  assert.match(r.value.why, /«книги»/);
  assert.equal(r.value.yours, "«книгу» is the accusative.");
  // An answer that is not a Russian word leaves it empty, and absent is empty.
  assert.equal(validateExplain({ why: "Genitive after «нет»." }).value.yours, "");
});

test("a verbose reply is refused, which is what keeps it short", () => {
  assert.match(validateExplain({ why: new Array(WHY_WORDS + 1).fill("w").join(" ") }).errors.join(" "), /why: over/);
  assert.match(validateExplain({ why: "ok", yours: new Array(YOURS_WORDS + 1).fill("w").join(" ") }).errors.join(" "),
               /yours: over/);
  assert.match(validateExplain({ yours: "x" }).errors.join(" "), /why: missing/);
  assert.equal(validateExplain("nope").ok, false);
  assert.ok(WHY_WORDS <= 24, "one sentence, not a paragraph");
});

/* The rules that make this an explanation rather than a second verdict, and
   the guillemets the app's renderer sets apart (ui.js `Marked`). */
test("the prompt explains without grading, and asks for «guillemets»", () => {
  assert.match(SYSTEM_EXPLAIN, /Do not praise/);
  assert.match(SYSTEM_EXPLAIN, /do not ask a question/);
  assert.match(SYSTEM_EXPLAIN, /Never write Russian without them/);
  assert.match(SYSTEM_EXPLAIN, /Only when "said" is itself a real Russian form/);
  const m = JSON.parse(explainMessage({ kind: "cases", ask: "Write genitive singular", prompt: "книга",
                                        sub: "book", answer: "книги", said: "книгу", rule: "The genitive" }));
  assert.deepEqual(m, { kind: "cases", ask: "Write genitive singular", prompt: "книга", sub: "book",
                        answer: "книги", said: "книгу", rule: "The genitive" });
  // Nothing given is null, not the string "undefined".
  assert.equal(JSON.parse(explainMessage({ ask: "x", answer: "y" })).said, null);
});

test("POST /v1/explain: 401 without a token, 400 without an answer, the reply through, feedback cap", async () => {
  assert.equal((await handle(req({ ask: "a", answer: "b" }), env())).status, 401);
  assert.equal((await handle(req({ ask: "a" }, auth), env())).status, 400);
  const up = upstream([JSON.stringify({ why: "Genitive after «нет».", yours: "" })]);
  const r = await handle(req({ kind: "cases", ask: "Write", prompt: "книга", answer: "книги", said: "книгу" }, auth),
                         env(), { fetch: up.fetch });
  const body = await r.json();
  assert.equal(body.ok, true);
  assert.equal(body.why, "Genitive after «нет».");
  assert.equal(body.yours, "");
  assert.equal(up.calls[0].max_tokens, 250);
  assert.match(up.calls[0].messages[0].content, /книгу/);

  const e = env({ DAILY_CAP: "1" });
  assert.equal((await handle(req({ ask: "a", answer: "b" }, auth), e, { fetch: up.fetch })).status, 200);
  assert.equal((await handle(req({ ask: "a", answer: "b" }, auth), e, { fetch: up.fetch })).status, 429);
});
