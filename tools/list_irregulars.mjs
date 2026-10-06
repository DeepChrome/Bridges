#!/usr/bin/env node
/* Every taught word core/facts.js calls irregular, with why — to read after
 * touching `irregularities` (the owner, 2026-10-05: "there's probably a lot
 * of these so inspect other words").
 *
 *   node tools/list_irregulars.mjs */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPayload } from "./payload.mjs";
import { makeHydrator, makeDeepIndex } from "../core/entry.js";
import { parseDeep } from "../core/search.js";
import { irregularities } from "../core/facts.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = loadPayload(ROOT);
const L = data.lemmas;
const DEEP = makeDeepIndex(parseDeep(data.deep || ""));
L.forEach(makeHydrator({ deepIndex: () => DEEP, shapes: data.shapes, slots: data.slots, sent: data.sent }));
const taught = new Set(data.units.flatMap((u) => u.w));
let n = 0;
for (const i of [...taught].sort((a, b) => a - b)) {
  const ir = irregularities(L[i]);
  if (!ir.length) continue;
  n++;
  console.log(`${L[i].b} (${L[i].p}): ${ir.map((x) => `${x.label} — ${x.note}`).join(" | ")}`);
}
console.log(`${n} of ${taught.size} taught words irregular`);
