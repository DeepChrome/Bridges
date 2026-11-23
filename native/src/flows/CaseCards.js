/* Case cards: a stack of flashcards on the words that decide a case (the
 * owner, 2026-11-23; docs/case-cards.md is the framework, core/casecards.js
 * the paths, core/triggers.js the catalogue).
 *
 * The Cases tab of Study (screens/Study.js). It is a stack, as the word cards
 * are: one card at a time, the next one dealt as this one is answered, on
 * until the learner finishes. Underneath, the cards come in paths of three or
 * four on one trigger — each card a different word, the faces mixed and
 * matched (core/casecards.js composeFaces) — but nothing on screen says so: the
 * learner sees one card, then the next (the owner: "they dont see it as a path
 * but just a single front end card because the rest hasnt been revealed to
 * them yet… but all are connected on the back end").
 *
 * Four faces. Notice and Trigger ask which case and are checked by a tap on
 * one of the five, always in the same order, so their position gives nothing
 * away. Form and Use are flashcards: Show, then the learner's own grade. The
 * front of a card is plain text, never word-linked — a tapped word's sheet
 * names its form, which is the answer. The back is linked like every other
 * Russian sentence.
 *
 * A path grades its trigger once, into `st.caseCards` (core/casecards.js
 * pathGrades); a production card also moves the noun's "Cases & forms" score
 * at once, as Form cards do (§30by). The sentences shown are kept in
 * `st.drills.casecards.recent` so the next deals draw others first.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Animated } from "react-native";
import { useSession } from "../session";
import { useTheme, radius, type as T } from "../theme";
import { Screen, Btn, List, Row, RowText, Text, Muted, Sheet, Loading, Lift, toneOf, Speaker, Pill,
         OptionRow, Familiarity } from "../ui";
import { Linked } from "../words";
import { useHeaderOptions } from "../headermenu";
import { useAbout } from "../about";
import { Table } from "../rules";
import { useSwap } from "../motion";
import { Q } from "../questions";
import { L, IX } from "../data";
import { CASES, caseById } from "@core/cases";
import { triggerById, TRIGGER_KINDS } from "@core/triggers";
import { caseSession, offered, pathGrades, gradeTriggers, keepRecent, FACES, ORDERS } from "@core/casecards";
import { gradeSkill, familiarity, cardFor, schedulerOpts, isDue } from "@core/scheduler";
import { fold, TOKEN } from "@core/util";

/* The score a production card's grade moves (FormCards' FORM_SKILL). */
const FORMS = "forms";
const CASECARDS_KEY = "casecards";
/* How many triggers a sitting remembers as met, to keep moving across them. */
const LATELY_KEPT = 12;

/* ------------------------------------------------------------ the words */

const stressed = (bare) => {
  const ids = IX[fold(bare)];
  return ids && L[ids[0]] ? L[ids[0]].w : bare;
};

/* How a trigger is named in the options and on the start panel: its word, or
   its first verbs stressed, or what kind of word governs. */
export function triggerTitle(x) {
  if (x.words) return x.words[0];
  if (x.verbs) return x.verbs.slice(0, 2).map(stressed).join(", ");
  if (x.preds) return x.preds.slice(0, 2).map(stressed).join(", ");
  return x.gov === "noun" ? "noun + noun" : "verb + object";
}

/* On a Trigger card for a verb or a noun, the word that governed this very
   sentence, in its dictionary form: «люби́ть», «кусо́чек». */
const governorTitle = (x, s) => {
  if (x.words) return x.words[0];
  if (x.preds) return s.gov.toLowerCase();
  const ids = IX[fold(s.gov)];
  return ids && L[ids[0]] ? L[ids[0]].w : s.gov;
};

const caseName = (id) => (caseById(id) || {}).name || id;

/* The sentence with the noun (and the trigger) drawn in the brand colour —
   plain text, for a front. `gap` puts a blank where the noun is. */
function SentenceMarks({ s, gap, size = T.title, testID }) {
  const t = useTheme();
  const parts = [];
  let last = 0, n = -1;
  s.ru.replace(TOKEN, (m, at) => {
    n++;
    if (n !== s.k && n !== s.j) return m;
    if (at > last) parts.push({ text: s.ru.slice(last, at) });
    parts.push({ text: n === s.k && gap ? "___" : m, mark: n === s.k ? "noun" : "gov" });
    last = at + m.length;
    return m;
  });
  if (last < s.ru.length) parts.push({ text: s.ru.slice(last) });
  return (
    <Text testID={testID} style={{ color: t.ink, fontSize: size, lineHeight: size * 1.35 }}>
      {parts.map((p, k) => (
        <Text key={k} testID={p.mark === "noun" ? "casecard-noun" : undefined}
              style={p.mark === "noun" ? { color: t.brandInk, fontWeight: "700" }
                : p.mark === "gov" && !gap ? { fontWeight: "700" } : undefined}>{p.text}</Text>
      ))}
    </Text>
  );
}

/* The phrase a Form card asks for, in the sentence's own order: the trigger
   and the noun with whatever stood between them («без мое́й сестры́»). */
function phraseOf(s) {
  const spans = [...s.ru.matchAll(TOKEN)];
  const [a, b] = s.j < s.k ? [s.j, s.k] : [s.k, s.j];
  const phrase = s.ru.slice(spans[a].index, spans[b].index + spans[b][0].length);
  // Lifted from the start of a sentence it keeps no capital: «в углу́», not
  // «В углу́» (a name mid-sentence is never a card's noun).
  return a === 0 ? phrase[0].toLowerCase() + phrase.slice(1) : phrase;
}

/* ------------------------------------------------------------- one card */

/* The five cases as buttons, in teaching order. Answered, the right one is
   green and a wrong pick red; the rest fade. */
function CaseChoices({ answer, picked, onPick }) {
  const t = useTheme();
  return (
    <View testID="casecard-choices" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
      {CASES.map((c) => {
        const done = picked !== null;
        const kind = !done ? "plain" : c.id === answer ? "good" : c.id === picked ? "bad" : "plain";
        const tone = toneOf(t, kind);
        return (
          <Lift key={c.id} testID={`casecard-pick-${c.id}`} fill={tone.bg} edge={tone.edge} border={tone.border}
                r={radius.md} style={{ flexBasis: "47%", flexGrow: 1, opacity: done && kind === "plain" ? 0.5 : 1 }}
                onPress={done ? undefined : () => onPick(c.id)}>
            <View style={{ alignItems: "center", paddingVertical: 13 }}>
              <Text style={{ fontWeight: "700", fontSize: T.small, color: tone.fg }}>{c.name}</Text>
            </View>
          </Lift>
        );
      })}
    </View>
  );
}

/* What the trigger is, under a case answer and on every back: the case, the
   trigger, its meaning and the question it answers. The case is always drawn
   as the answer it is — green — whatever was picked: the red is on the wrong
   button already, and a red pill naming the right case would read as "this
   is wrong". */
function TriggerLine({ x, s }) {
  const t = useTheme();
  return (
    <View testID="casecard-why" style={{ marginTop: 16, flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <Pill tone="good" testID="casecard-case">
        {caseName(x.case)}
      </Pill>
      <Text style={{ color: t.ink, fontWeight: "700", fontSize: T.body }}>{governorTitle(x, s)}</Text>
      <Muted size={T.small} style={{ flexShrink: 1 }}>{`${x.en} · ${x.ask}`}</Muted>
    </View>
  );
}

function CaseCard({ card, state, onPick }) {
  const t = useTheme();
  const x = triggerById(card.trigger);
  const s = card.s;
  const w = L[s.i];
  const check = FACES[card.face].check;
  const shown = state.shown;
  const hl = useMemo(() => new Set([fold(s.token), fold(s.gov)]), [s]);
  const dict = w ? w.w : s.token;

  let front = null;
  if (card.face === "notice") {
    // Answered, the sentence is linked like any other; before, a tap on a
    // word would name its form.
    front = (
      <>
        {state.picked ? <Linked text={s.ru} hl={hl} size={T.title} testID="casecard-sentence" />
          : <SentenceMarks s={s} testID="casecard-sentence" />}
        <Muted size={T.small} style={{ marginTop: 6 }}>{s.en}</Muted>
      </>
    );
  } else if (card.face === "trigger") {
    front = (
      <>
        <Text testID="casecard-trigger" style={{ color: t.ink, fontSize: T.display, fontWeight: "700" }}>
          {governorTitle(x, s)}
        </Text>
        <Muted size={T.body} style={{ marginTop: 4 }}>{x.en}</Muted>
      </>
    );
  } else if (card.face === "form") {
    const words = [s.gov.toLowerCase(), dict];
    if (s.j > s.k) words.reverse();
    front = (
      <>
        <Text testID="casecard-parts" style={{ color: t.ink, fontSize: T.display, fontWeight: "700" }}>
          {words.join(" + ")}
        </Text>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
          <Pill>{x.en}</Pill>
          {s.plural ? <Pill tone="brand">plural</Pill> : null}
        </View>
      </>
    );
  } else {
    front = (
      <>
        <SentenceMarks s={s} gap testID="casecard-gap" />
        <View style={{ flexDirection: "row", gap: 6, marginTop: 10, alignItems: "center" }}>
          <Pill tone="brand" testID="casecard-dict">{dict}</Pill>
          {s.plural ? <Pill>plural</Pill> : null}
        </View>
        <Muted size={T.small} style={{ marginTop: 8 }}>{s.en}</Muted>
      </>
    );
  }

  const back = !shown ? null : card.face === "form" ? (
    <View testID="casecard-back" style={{ marginTop: 18, borderTopWidth: 1, borderTopColor: t.lineSoft, paddingTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text testID="casecard-answer" style={{ flex: 1, color: t.brandInk, fontSize: T.display, fontWeight: "700" }}>
          {phraseOf(s)}
        </Text>
        <Speaker text={s.said} size={36} recordedOnly />
      </View>
      <TriggerLine x={x} s={s} />
      <View style={{ marginTop: 14 }}>
        <Table table={s.table} mark={s.at} narrow testID="casecard-table" headword={dict} />
      </View>
    </View>
  ) : (
    <View testID="casecard-back" style={{ marginTop: 18, borderTopWidth: 1, borderTopColor: t.lineSoft, paddingTop: 16 }}>
      {check === "self" ? (
        <Text testID="casecard-answer" style={{ color: t.brandInk, fontSize: T.display, fontWeight: "700" }}>{s.said}</Text>
      ) : null}
      <TriggerLine x={x} s={s} />
      {card.face === "notice" ? null : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 }}>
          <View style={{ flex: 1 }}>
            <Linked text={s.ru} hl={hl} size={T.body} testID="casecard-example" />
            <Muted size={T.small} style={{ marginTop: 4 }}>{s.en}</Muted>
          </View>
          <Speaker text={s.ru} size={36} recordedOnly />
        </View>
      )}
      {card.face === "notice" ? (
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 10 }}>
          <Speaker text={s.ru} size={36} recordedOnly />
        </View>
      ) : null}
    </View>
  );

  return (
    <View testID={`casecard-${card.face}`} style={{ borderWidth: 1, borderColor: t.lineSoft, borderRadius: radius.xl,
                                                    backgroundColor: t.surface, padding: 20 }}>
      {front}
      {check === "case" ? <CaseChoices answer={x.case} picked={state.picked} onPick={onPick} /> : null}
      {back}
    </View>
  );
}

/* The card on top of the stack, with the edges of the two beneath it showing
   under its foot: a pile, as the word cards are, not a page of steps. Each new
   card slides in (motion.js useSwap). */
function OnTop({ swapKey, children }) {
  const t = useTheme();
  const swap = useSwap(swapKey);
  const edge = (inset, k) => (
    <View key={k} style={{ position: "absolute", left: inset, right: inset, bottom: -6 * (k + 1), height: 24,
                           borderWidth: 1, borderTopWidth: 0, borderColor: t.lineSoft, backgroundColor: t.surface,
                           borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl,
                           opacity: 1 - 0.35 * k }} />
  );
  return (
    <View testID="casecard-stack" style={{ marginTop: 12, marginBottom: 14 }}>
      {[edge(20, 1), edge(10, 0)]}
      <Animated.View style={swap}>{children}</Animated.View>
    </View>
  );
}

/* --------------------------------------------------------------- options */

function casePrefs(st) {
  return ((st.drillPrefs || {})[CASECARDS_KEY]) || {};
}

/* The options, as every options sheet is: a row a category (ui.js OptionRow).
   "Trigger" is one trigger practised on its own, each listed with how well it
   is held; Any is the whole stack. */
function CaseCardOptions({ prefs, list, cards, onChange, onClose }) {
  const cases = prefs.cases && prefs.cases.length ? prefs.cases : CASES.map((c) => c.id);
  const kinds = prefs.kinds && prefs.kinds.length ? prefs.kinds : TRIGGER_KINDS.map((k) => k.id);
  const triggers = [{ id: "any", name: "Any" }].concat(list.map((x) => {
    const score = familiarity(cards[x.id] || null);
    return { id: x.id, name: triggerTitle(x), sub: `${caseName(x.case)} · ${x.en}`,
             note: score === null ? "New" : String(score) };
  }));
  return (
    <Sheet onClose={onClose} testID="casecards-options" title="Case card options" maxHeight="88%"
           footer={<Btn block kind="pri" testID="casecards-apply" label="Apply" style={{ marginTop: 8 }} onPress={onClose} />}>
      <List>
        <OptionRow testID="casecards-focus" title="Trigger" value={prefs.focus || "any"} options={triggers}
                   onPick={(id) => onChange({ ...prefs, focus: id === "any" ? null : id })} />
        <OptionRow testID="casecards-cases" title="Cases" multi minOne value={cases}
                   options={CASES.map((c) => ({ id: c.id, name: c.name }))}
                   onPick={(ids) => onChange({ ...prefs, cases: ids.length === CASES.length ? null : ids })} />
        <OptionRow testID="casecards-kinds" title="Triggers from" multi minOne value={kinds}
                   options={TRIGGER_KINDS}
                   onPick={(ids) => onChange({ ...prefs, kinds: ids.length === TRIGGER_KINDS.length ? null : ids })} />
        <OptionRow testID="casecards-order" title="Opens on" value={prefs.order || "mixed"} options={ORDERS}
                   onPick={(id) => onChange({ ...prefs, order: id })} />
      </List>
    </Sheet>
  );
}

/* ------------------------------------------------------------ the stack */

const GRADES = [[1, "Again", "bad"], [2, "Hard", "plain"], [3, "Good", "good"], [4, "Easy", "pri"]];
const FRESH = { picked: null, shown: false };

export function CaseStack({ route, active = true }) {
  const { st, update, ready } = useSession();
  const t = useTheme();
  const prefs = casePrefs(st);
  const [opts, setOpts] = useState(false);
  useHeaderOptions(route, () => setOpts(true), "Case card options", active);

  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [queue, setQueue] = useState([]);   // paths dealt and not yet run
  const [c, setC] = useState(0);            // which card of the path on top
  const [state, setState] = useState(FRESH);
  const [count, setCount] = useState(0);    // cards answered this sitting
  const [ended, setEnded] = useState([]);   // { trigger, grade } per finished path
  const results = useRef([]);               // the path on top's, card by card
  const lately = useRef([]);                // triggers met this sitting, newest last
  const dealtFor = useRef(null);            // the options the queue was dealt under
  const deals = useRef(0);                  // deals made, so a re-dealt card slides in too
  const [nothing, setNothing] = useState(false); // the options hold no trigger to deal

  const list = useMemo(() => (ready && (active || started) ? offered(Q.triggerSightings()) : []),
    [ready, active, started]);
  const cards = st.caseCards || {};
  const dueN = list.filter((x) => cards[x.id] && isDue(cards[x.id], Date.now(), 0)).length;
  const prefsKey = JSON.stringify([prefs.focus || null, prefs.cases || null, prefs.kinds || null, prefs.order || "mixed"]);

  /* The next few paths, from the learner as they stand now — dealt when the
     stack runs out, and again when the options change under it. */
  const deal = () => {
    const seen = st.seen || {};
    const known = (i) => {
      const f = familiarity(L[i] ? cardFor(seen[L[i].b]) : null);
      return f === null ? 0 : f / 100;
    };
    dealtFor.current = prefsKey;
    deals.current += 1;
    const paths = caseSession({
      sightings: Q.triggerSightings(), cards: st.caseCards || {}, now: Date.now(),
      focus: prefs.focus || null, cases: prefs.cases, kinds: prefs.kinds, order: prefs.order || "mixed",
      known, recent: (((st.drills || {})[CASECARDS_KEY]) || {}).recent, lately: lately.current,
      newMax: count ? 1 : undefined, schedOpts: schedulerOpts(st),
    });
    setNothing(!paths.length);
    setQueue(paths);
    setC(0);
    setState(FRESH);
    results.current = [];
  };
  useEffect(() => {
    if (!started || finished || (nothing && dealtFor.current === prefsKey)) return;
    // Options changed mid-sitting: the paths not yet begun go, the new ones
    // follow the new options. A path part-way through is let go too, ungraded.
    if (dealtFor.current !== prefsKey || !queue.length) deal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, finished, queue.length, prefsKey]);

  const path = queue[0] || null;
  const card = started && !finished && path ? path.cards[c] : null;
  useAbout(card && active ? {
    kind: "casecard",
    text: [card.face === "use" ? card.s.ru.replace(card.s.token, "___") : card.face === "notice" ? card.s.ru : "",
           card.face === "trigger" || card.face === "form" ? `${triggerTitle(triggerById(card.trigger))}: ${triggerById(card.trigger).en}` : "",
           state.picked || state.shown ? `Answer: ${caseName(triggerById(card.trigger).case)}, ${card.s.said}` : ""]
      .filter(Boolean).join("\n"),
  } : null);

  const setPrefs = (next) => update((p) => ({ ...p, drillPrefs: { ...(p.drillPrefs || {}), [CASECARDS_KEY]: next } }));
  const options = opts ? (
    <CaseCardOptions prefs={prefs} list={list} cards={cards} onChange={setPrefs} onClose={() => setOpts(false)} />
  ) : null;

  if (!ready) return <Screen><Loading /></Screen>;

  const begin = () => {
    lately.current = []; setCount(0); setEnded([]); setQueue([]); dealtFor.current = null;
    setFinished(false); setNothing(false); setStarted(true);
  };
  const focus = prefs.focus ? triggerById(prefs.focus) : null;
  const clearFocus = () => setPrefs({ ...prefs, focus: null });

  /* Before the first card: how many triggers are due, Start, and the options.
     The same shape as the word cards' start (Study.js). */
  if (!started) {
    return (
      <Screen>
        <View testID="casecards-start-panel" style={{ marginTop: 48, alignItems: "center", paddingHorizontal: 24 }}>
          <Text testID="casecards-due" style={{ color: t.ink, fontSize: 56, fontWeight: "700", lineHeight: 64 }}>
            {String(dueN)}
          </Text>
          <Muted>{dueN === 1 ? "trigger due" : "triggers due"}</Muted>
          <Btn kind="pri" testID="casecards-start" style={{ marginTop: 24, minWidth: 240 }}
               label={focus ? `Start: ${triggerTitle(focus)}` : "Start"} onPress={begin} />
          {focus ? <Btn kind="link" testID="casecards-any" style={{ marginTop: 10 }} label="Any trigger" onPress={clearFocus} />
            : <Btn kind="link" testID="casecards-choose" style={{ marginTop: 10 }} label="Choose a trigger" onPress={() => setOpts(true)} />}
          <Muted size={T.tiny} style={{ marginTop: 28, color: t.ink3 }}>{`${list.length} triggers`}</Muted>
        </View>
        {options}
      </Screen>
    );
  }

  /* Finished: each trigger met, with what the sitting did to it, and the way
     back into the stack. */
  if (finished || nothing) {
    const none = nothing && !ended.length;
    return (
      <Screen footer={
        /* One primary and the way out under it, as the stack's own footer
           (Finish) and Study's end are. */
        <>
          {none ? null : (
            <Btn block kind="pri" testID="casecards-keep-going" label="Keep going"
                 onPress={() => { setFinished(false); setNothing(false); setQueue([]); dealtFor.current = null; }} />
          )}
          <Btn kind="ghost" testID="casecards-done" label="Done" style={{ marginTop: none ? 0 : 10 }}
               onPress={() => { setStarted(false); setFinished(false); }} />
        </>}>
        <Text testID="casecards-end" style={{ color: t.ink, fontSize: T.title, fontWeight: "700", marginBottom: 12 }}>
          {none ? "Nothing to practice with these options" : `${count} ${count === 1 ? "card" : "cards"}`}
        </Text>
        <List>
          {ended.map((e, k) => {
            const x = triggerById(e.trigger);
            return (
              <Row key={`${e.trigger}:${k}`} testID={`casecards-result-${e.trigger}`}>
                <RowText title={triggerTitle(x)} sub={`${caseName(x.case)} · ${x.en}`} />
                <Pill tone={e.grade === 1 ? "bad" : e.grade === 2 ? undefined : "good"}>
                  {GRADES[e.grade - 1][1]}
                </Pill>
                <Familiarity score={familiarity(cards[e.trigger] || null)} size={30} />
              </Row>
            );
          })}
        </List>
        {options}
      </Screen>
    );
  }

  if (!card) return <Screen><Loading /></Screen>;

  /* A path closed: its trigger graded once on the cards answered, the
     sentences shown kept. At its end, or part-way when the learner finishes. */
  const closePath = (upTo) => {
    if (!results.current.some(Boolean)) return;
    const grades = pathGrades(path, results.current);
    const shown = path.cards.slice(0, upTo).map((x) => x.s.ru);
    const now = Date.now();
    update((prev) => ({
      ...prev,
      caseCards: gradeTriggers(prev.caseCards, grades, now, schedulerOpts(prev)),
      drills: { ...(prev.drills || {}),
                [CASECARDS_KEY]: { ...((prev.drills || {})[CASECARDS_KEY] || {}),
                                   recent: keepRecent((((prev.drills || {})[CASECARDS_KEY]) || {}).recent, shown) } },
    }));
    setEnded((was) => was.concat(Object.keys(grades).map((id) => ({ trigger: id, grade: grades[id] }))));
    lately.current = lately.current.filter((id) => id !== path.trigger).concat(path.trigger).slice(-LATELY_KEPT);
    results.current = [];
  };
  /* On to the next card: the next of this path, or — the path done — the
     path closed and the next one on top. */
  const next = () => {
    setCount(count + 1);
    if (c + 1 < path.cards.length) { setC(c + 1); setState(FRESH); return; }
    closePath(path.cards.length);
    setQueue(queue.slice(1));
    setC(0);
    setState(FRESH);
  };

  const pick = (id) => {
    results.current[c] = { right: id === triggerById(card.trigger).case };
    setState({ picked: id, shown: true });
  };

  /* A production card's grade moves the noun's "Cases & forms" score at once
     and nothing else; the trigger's waits for the end of the path. */
  const grade = (g) => {
    results.current[c] = { grade: g };
    const word = L[card.s.i] && L[card.s.i].b;
    if (word) {
      const now = Date.now();
      update((prev) => ({ ...prev, seen: gradeSkill(prev.seen, word, FORMS, g, now, schedulerOpts(prev)).seen }));
    }
    next();
  };

  const check = FACES[card.face].check;
  const main = check === "case" ? (state.picked
    ? <Btn block kind="pri" testID="casecard-next" label="Continue" onPress={next} />
    : null)
    : !state.shown ? <Btn block kind="pri" testID="casecard-show" label="Show" onPress={() => setState({ ...state, shown: true })} />
    : (
      <View style={{ flexDirection: "row", gap: 6 }}>
        {GRADES.map(([g, label, kind]) => {
          const tone = toneOf(t, kind);
          return (
            <Lift key={g} testID={`casecard-grade-${g}`} fill={tone.bg} edge={tone.edge} border={tone.border}
                  r={radius.md} style={{ flex: 1 }} onPress={() => grade(g)}>
              <View style={{ alignItems: "center", paddingVertical: 13 }}>
                <Text style={{ fontWeight: "700", fontSize: T.small, color: tone.fg }}>{label}</Text>
              </View>
            </Lift>
          );
        })}
      </View>
    );
  const footer = (
    <>
      {main}
      <View style={{ flexDirection: "row", gap: 8, marginTop: main ? 10 : 0 }}>
        <Btn kind="ghost" testID="casecards-finish" label="Finish" style={{ flex: 1 }}
             onPress={() => { closePath(c + 1); setFinished(true); setQueue([]); }} />
      </View>
    </>
  );

  return (
    <Screen fill footer={footer}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 28 }}>
        <Muted testID="casecards-count">{count ? `${count} ${count === 1 ? "card" : "cards"}` : ""}</Muted>
        {focus ? (
          <Btn kind="link" testID="casecards-focus-clear" label={`${triggerTitle(focus)} ✕`} onPress={clearFocus}
               accessibilityLabel={`Only ${triggerTitle(focus)}: show every trigger`} />
        ) : null}
      </View>
      {/* The card in the middle of what is left, as Study's is (§30dc); a
          long back grows past the screen and scrolls. */}
      <View testID="casecard-well" style={{ flexGrow: 1, justifyContent: "center", paddingBottom: 12 }}>
        <OnTop swapKey={`${deals.current}:${count}`}>
          <CaseCard key={`${deals.current}:${count}`} card={card} state={state} onPick={pick} />
        </OnTop>
      </View>
      {options}
    </Screen>
  );
}
