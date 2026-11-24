/* The regression the owner filed on 2026-11-23, against the live API: "What
 * gender is время and what is its genitive?", grounded the way the app grounds
 * it (native/src/groundask.js), on the ask route's model. Passes when the
 * answer says neuter, «времени», and the -мя nouns, and writes no Russian the
 * table does not hold.
 *
 *   node backend/eval/ask_vremya.mjs [model] [effort]
 *
 * Reads ANTHROPIC_API_KEY from the environment or backend/.dev.vars; prints
 * neither. About a cent a run. */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SYSTEM_ASK, askMessage, validateAsk } from "../src/ask.js";

const here = dirname(fileURLToPath(import.meta.url));
const key = process.env.ANTHROPIC_API_KEY || (() => {
  try { return (readFileSync(join(here, "..", ".dev.vars"), "utf8").match(/^ANTHROPIC_API_KEY=(.+)$/m) || [])[1].trim(); }
  catch { return null; }
})();
if (!key) { console.error("no ANTHROPIC_API_KEY"); process.exit(2); }
const model = process.argv[2] || "claude-opus-5-5";
const effort = process.argv[3] || "low";

const TABLE = "Declension: Singular | Plural\nNominative: вре́мя | времена́\nGenitive: вре́мени | времён\n"
  + "Dative: вре́мени | времена́м\nAccusative: вре́мя | времена́\nInstrumental: вре́менем | времена́ми\n"
  + "Prepositional: вре́мени | времена́х";
const CASES = [
  { question: "What are the general rules for genitive case in terms of ending. Like I thought время was feminine so it would be врем or времы",
    dictionary: [{ asked: "время", word: "вре́мя", pos: "noun", gender: "neuter", form: "Nominative singular",
                   facts: ["Neuter: nouns in -мя are neuter, a small group of their own."], tables: TABLE },
                 { asked: "врем", word: "врать", pos: "verb", form: "Present / Future · мы",
                   tables: "Present / Future: Form\nя: вру\nмы: врём" }],
    notWords: ["времы"] },
  { question: "What gender is время and what is its genitive?",
    dictionary: [{ asked: "время", word: "вре́мя", pos: "noun", gender: "neuter", form: "Nominative singular",
                   facts: ["Neuter: nouns in -мя are neuter, a small group of their own."], tables: TABLE }] },
];

let failed = 0;
for (const c of CASES) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01",
               "anthropic-beta": "server-side-fallback-2026-07-01" },
    body: JSON.stringify({ model, max_tokens: 3000, output_config: { effort }, ...(/haiku/.test(model) ? {} : { fallbacks: "default" }),
      system: SYSTEM_ASK, messages: [{ role: "user", content: askMessage({ ...c, level: "beginner", chapter: 3 }) }] }),
  });
  const body = await r.json();
  if (!r.ok) { console.log("HTTP", r.status, JSON.stringify(body).slice(0, 300)); failed++; continue; }
  const text = (body.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  const v = m ? validateAsk(JSON.parse(m[0])) : { ok: false };
  const answer = v.ok ? v.value.answer : text;
  const plain = answer.normalize("NFD").replace(/[̀́]/g, "").normalize("NFC").toLowerCase();
  const checks = { neuter: /neuter/.test(plain), genitive: /времени/.test(plain), mya: /мя(?![а-я])/.test(plain),
                   noVreme: !/време(?![а-я])/.test(plain) };
  const pass = Object.values(checks).every(Boolean);
  if (!pass) failed++;
  console.log(`${pass ? "PASS" : "FAIL"} ${JSON.stringify(checks)}  in ${body.usage.input_tokens} out ${body.usage.output_tokens}`);
  console.log("  " + answer);
}
process.exit(failed ? 1 : 0);
