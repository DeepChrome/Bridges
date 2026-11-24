/* Case cards: a stack of flashcards on the cases, each about one thing,
 * asked in many ways (the owner, 2026-11-23; core/casecards.js is the deck,
 * core/triggers.js and core/caserules.js what the cards are about).
 *
 * The Cases tab of Study (screens/Study.js). One card at a time, the next
 * dealt as this one is answered, on until the learner finishes. A card is one
 * of thirteen types (core/casecards.js CARD_TYPES) and goes one of three ways:
 *   - "case": a tap on one of the five cases, always in the same order, so a
 *     position gives nothing away;
 *   - "choice": four options, one right;
 *   - "self": Show, then the learner's own grade, as every flashcard.
 * The front of a card is plain text, never word-linked — a tapped word's sheet
 * names its form, which is the answer. The back is linked like every other
 * Russian sentence.
 *
 * Every answer grades at once: the thing the card is about (a trigger, a rule)
 * in `st.caseCards`, and — for a card on one word's forms — the word's "Cases
 * & forms" score (§30by), never its meaning card. The words asked about are
 * the learner's own, weighted towards a word they know well whose forms they
 * do not (`caseWords`). The sentences shown are kept in
 * `st.drills.casecards.recent` so the next deals draw others first.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Animated, BackHandler, Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSession } from "../session";
import { useTheme, radius, type as T } from "../theme";
import { Screen, Btn, List, Row, RowText, Text, Muted, Sheet, Loading, Lift, toneOf, Speaker, Pill,
         OptionRow, Familiarity, Marked } from "../ui";
import { Linked, navRef } from "../words";
import { useHeaderOptions } from "../headermenu";
import { useAbout } from "../about";
import { Table, TopicSection } from "../rules";
import { cardsFor } from "../screens/Grammar";
import { topicById } from "@core/grammar";
import { useSwap } from "../motion";
import { Q } from "../questions";
import { L, IX, UN, rankOf, reachedUnits } from "../data";
import { CASES, caseById } from "@core/cases";
import { triggerById, TRIGGER_KINDS, TRIGGERS } from "@core/triggers";
import { ENDING_RULES, COUNT_RULES } from "@core/caserules";
import { caseDeck, offered, gradeOf, itemOf, gradeItem, keepRecent, CARD_TYPES, NUMBERS } from "@core/casecards";
import { gradeSkill, familiarity, cardFor, skillScores, schedulerOpts, isDue } from "@core/scheduler";
import { fold, TOKEN, firstSense } from "@core/util";

/* The score a word card's grade moves (FormCards' FORM_SKILL). */
const FORMS = "forms";
const CASECARDS_KEY = "casecards";
/* How many things a sitting remembers as met, to keep moving across them. */
const LATELY_KEPT = 30;
/* The pronouns a case card declines: their forms are the commonest case forms
   there are («мне», «с ним»). Folded lemmas. */
const PRONOUNS = new Set(["я", "ты", "он", "она", "оно", "мы", "вы", "они", "кто", "что"]);
/* Below this many words of their own, a learner's cards also draw on the
   course's first nouns, at a low weight. */
const OWN_WORDS_MIN = 25;

/* ------------------------------------------------------------ the words */

const stressed = (bare) => {
  const ids = IX[fold(bare)];
  return ids && L[ids[0]] ? L[ids[0]].w : bare;
};
/* What the deck may ask of the lexicon; `meaning` is the English a card puts
   beside every Russian word it shows. */
const LEX = { word: (i) => L[i], lemma: stressed, stress: stressed, meaning: (i) => (L[i] ? firstSense(L[i]) : null) };

/* How a trigger is named in the options and the end list. */
function triggerTitle(x) {
  if (x.words) return x.words[0];
  if (x.verbs) return x.verbs.slice(0, 2).map(stressed).join(", ");
  if (x.preds) return x.preds.slice(0, 2).map(stressed).join(", ");
  return x.gov === "noun" ? "noun + noun" : "verb + object";
}

const caseName = (id) => (caseById(id) || {}).name || id;
const hasDeclension = (w) => !!(w && w.t && w.t.some((t) => /Declension/.test(t.title)));

/* The words to ask about, each with a weight: a word the learner recalls well
   and whose forms they hold badly is drawn most (the owner: "high recall but a
   low case performance"); a word met and never asked about its forms counts
   as forms 0. The nouns and the case-taking pronouns they have met. */
function caseWords(st) {
  const seen = st.seen || {};
  const out = [];
  for (const b of Object.keys(seen)) {
    const rank = rankOf(b);
    const w = rank ? L[rank - 1] : null;
    if (!w || w.b !== b) continue;
    if (!(w.p === "noun" || (w.p === "pronoun" && PRONOUNS.has(fold(b))))) continue;
    if (!hasDeclension(w)) continue;
    const sc = skillScores(seen[b], rank) || {};
    const overall = familiarity(cardFor(seen[b]), rank);
    const recall = Math.max(sc.ru2en || 0, sc.en2ru || 0, overall || 0) / 100;
    const forms = (sc.forms || 0) / 100;
    out.push({ i: rank - 1, weight: (0.3 + recall) * (1.3 - forms) });
  }
  if (out.length < OWN_WORDS_MIN) {
    const have = new Set(out.map((x) => x.i));
    for (const u of reachedUnits(st)) for (const i of u.w || []) {
      if (out.length >= OWN_WORDS_MIN * 2) break;
      if (!have.has(i) && L[i] && L[i].p === "noun" && hasDeclension(L[i])) { have.add(i); out.push({ i, weight: 0.15 }); }
    }
  }
  return out;
}

/* The course's nouns, for a rule's example when the learner's own words have
   none that follow it. */
let courseNouns = null;
const nounsOfCourse = () => {
  if (!courseNouns) {
    const set = new Set();
    for (const u of UN) for (const i of u.w || []) if (L[i] && L[i].p === "noun") set.add(i);
    courseNouns = [...set];
  }
  return courseNouns;
};

/* ------------------------------------------------------------ the front */

/* The sentence with the noun drawn in the brand colour — plain text, for a
   front. `gap` puts a blank where the noun is; the governor is bold unless the
   card asks which word it is (`plain`). */
function SentenceMarks({ s, gap, plain, size = T.title, testID }) {
  const t = useTheme();
  const parts = [];
  let last = 0, n = -1;
  s.ru.replace(TOKEN, (m, at) => {
    n++;
    if (n !== s.k && (n !== s.j || plain)) return m;
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

/* Four options, one under another, marked the same way once one is picked. */
function OptionChoices({ options, picked, onPick }) {
  const t = useTheme();
  return (
    <View testID="casecard-options" style={{ gap: 8, marginTop: 18 }}>
      {options.map((o, k) => {
        const done = picked !== null;
        const kind = !done ? "plain" : o.right ? "good" : k === picked ? "bad" : "plain";
        const tone = toneOf(t, kind);
        return (
          <Lift key={`${o.label}:${k}`} testID={`casecard-opt-${k}`} fill={tone.bg} edge={tone.edge} border={tone.border}
                r={radius.md} style={{ opacity: done && kind === "plain" ? 0.5 : 1 }}
                onPress={done ? undefined : () => onPick(k)}>
            <View style={{ paddingVertical: 13, paddingHorizontal: 14 }}>
              <Text style={{ fontWeight: "600", fontSize: T.body, color: tone.fg }}>{o.label}</Text>
            </View>
          </Lift>
        );
      })}
    </View>
  );
}

/* A case for reference, from a tap on its name (the owner, 2026-11-23: "if I
   click the case title… the table and associated rules pop up"). The case's
   own page of the grammar reference — the same section, drawn by the same
   component, so the card and the reference cannot disagree — and under it
   the words that take the case, from the trigger catalogue. */
function CaseReference({ caseId, onClose }) {
  const t = useTheme();
  const topic = topicById("cases");
  const section = topic ? topic.sections.find((s) => s.heading === caseName(caseId)) : null;
  const takes = TRIGGERS.filter((x) => x.case === caseId && !x.gov);
  const open = () => {
    onClose();
    if (navRef.isReady()) navRef.navigate("Grammar", { topic: "cases", section: caseName(caseId), only: true });
  };
  return (
    <Sheet testID="casecard-reference" title={caseName(caseId)} onClose={onClose} maxHeight="88%"
           footer={<Btn block kind="plain" testID="casecard-reference-page" label="Open the full page" onPress={open} />}>
      {section ? <TopicSection section={{ ...section, heading: "" }} cards={cardsFor(section)} testID="casecard-reference-section" /> : null}
      {takes.length ? (
        <View style={{ marginTop: 12 }}>
          <Muted size={T.small} style={{ marginBottom: 6 }}>Words that take it</Muted>
          <List>
            {takes.map((x) => (
              <Row key={x.id} testID={`casecard-reference-${x.id}`}>
                <RowText title={triggerTitle(x)} sub={x.en} />
                <Muted size={T.small}>{x.ask}</Muted>
              </Row>
            ))}
          </List>
        </View>
      ) : null}
    </Sheet>
  );
}

/* The case the answer is, always green: it is the answer, whatever was
   picked (the red is on the wrong button already). A tap opens the case for
   reference. */
function CaseLine({ line }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View testID="casecard-why" style={{ flexDirection: "row", marginBottom: 8 }}>
      <Pressable testID="casecard-case-open" accessibilityRole="button" hitSlop={8}
                 accessibilityLabel={`${caseName(line.case)}: the table and its rules`}
                 onPress={() => setOpen(true)}
                 style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.6 : 1 })}>
        <Pill tone="good" testID="casecard-case">{caseName(line.case)}</Pill>
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={t.ink3} strokeWidth={2}
             strokeLinecap="round" strokeLinejoin="round"><Path d="M9 6l6 6-6 6" /></Svg>
      </Pressable>
      {open ? <CaseReference caseId={line.case} onClose={() => setOpen(false)} /> : null}
    </View>
  );
}

/* What a card asks for, as the answer to it reads. */
export function answerText(card) {
  if (card.check === "case") return caseName(card.answer);
  if (card.check === "choice") return (card.options.find((o) => o.right) || {}).label || "";
  return (card.back && card.back.answer) || "";
}
/* What the pick that was wrong would have meant (core/casecards.js misses). */
function missOf(card, picked) {
  if (picked === null || picked === undefined || !card.misses) return null;
  if (card.check === "case") return picked === card.answer ? null : card.misses[picked] || null;
  const o = card.options && card.options[picked];
  return o && !o.right ? card.misses[o.label] || null : null;
}

function CaseCard({ card, state, onPick, openTable = false }) {
  const t = useTheme();
  const f = card.front, b = card.back || {};
  const done = state.picked !== null || state.shown;
  const sent = f.sentence;
  const hl = useMemo(() => (sent ? new Set([fold(sent.s.token), fold(sent.s.gov || "")]) : null), [sent]);
  const [table, setTable] = useState(!!(b.tableOpen || openTable));
  const miss = missOf(card, state.picked);
  const why = (b.why || []).filter(Boolean);

  return (
    <View testID={`casecard-${card.type}`} style={{ borderWidth: 1, borderColor: t.lineSoft, borderRadius: radius.xl,
                                                    backgroundColor: t.surface, padding: 20 }}>
      {f.ask ? <Muted testID="casecard-ask" size={T.small} style={{ marginBottom: 10 }}>{f.ask}</Muted> : null}
      {f.big ? (
        <Text testID="casecard-big" style={{ color: t.ink, fontSize: f.big.length > 22 ? T.title : T.display, fontWeight: "700" }}>
          {f.big}
        </Text>
      ) : null}
      {sent ? (done && b.linked
        ? <Linked text={sent.s.ru} hl={hl} size={T.title} testID="casecard-sentence" />
        : <SentenceMarks s={sent.s} gap={sent.gap} plain={sent.plain} testID="casecard-sentence" />) : null}
      {f.pills && f.pills.length ? (
        <View style={{ flexDirection: "row", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {f.pills.map((p, k) => <Pill key={k} tone={k === 0 ? "brand" : undefined}>{p}</Pill>)}
        </View>
      ) : null}
      {f.sub ? <Muted testID="casecard-sub" size={T.small} style={{ marginTop: 8 }}>{f.sub}</Muted> : null}

      {card.check === "case" ? <CaseChoices answer={card.answer} picked={state.picked} onPick={onPick} /> : null}
      {card.check === "choice" ? <OptionChoices options={card.options} picked={state.picked} onPick={onPick} /> : null}

      {done ? (
        <View testID="casecard-back" style={{ marginTop: 18, borderTopWidth: 1, borderTopColor: t.lineSoft, paddingTop: 16 }}>
          {b.answer ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <Text testID="casecard-answer" style={{ flex: 1, color: t.brandInk, fontSize: T.display, fontWeight: "700" }}>
                {b.answer}
              </Text>
              {b.speak ? <Speaker text={b.speak} size={36} recordedOnly /> : null}
            </View>
          ) : null}
          {b.line ? <CaseLine line={b.line} /> : null}
          {miss ? <Marked testID="casecard-miss" text={miss} size={T.small} color={t.bad} style={{ marginBottom: 6 }} /> : null}
          {why.map((line, k) => (
            <Marked key={k} testID={`casecard-rule-${k}`} text={line} size={T.body} color={t.ink} style={{ marginBottom: 6 }} />
          ))}
          {b.example ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                {b.example.hl && b.example.hl.length
                  ? <Linked text={b.example.ru} hl={new Set(b.example.hl.map(fold))} size={T.body} testID="casecard-example" />
                  : <Text testID="casecard-example" style={{ color: t.ink, fontSize: T.body }}>{b.example.ru}</Text>}
                {b.example.en ? <Muted size={T.small} style={{ marginTop: 4 }}>{b.example.en}</Muted> : null}
              </View>
              {!b.answer && b.speak ? <Speaker text={b.speak} size={36} recordedOnly /> : null}
            </View>
          ) : !b.answer && b.speak ? (
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 6 }}>
              <Speaker text={b.speak} size={36} recordedOnly />
            </View>
          ) : null}
          {b.table ? (table ? (
            <View style={{ marginTop: 14 }}>
              <Table table={b.table} mark={b.at} narrow testID="casecard-table" headword={b.headword} />
            </View>
          ) : (
            <Btn kind="link" testID="casecard-show-table" label="Table" style={{ alignSelf: "flex-start", marginTop: 8 }}
                 onPress={() => setTable(true)} />
          )) : null}
        </View>
      ) : null}
    </View>
  );
}

/* The card on top of the stack, with the edges of the two beneath it showing
   under its foot. Each new card slides in (motion.js useSwap). */
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

/* The options, a row a category (ui.js OptionRow): which cards, which cases,
   singular or plural, which triggers, or one trigger on its own. */
function CaseCardOptions({ prefs, list, cards, onChange, onClose }) {
  const all = (ids, full) => (ids && ids.length ? ids : full);
  const types = all(prefs.types, CARD_TYPES.map((x) => x.id));
  const cases = all(prefs.cases, CASES.map((c) => c.id));
  const numbers = all(prefs.numbers, NUMBERS.map((x) => x.id));
  const kinds = all(prefs.kinds, TRIGGER_KINDS.map((k) => k.id));
  const triggers = [{ id: "any", name: "Any" }].concat(list.map((x) => {
    const score = familiarity(cards[x.id] || null);
    return { id: x.id, name: triggerTitle(x), sub: `${caseName(x.case)} · ${x.en}`,
             note: score === null ? "New" : String(score) };
  }));
  const set = (key, ids, full) => onChange({ ...prefs, [key]: ids.length === full.length ? null : ids });
  return (
    <Sheet onClose={onClose} testID="casecards-options" title="Case card options" maxHeight="88%"
           footer={<Btn block kind="pri" testID="casecards-apply" label="Apply" style={{ marginTop: 8 }} onPress={onClose} />}>
      <List>
        <OptionRow testID="casecards-types" title="Cards" multi minOne value={types}
                   options={CARD_TYPES.map((x) => ({ id: x.id, name: x.name }))}
                   onPick={(ids) => set("types", ids, CARD_TYPES)} />
        <OptionRow testID="casecards-cases" title="Cases" multi minOne value={cases}
                   options={CASES.map((c) => ({ id: c.id, name: c.name }))}
                   onPick={(ids) => set("cases", ids, CASES)} />
        <OptionRow testID="casecards-numbers" title="Number" multi minOne value={numbers} options={NUMBERS}
                   onPick={(ids) => set("numbers", ids, NUMBERS)} />
        <OptionRow testID="casecards-kinds" title="Triggers from" multi minOne value={kinds} options={TRIGGER_KINDS}
                   onPick={(ids) => set("kinds", ids, TRIGGER_KINDS)} />
        <OptionRow testID="casecards-focus" title="One trigger" value={prefs.focus || "any"} options={triggers}
                   onPick={(id) => onChange({ ...prefs, focus: id === "any" ? null : id })} />
      </List>
    </Sheet>
  );
}

/* ------------------------------------------------------------ the stack */

const GRADES = [[1, "Again", "bad"], [2, "Hard", "plain"], [3, "Good", "good"], [4, "Easy", "pri"]];
const FRESH = { picked: null, shown: false };

/* A name for what a card's grade was about, for the end list. */
function itemTitle(key) {
  if (key.startsWith("end:")) {
    const r = ENDING_RULES.find((x) => `end:${x.id}` === key);
    return r ? { title: `${caseName(r.case)} ${r.num === "pl" ? "plural" : "singular"}`, sub: `${r.label} · ${r.who}` } : null;
  }
  if (key.startsWith("count:")) {
    const r = COUNT_RULES.find((x) => `count:${x.id}` === key);
    return r ? { title: r.words, sub: "Counting" } : null;
  }
  if (key.startsWith("q:")) return { title: caseName(key.slice(2)), sub: "Question words" };
  const x = triggerById(key);
  return x ? { title: triggerTitle(x), sub: `${caseName(x.case)} · ${x.en}` } : null;
}

export function CaseStack({ route, active = true }) {
  const { st, update, ready } = useSession();
  const t = useTheme();
  const prefs = casePrefs(st);
  const [opts, setOpts] = useState(false);
  useHeaderOptions(route, () => setOpts(true), "Case card options", active);

  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [queue, setQueue] = useState([]);    // cards dealt and not yet answered
  const [state, setState] = useState(FRESH);
  const [count, setCount] = useState(0);     // cards answered this sitting
  const [right, setRight] = useState(0);     // of those, right or graded Good and up
  const [ended, setEnded] = useState({});    // key → last grade, this sitting
  const lately = useRef([]);                 // keys met this sitting, newest last
  const shownRu = useRef([]);                // sentences shown this sitting
  const dealtFor = useRef(null);             // the options the queue was dealt under
  const deals = useRef(0);
  const [nothing, setNothing] = useState(false);
  /* The cards missed this sitting, as they were left, for the end screen to
     open again with their rule and table (the owner, 2026-11-23: "the learner
     needs the ability to review why they were wrong at the end"). */
  const [missed, setMissed] = useState([]);
  const [review, setReview] = useState(null);
  const lastG = useRef(null);
  /* The cards answered this sitting, as they were left, and how many of them
     back the learner has stepped (the owner, 2026-11-23: "would be nice to be
     able to return the previous card via backswipe"). A card stepped back to
     is shown answered and is not graded again. */
  const history = useRef([]);
  const [back, setBack] = useState(0);
  useEffect(() => {
    if (!active || !started || finished) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (back >= history.current.length) return false;
      setBack(back + 1);
      return true;
    });
    return () => sub.remove();
  }, [active, started, finished, back]);

  const list = useMemo(() => (ready && (active || started) ? offered(Q.triggerSightings()) : []),
    [ready, active, started]);
  const cards = st.caseCards || {};
  const now = Date.now();
  const dueN = Object.keys(cards).filter((k) => isDue(cards[k], now, 0)).length;
  const prefsKey = JSON.stringify([prefs.focus || null, prefs.types || null, prefs.cases || null,
                                   prefs.numbers || null, prefs.kinds || null]);

  /* The next cards, from the learner as they stand now — dealt when the stack
     runs out, and again when the options change under it. */
  const deal = () => {
    dealtFor.current = prefsKey;
    deals.current += 1;
    const deck = caseDeck({
      sightings: Q.triggerSightings(), cards: st.caseCards || {}, words: caseWords(st), nouns: nounsOfCourse(),
      lex: LEX, now: Date.now(), types: prefs.types, cases: prefs.cases, numbers: prefs.numbers,
      kinds: prefs.kinds, focus: prefs.focus || null, first: count === 0,
      recent: ((((st.drills || {})[CASECARDS_KEY]) || {}).recent || []).concat(shownRu.current),
      lately: lately.current, schedOpts: schedulerOpts(st),
    });
    setNothing(!deck.length);
    setQueue(deck);
    setState(FRESH);
  };
  useEffect(() => {
    if (!started || finished || (nothing && dealtFor.current === prefsKey)) return;
    if (dealtFor.current !== prefsKey || !queue.length) deal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, finished, queue.length, prefsKey]);

  const card = started && !finished ? queue[0] || null : null;
  useAbout(card && active ? {
    kind: "casecard",
    text: [card.front.big || "", card.front.sentence ? card.front.sentence.s.ru : "", (card.front.pills || []).join(", "),
           card.front.sub || "",
           state.picked !== null || state.shown
             ? `Answer: ${card.check === "case" ? caseName(card.answer) : card.check === "choice"
               ? card.options.find((o) => o.right).label : card.back.answer}` : ""]
      .filter(Boolean).join("\n"),
  } : null);

  const setPrefs = (next) => update((p) => ({ ...p, drillPrefs: { ...(p.drillPrefs || {}), [CASECARDS_KEY]: next } }));
  const options = opts ? (
    <CaseCardOptions prefs={prefs} list={list} cards={cards} onChange={setPrefs} onClose={() => setOpts(false)} />
  ) : null;

  if (!ready) return <Screen><Loading /></Screen>;

  const begin = () => {
    lately.current = []; shownRu.current = []; history.current = []; setBack(0); setCount(0); setMissed([]); lastG.current = null; setRight(0); setEnded({}); setQueue([]);
    dealtFor.current = null; setFinished(false); setNothing(false); setStarted(true);
  };
  const focus = prefs.focus ? triggerById(prefs.focus) : null;
  const clearFocus = () => setPrefs({ ...prefs, focus: null });

  /* Before the first card: how many are due, Start, and the options. */
  if (!started) {
    return (
      <Screen>
        <View testID="casecards-start-panel" style={{ marginTop: 48, alignItems: "center", paddingHorizontal: 24 }}>
          <Text testID="casecards-due" style={{ color: t.ink, fontSize: 56, fontWeight: "700", lineHeight: 64 }}>
            {String(dueN)}
          </Text>
          <Muted>due</Muted>
          <Btn kind="pri" testID="casecards-start" style={{ marginTop: 24, minWidth: 240 }}
               label={focus ? `Start: ${triggerTitle(focus)}` : "Start"} onPress={begin} />
          {focus ? <Btn kind="link" testID="casecards-any" style={{ marginTop: 10 }} label="Any trigger" onPress={clearFocus} />
            : <Btn kind="link" testID="casecards-choose" style={{ marginTop: 10 }} label="Options" onPress={() => setOpts(true)} />}
        </View>
        {options}
      </Screen>
    );
  }

  /* Finished: what was met, with its last grade, and the way back in. */
  if (finished || nothing) {
    const none = nothing && !count;
    const keys = Object.keys(ended);
    return (
      <Screen footer={
        <>
          {none ? null : (
            <Btn block kind="pri" testID="casecards-keep-going" label="Keep going"
                 onPress={() => { setFinished(false); setNothing(false); setQueue([]); dealtFor.current = null; }} />
          )}
          <Btn kind="ghost" testID="casecards-done" label="Done" style={{ marginTop: none ? 0 : 10 }}
               onPress={() => { setStarted(false); setFinished(false); }} />
        </>}>
        <Text testID="casecards-end" style={{ color: t.ink, fontSize: T.title, fontWeight: "700", marginBottom: 12 }}>
          {none ? "Nothing to practice with these options" : `${right} of ${count} right`}
        </Text>
        {missed.length ? (
          <>
            <Muted testID="casecards-missed" size={T.small} style={{ marginBottom: 6 }}>Missed · tap for the rule</Muted>
            <List>
              {missed.map((m, k) => (
                <Row key={`miss-${k}`} testID={`casecards-miss-${k}`} onPress={() => setReview(m)}>
                  <RowText title={m.card.front.big || (m.card.front.sentence ? m.card.front.sentence.s.ru : "")}
                           sub={answerText(m.card)} />
                </Row>
              ))}
            </List>
            <View style={{ height: 16 }} />
          </>
        ) : null}
        <List>
          {keys.map((key) => {
            const it = itemTitle(key);
            if (!it) return null;
            const g = ended[key];
            return (
              <Row key={key} testID={`casecards-result-${key}`}>
                <RowText title={it.title} sub={it.sub} />
                <Pill tone={g === 1 ? "bad" : g === 2 ? undefined : "good"}>{GRADES[g - 1][1]}</Pill>
                <Familiarity score={familiarity(cards[key] || null)} size={30} />
              </Row>
            );
          })}
        </List>
        {review ? (
          <Sheet testID="casecards-review" title="Missed" onClose={() => setReview(null)} maxHeight="88%">
            <CaseCard card={review.card} state={review.state} onPick={() => {}} openTable />
          </Sheet>
        ) : null}
        {options}
      </Screen>
    );
  }

  if (!card) return <Screen><Loading /></Screen>;

  /* One answer: graded at once, into what the card is about and — for a card
     on a word's forms — that word's "Cases & forms" score. */
  const record = (result) => {
    const g = gradeOf(card, result);
    const item = itemOf(card);
    const at = Date.now();
    if (card.s) shownRu.current = shownRu.current.concat(card.s.ru);
    update((prev) => {
      let next = { ...prev };
      if (item) next.caseCards = gradeItem(prev.caseCards, item, g, at, schedulerOpts(prev));
      if (card.word) next.seen = gradeSkill(prev.seen, card.word, FORMS, g, at, schedulerOpts(prev)).seen;
      if (card.s) {
        const was = ((prev.drills || {})[CASECARDS_KEY]) || {};
        next.drills = { ...(prev.drills || {}), [CASECARDS_KEY]: { ...was, recent: keepRecent(was.recent, [card.s.ru]) } };
      }
      return next;
    });
    lastG.current = g;
    if (item) setEnded((was) => ({ ...was, [item]: g }));
    lately.current = lately.current.filter((k) => k !== card.key).concat(card.key).slice(-LATELY_KEPT);
    setCount((n) => n + 1);
    if (g >= 3) setRight((n) => n + 1);
  };
  const keepMiss = (left) => { if (lastG.current === 1) setMissed((m) => m.concat({ card, state: left })); lastG.current = null; };
  const next = (left = state) => {
    keepMiss(left);
    history.current = history.current.concat({ card, state: left }).slice(-50);
    setQueue(queue.slice(1)); setState(FRESH);
  };

  const pickCase = (id) => {
    if (state.picked !== null) return;
    record({ right: id === card.answer });
    setState({ picked: id, shown: true });
  };
  const pickOption = (k) => {
    if (state.picked !== null) return;
    record({ right: !!card.options[k].right });
    setState({ picked: k, shown: true });
  };
  const grade = (g) => { record({ grade: g }); next({ ...state, shown: true }); };

  const main = card.check !== "self" ? (state.picked !== null
    ? <Btn block kind="pri" testID="casecard-next" label="Continue" onPress={() => next()} />
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
      <Btn kind="ghost" testID="casecards-finish" label="Finish" style={{ marginTop: main ? 10 : 0 }}
           onPress={() => { keepMiss(state); setFinished(true); setQueue([]); }} />
    </>
  );

  /* Stepped back: the card as it was left, and the way forward again. */
  const viewed = back > 0 ? history.current[history.current.length - back] : null;
  if (viewed) {
    return (
      <Screen fill footer={<Btn block kind="pri" testID="casecard-forward" label="Continue" onPress={() => setBack(back - 1)} />}>
        <View style={{ minHeight: 28 }} />
        <View testID="casecard-well" style={{ flexGrow: 1, justifyContent: "center", paddingBottom: 12 }}>
          <OnTop swapKey={`back:${back}`}>
            <CaseCard key={`back:${back}`} card={viewed.card} state={viewed.state} onPick={() => {}} />
          </OnTop>
        </View>
      </Screen>
    );
  }

  return (
    <Screen fill footer={footer}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 28 }}>
        <Muted testID="casecards-count">{count ? `${count} ${count === 1 ? "card" : "cards"}` : ""}</Muted>
        {focus ? (
          <Btn kind="link" testID="casecards-focus-clear" label={`${triggerTitle(focus)} ✕`} onPress={clearFocus}
               accessibilityLabel={`Only ${triggerTitle(focus)}: show every trigger`} />
        ) : null}
      </View>
      <View testID="casecard-well" style={{ flexGrow: 1, justifyContent: "center", paddingBottom: 12 }}>
        <OnTop swapKey={`${deals.current}:${queue.length}`}>
          <CaseCard key={`${deals.current}:${queue.length}`} card={card} state={state}
                    onPick={card.check === "case" ? pickCase : pickOption} />
        </OnTop>
      </View>
      {options}
    </Screen>
  );
}
