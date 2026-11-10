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
import { L, unitById, videoById } from "./data";
import { navRef } from "./words";

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

/* The screen the learner is on at this moment, read off the navigator: its
   route, title, unit, lesson, the video open, the plain params that say what
   it shows, and the question or card it has registered. What the report flag
   attaches to a report and the AI button sends with a question — one reading,
   so the two cannot describe the screen differently. */
export function screenAbout() {
  const r = navRef.isReady && navRef.isReady() && navRef.getCurrentRoute ? navRef.getCurrentRoute() : null;
  const opts = navRef.getCurrentOptions ? navRef.getCurrentOptions() || {} : {};
  const params = (r && r.params) || {};
  const keep = {};
  for (const k of ["unitId", "index", "videoId", "type", "round", "word", "key", "topic", "section", "title", "caseId", "mode"]) {
    if (params[k] !== undefined && typeof params[k] !== "object") keep[k] = params[k];
  }
  const unit = params.unitId ? unitById(params.unitId) : null;
  const vid = params.videoId ? videoById(params.videoId) : r && r.name === "Video" && unit && unit.v ? unit.v : null;
  return {
    screen: r ? r.name : null,
    title: typeof opts.title === "string" ? opts.title : undefined,
    unit: unit ? unit.name : undefined,
    lesson: typeof params.index === "number" ? params.index + 1 : undefined,
    video: vid ? vid.title : undefined,
    params: keep,
    question: current ? { ...current, seq: undefined } : undefined,
  };
}

/* What a flashcard's back or a dictionary entry lays out, in the order it lays
   it out: the meanings (each with the example drawn under it) and the example
   sentences. `max` is how many senses the screen numbers (a card shows four,
   an entry all of them), so "the second meaning" means the same to the model
   as to the eye. A sentence card is its sentence and its meaning. */
export function cardAbout(face, senses, { maxSenses = 4, maxExamples = 3 } = {}) {
  if (!face) return undefined;
  if (face.sentence) return { word: face.b, sentence: face.w, meaning: face.e || undefined };
  const list = (senses || []).slice(0, maxSenses).map((s) => {
    const ex = (s.x || [])[0];
    return { g: s.g, ru: ex ? ex.ru : undefined, en: ex ? ex.en : undefined };
  });
  const examples = (face.x || []).slice(0, maxExamples).map((x) => ({ ru: x.ru, en: x.en }));
  if (!list.length && !examples.length) return undefined;
  return { word: face.b, senses: list, examples };
}

/* The most a screen's running text sends: a conversation's lines, a rule card,
   a word list. Enough to answer "what did she say in line three?"; a cap so a
   question never costs more than its answer. */
const TEXT_CHARS = 1500;
const text = (lines) => {
  const s = (lines || []).filter(Boolean).join("\n");
  return s ? s.slice(0, TEXT_CHARS) : undefined;
};

/* A grammar card as the AI reads it: its title, its rule, its table row by
   row, and its examples with their English (lesson.js GrammarNote draws the
   same note). The tester, 2026-11-10: "the AI assist can't always reference
   the screen that prompted it" — a rule card registered only its kind. */
export function noteText(note) {
  if (!note) return undefined;
  const table = note.table
    ? [(note.table.columns || []).join(" | ")].concat((note.table.rows || []).map((r) => (r || []).join(" | ")))
    : [];
  const examples = (note.examples || []).map((ex) => (Array.isArray(ex) ? ex.filter(Boolean).join(" — ") : ex));
  return text([note.title, note.body, ...table, ...examples]);
}

/* A conversation or passage: who said what, with the English where there is
   one. */
export function linesText(lines) {
  return text((lines || []).map((l) => {
    if (!l) return null;
    const who = l.who || l.speaker;
    return `${who ? `${who}: ` : ""}${l.ru || ""}${l.en ? ` — ${l.en}` : ""}`;
  }));
}

/* One question or card, as a reviewer needs it: its kind, what it asked, the
   right answer, the options offered, and the word behind it by its Russian
   (rule 20.4: never an index, which a rebuild moves). A scene carries its
   lines too, so a question about the conversation is about this one. */
export function describe(q) {
  if (!q || typeof q !== "object") return null;
  const word = typeof q.i === "number" && L[q.i] ? L[q.i].b : undefined;
  const right = Array.isArray(q.options) ? q.options.filter((o) => o && o.right).map(label) : [];
  return {
    kind: q.kind || q.t || undefined,
    word,
    prompt: short(q.prompt) || short(q.ru) || undefined,
    sub: short(q.sub) || undefined,
    ask: short(q.ask) || short(q.hint) || undefined,
    answer: short(q.answer) || short(q.target) || (right.length ? right.join(" / ") : undefined) || short(q.en) || undefined,
    options: Array.isArray(q.options) ? q.options.map(label).map(short).slice(0, 6) : undefined,
    unit: q.unit || undefined,
    text: Array.isArray(q.lines) && q.lines.length ? linesText(q.lines) : undefined,
  };
}
