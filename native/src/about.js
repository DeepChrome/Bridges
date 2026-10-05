/* What the learner is looking at, for a tester's report (the owner,
 * 2026-10-05: "The feedback screens will obviously associate with whatever
 * screen/exercise/component is being accessed at the time of submission so
 * the feedback is traceable").
 *
 * The route says which screen; this says which question. A screen that shows
 * one thing at a time — the runner, a lesson card, a flashcard — calls
 * `useAbout(describe(...))` with what is on screen now, and the header's flag
 * reads `currentAbout()` at the moment it is pressed. Nothing is stored and
 * nothing leaves the phone except inside a report the tester sends. */

import { useEffect } from "react";
import { L } from "./data";

let current = null;
let seq = 0;

export const currentAbout = () => current;

/* Register `about` while the calling screen shows it; the newest wins, and a
   screen leaving clears only what it set. */
export function useAbout(about) {
  const key = about ? JSON.stringify(about) : "";
  useEffect(() => {
    if (!about) return undefined;
    const mine = ++seq;
    current = { ...about, seq: mine };
    return () => { if (current && current.seq === mine) current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

const short = (s) => (typeof s === "string" ? s.slice(0, 300) : undefined);
const label = (o) => (o && typeof o === "object" ? o.label || o.ru || o.en || o.text : o);

/* One question or card, as a reviewer needs it: its kind, what it asked, the
   right answer, the options offered, and the word behind it by its Russian
   (rule 20.4: never an index, which a rebuild moves). */
export function describe(q) {
  if (!q || typeof q !== "object") return null;
  const word = typeof q.i === "number" && L[q.i] ? L[q.i].b : undefined;
  const right = Array.isArray(q.options) ? q.options.filter((o) => o && o.right).map(label) : [];
  return {
    kind: q.kind || q.t || undefined,
    word,
    prompt: short(q.prompt) || short(q.ru) || undefined,
    ask: short(q.ask) || short(q.hint) || undefined,
    answer: short(q.answer) || short(q.target) || (right.length ? right.join(" / ") : undefined) || short(q.en) || undefined,
    options: Array.isArray(q.options) ? q.options.map(label).map(short).slice(0, 6) : undefined,
    unit: q.unit || undefined,
  };
}
