/* POST /v1/translate — speak Russian, read it back in English (2026-09-22).
 *
 * What is worth testing here is the one rule that makes this a tool rather
 * than a lesson: it translates what was *said*, it does not repair it. The
 * validator cannot enforce that on its own (only the prompt can ask for it),
 * so what is asserted is the prompt's instruction, the caps, and the route.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTranslate, translateMessage, SYSTEM_TRANSLATE } from "../src/translate.js";
import { handle } from "../src/index.js";

const TOKEN = "test-app-token-0123456789";
function fakeKv() {
  const store = new Map();
  return { store, async get(k) { return store.has(k) ? store.get(k) : null; }, async put(k, v) { store.set(k, v); } };
}
const env = (over = {}) => ({ APP_TOKEN: TOKEN, ANTHROPIC_API_KEY: "sk-test", MODEL: "m",
  DAILY_CAP: "300", USAGE: fakeKv(), ...over });
const req = (body, headers = {}) => new Request("https://x/v1/translate", {
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

test("a translation with nothing to remark on passes, note and all", () => {
  const r = validateTranslate({ en: "I want tea." });
  assert.equal(r.ok, true);
  assert.equal(r.value.en, "I want tea.");
  assert.equal(r.value.note, "");            // absent is empty, not a failure
});

test("a translation that runs on is refused, and so is a long note", () => {
  const long = new Array(61).fill("word").join(" ");
  assert.match(validateTranslate({ en: long }).errors.join(" "), /over 60 words/);
  assert.match(validateTranslate({ en: "ok", note: long }).errors.join(" "), /over 12 words/);
  assert.match(validateTranslate({ note: "x" }).errors.join(" "), /en: not a string/);
  assert.equal(validateTranslate("nope").ok, false);
});

test("dashes never reach the app", () => {
  const r = validateTranslate({ en: "I want tea — strong tea.", note: "heard as — maybe" });
  assert.equal(r.ok, true);
  assert.equal(/—/.test(r.value.en + r.value.note), false);
});

/* The rule the whole feature turns on. A learner using this as a phrasebook is
   badly served by an answer that quietly repairs their Russian and translates
   the repair: they would never learn they had said something else. */
test("the prompt says to translate what was said and not to correct it, teach or praise", () => {
  assert.match(SYSTEM_TRANSLATE, /Do not correct it/i);
  assert.match(SYSTEM_TRANSLATE, /No teaching, no praise/i);
  assert.match(SYSTEM_TRANSLATE, /no punctuation and no capitals/i);
  assert.equal(translateMessage({ ru: " я хочу чай " }), "Transcript: я хочу чай");
});

test("POST /v1/translate: 401 without a token, 400 without Russian, and the answer through", async () => {
  assert.equal((await handle(req({ ru: "я хочу чай" }), env())).status, 401);
  assert.equal((await handle(req({ ru: "   " }, auth), env())).status, 400);

  const up = upstream([JSON.stringify({ en: "I want tea.", note: "" })]);
  const r = await handle(req({ ru: "я хочу чай" }, auth), env(), { fetch: up.fetch });
  const body = await r.json();
  assert.equal(body.ok, true);
  assert.equal(body.en, "I want tea.");
  assert.equal(up.calls[0].max_tokens, 300);
  assert.match(up.calls[0].messages[0].content, /я хочу чай/);
});

/* It shares the feedback counter, so it is bounded by a budget that already
   exists rather than by a new one nobody set. */
test("it counts against the feedback cap", async () => {
  const e = env({ DAILY_CAP: "1" });
  const up = upstream([JSON.stringify({ en: "Tea." })]);
  assert.equal((await handle(req({ ru: "чай" }, auth), e, { fetch: up.fetch })).status, 200);
  const second = await handle(req({ ru: "чай" }, auth), e, { fetch: up.fetch });
  assert.equal(second.status, 429);
});
