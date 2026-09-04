/* Paradigms, rebuilt on the way in.
 *
 * The payload no longer carries rendered tables. It carries the endings once — about
 * three thousand distinct sets cover all 41,087 paradigms, because Russian endings
 * repeat — plus, per lemma, a stem length, a shape id and one character of stress per
 * form. That is what makes it affordable to give *every* dictionary entry its
 * declension or conjugation rather than only the four thousand the curriculum
 * teaches: 19 MB of tables becomes under 2 MB.
 *
 * The layout below mirrors build_tables() in tools/panel.py, which still owns it for
 * the CLI. Two implementations of the same thing is a drift risk, so the build emits
 * a sample of Python-built tables and core.test.mjs asserts this file reproduces them
 * exactly. Change one, run the suite.
 */

/* Names here are prefixed because the web build concatenates every core file and
   every app script into one classic script scope — a bare `cells` or `SHORT`
   collides with drills.js and app.js, and the whole page dies with a
   "already been declared" SyntaxError on load. */
const PAR_ACUTE = "́";
const PAR_B36 = "0123456789abcdefghijklmnopqrstuvwxyz";

const PAR_CASES = [["nom", "Nominative"], ["gen", "Genitive"], ["dat", "Dative"],
                   ["acc", "Accusative"], ["inst", "Instrumental"],
                   ["prep", "Prepositional"]];

const PAR_PERSONS = [["sg1", "я"], ["sg2", "ты"], ["sg3", "он / она"],
                     ["pl1", "мы"], ["pl2", "вы"], ["pl3", "они"]];

const PAR_PAST = [["past_m", "он"], ["past_f", "она"], ["past_n", "оно"],
                  ["past_pl", "они"]];

const PAR_SHORT = [["short_m", "m"], ["short_f", "f"], ["short_n", "n"],
                   ["short_pl", "pl"]];

/* One shape per line: "slotIndex:ending/ending<TAB>slotIndex:ending…" */
export function decodeShapes(blob) {
  if (!blob) return [];
  return blob.split("\n").map((line) => {
    if (!line) return [];
    return line.split("\t").map((cell) => {
      const at = cell.indexOf(":");
      const si = parseInt(cell.slice(0, at), 10);
      const rest = cell.slice(at + 1);
      return [si, rest === "" ? [""] : rest.split("/")];
    });
  });
}

const parStress = (flat, mark) => {
  if (mark === "-" || mark === undefined) return flat;
  const at = PAR_B36.indexOf(mark);
  if (at < 0 || at >= flat.length) return flat;
  return flat.slice(0, at + 1) + PAR_ACUTE + flat.slice(at + 1);
};

/* slot name -> accented forms, rebuilt from the compressed record. */
export function slotsOf(rec, shapes, slotNames) {
  if (!rec || rec.shape === "" || rec.shape === undefined) return {};
  const shape = shapes[Number(rec.shape)];
  if (!shape) return {};
  const stem = rec.b.slice(0, Math.max(0, PAR_B36.indexOf(rec.stem || "0")));
  const marks = rec.stress || "";
  const overrides = {};
  for (const o of (rec.over || "").split(";")) {
    if (!o) continue;
    const eq = o.indexOf("=");
    overrides[o.slice(0, eq)] = o.slice(eq + 1);
  }

  const out = {};
  let m = 0;
  for (const [si, endings] of shape) {
    const name = slotNames[si];
    const forms = [];
    for (let k = 0; k < endings.length; k++) {
      const key = si + "." + k;
      forms.push(key in overrides
        ? overrides[key]
        : parStress(stem + endings[k], marks[m]));
      m++;
    }
    if (name) out[name] = forms;
  }
  return out;
}

const parCells = (slots, slot) => slots[slot] || [];

const parTable = (title, columns, rows) => {
  const kept = rows.filter((r) => r.slice(1).some((c) => c && c.length));
  return kept.length ? { title, columns, rows: kept } : null;
};

/* Same tables panel.py builds, from the same slots. */
export function buildTables(pos, slots) {
  const tables = [];
  const add = (t) => { if (t) tables.push(t); };

  if (pos === "noun") {
    add(parTable("Declension", ["Case", "Singular", "Plural"],
      PAR_CASES.map(([c, label]) =>
        [label, parCells(slots, `sg_${c}`), parCells(slots, `pl_${c}`)])));
  } else if (pos === "adjective" || pos === "possessive" || pos === "numeral") {
    add(parTable("Declension",
      ["Case", "Masculine", "Feminine", "Neuter", "Plural"],
      PAR_CASES.map(([c, label]) =>
        [label].concat(["m", "f", "n", "pl"]
          .map((g) => parCells(slots, `decl_${g}_${c}`))))));
    add(parTable("Short form", ["", "Form"],
      PAR_SHORT.map(([s, label]) => [label, parCells(slots, s)])));
    add(parTable("Comparison", ["", "Form"],
      [["Comparative", parCells(slots, "comparative")],
       ["Superlative", parCells(slots, "superlative")]]));
  } else if (pos === "verb") {
    add(parTable("Present / Future", ["Person", "Form"],
      PAR_PERSONS.map(([p, label]) => [label, parCells(slots, `presfut_${p}`)])));
    add(parTable("Past", ["Subject", "Form"],
      PAR_PAST.map(([s, label]) => [label, parCells(slots, s)])));
    add(parTable("Imperative", ["", "Form"],
      [["ты", parCells(slots, "imperative_sg")],
       ["вы", parCells(slots, "imperative_pl")]]));
  } else if (pos === "pronoun") {
    add(parTable("Declension", ["Case", "Form"],
      PAR_CASES.map(([c, label]) => [label, parCells(slots, c)])));
  }

  // Anything the shaped tables did not consume (e.g. preposition variants).
  if (slots.variant && slots.variant.length) {
    tables.push({ title: "Variants", columns: ["", "Form"],
                  rows: [["before consonant clusters", slots.variant]] });
  }
  return tables;
}
