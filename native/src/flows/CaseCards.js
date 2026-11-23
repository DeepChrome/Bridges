/* Case cards: paths of flashcards on the words that decide a case (the
 * owner, 2026-11-23; docs/case-cards.md is the framework, core/casecards.js
 * the paths, core/triggers.js the catalogue).
 *
 * Two screens. `CaseCards` lists the triggers by case, each with how well it
 * is held, and starts a session; a trigger tapped there is practised on its
 * own. `CaseCardsRun` is the session: paths of three or four cards, every card
 * a different word, mixed across the cases.
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
 * `st.drills.casecards.recent` so the next sessions draw others first.
 */

import React, { useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useSession } from "../session";
import { useTheme, radius, type as T } from "../theme";
import { Screen, Btn, List, Row, RowText, Text, Muted, Sheet, Loading, Lift, toneOf, Speaker, Pill,
         OptionRow, SectionLabel, Familiarity } from "../ui";
import { Linked } from "../words";
import { useHeaderOptions } from "../headermenu";
import { useAbout } from "../about";
import { Table } from "../rules";
import { useAudioStopOnLeave } from "../screens/Run";
import { Q } from "../questions";
import { L, IX } from "../data";
import { CASES, caseById } from "@core/cases";
import { triggerById, TRIGGER_KINDS } from "@core/triggers";
import { caseSession, offered, pathGrades, gradeTriggers, keepRecent, FACES, ORDERS, SESSION_PATHS } from "@core/casecards";
import { gradeSkill, familiarity, cardFor, schedulerOpts } from "@core/scheduler";
import { fold, TOKEN } from "@core/util";

/* The score a production card's grade moves (FormCards' FORM_SKILL). */
const FORMS = "forms";
const CASECARDS_KEY = "casecards";
const PATH_COUNTS = [3, 5, 8];

/* ------------------------------------------------------------ the words */

const stressed = (bare) => {
  const ids = IX[fold(bare)];
  return ids && L[ids[0]] ? L[ids[0]].w : bare;
};

/* How a trigger is named on the list and on a Trigger card: its word, or its
   first verbs stressed, or what kind of word governs. */
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
  return s.ru.slice(spans[a].index, spans[b].index + spans[b][0].length);
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

/* What the trigger is, under a case answer and on every back: the trigger,
   its meaning, the case and the question it answers. */
function TriggerLine({ x, s, right }) {
  const t = useTheme();
  return (
    <View testID="casecard-why" style={{ marginTop: 16, flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <Pill tone={right === false ? "bad" : right === true ? "good" : "brand"} testID="casecard-case">
        {caseName(x.case)}
      </Pill>
      <Text style={{ color: t.ink, fontWeight: "700", fontSize: T.body }}>{governorTitle(x, s)}</Text>
      <Muted size={T.small} style={{ flexShrink: 1 }}>{`${x.en} · ${x.ask}`}</Muted>
    </View>
  );
}

function CaseCard({ card, state, onPick, onShow }) {
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
      <TriggerLine x={x} s={s} right={check === "case" ? state.picked === x.case : undefined} />
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
                                                    backgroundColor: t.surface, padding: 20, marginTop: 12 }}>
      {front}
      {check === "case" ? <CaseChoices answer={x.case} picked={state.picked} onPick={onPick} /> : null}
      {back}
      {check === "self" && !shown ? (
        <View style={{ marginTop: 18 }}>
          <Btn block kind="pri" testID="casecard-show" label="Show" onPress={onShow} />
        </View>
      ) : null}
    </View>
  );
}

/* --------------------------------------------------------------- options */

function casePrefs(st) {
  return ((st.drillPrefs || {})[CASECARDS_KEY]) || {};
}

function CaseCardOptions({ prefs, onChange, onClose }) {
  const cases = prefs.cases && prefs.cases.length ? prefs.cases : CASES.map((c) => c.id);
  const kinds = prefs.kinds && prefs.kinds.length ? prefs.kinds : TRIGGER_KINDS.map((k) => k.id);
  return (
    <Sheet onClose={onClose} testID="casecards-options" title="Case card options" maxHeight="88%"
           footer={<Btn block kind="pri" testID="casecards-apply" label="Apply" style={{ marginTop: 8 }} onPress={onClose} />}>
      <List>
        <OptionRow testID="casecards-cases" title="Cases" multi minOne value={cases}
                   options={CASES.map((c) => ({ id: c.id, name: c.name }))}
                   onPick={(ids) => onChange({ ...prefs, cases: ids.length === CASES.length ? null : ids })} />
        <OptionRow testID="casecards-kinds" title="Triggers" multi minOne value={kinds}
                   options={TRIGGER_KINDS}
                   onPick={(ids) => onChange({ ...prefs, kinds: ids.length === TRIGGER_KINDS.length ? null : ids })} />
        <OptionRow testID="casecards-order" title="Order" value={prefs.order || "mixed"} options={ORDERS}
                   onPick={(id) => onChange({ ...prefs, order: id })} />
        <OptionRow testID="casecards-paths" title="Paths a session" value={String(prefs.paths || SESSION_PATHS)}
                   options={PATH_COUNTS.map((n) => ({ id: String(n), name: String(n) }))}
                   onPick={(id) => onChange({ ...prefs, paths: Number(id) })} />
      </List>
    </Sheet>
  );
}

/* ------------------------------------------------------------ the list */

/* Every trigger with enough sentences, under its case, with how well it is
   held — a ring, or New. A tap practises that one; Start runs a session. */
export function CaseCards({ navigation, route }) {
  const { st, update, ready } = useSession();
  const t = useTheme();
  const prefs = casePrefs(st);
  const [cog, setCog] = useState(false);
  useHeaderOptions(route, () => setCog(true), "Case card options");
  const list = useMemo(() => offered(Q.triggerSightings()), []);
  const cards = st.caseCards || {};
  if (!ready) return <Screen><Loading /></Screen>;
  const setPrefs = (next) => update((p) => ({ ...p, drillPrefs: { ...(p.drillPrefs || {}), [CASECARDS_KEY]: next } }));
  return (
    <>
      <Screen footer={<Btn block kind="pri" testID="casecards-start" label="Start"
                           onPress={() => navigation.navigate("CaseCardsRun", {})} />}>
        {CASES.map((c, k) => {
          const mine = list.filter((x) => x.case === c.id);
          if (!mine.length) return null;
          return (
            <View key={c.id}>
              <SectionLabel gap={k > 0}>{c.name}</SectionLabel>
              <List>
                {mine.map((x) => {
                  const score = familiarity(cards[x.id] || null);
                  return (
                    <Row key={x.id} testID={`trigger-${x.id}`}
                         onPress={() => navigation.navigate("CaseCardsRun", { focus: x.id })}>
                      <RowText title={triggerTitle(x)} sub={x.en} />
                      {score === null ? <Pill testID={`trigger-new-${x.id}`}>New</Pill>
                        : <Familiarity score={score} size={30} testID={`trigger-score-${x.id}`} />}
                    </Row>
                  );
                })}
              </List>
            </View>
          );
        })}
        <Muted size={T.tiny} style={{ marginTop: 14, textAlign: "center", color: t.ink3 }}>
          {`${list.length} triggers`}
        </Muted>
      </Screen>
      {cog ? <CaseCardOptions prefs={prefs} onChange={setPrefs} onClose={() => setCog(false)} /> : null}
    </>
  );
}

/* ------------------------------------------------------------ the run */

const GRADES = [[1, "Again", "bad"], [2, "Hard", "plain"], [3, "Good", "good"], [4, "Easy", "pri"]];

export function CaseCardsRun({ navigation, route }) {
  const { st, update, ready } = useSession();
  const t = useTheme();
  const focus = (route.params || {}).focus || null;
  const prefs = casePrefs(st);
  const [seed, setSeed] = useState(0);
  const [p, setP] = useState(0);         // which path
  const [c, setC] = useState(0);         // which card in it
  const [state, setState] = useState({ picked: null, shown: false });
  const results = useRef([]);            // this path's, card by card
  const [ended, setEnded] = useState([]); // { trigger, grade } per finished path
  useAudioStopOnLeave();

  const paths = useMemo(() => {
    if (!ready) return null;
    const seen = st.seen || {};
    const known = (i) => {
      const card = L[i] ? cardFor(seen[L[i].b]) : null;
      const f = familiarity(card);
      return f === null ? 0 : f / 100;
    };
    return caseSession({
      sightings: Q.triggerSightings(), cards: st.caseCards || {}, now: Date.now(),
      n: focus ? 4 : prefs.paths || SESSION_PATHS, focus, cases: prefs.cases, kinds: prefs.kinds,
      order: prefs.order || "mixed", known, recent: (((st.drills || {})[CASECARDS_KEY]) || {}).recent,
      schedOpts: schedulerOpts(st),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, seed, focus]);

  const path = paths && paths[p];
  const card = path && path.cards[c];
  useAbout(card ? {
    kind: "casecard", step: `path ${p + 1} of ${paths.length}, card ${c + 1} of ${path.cards.length}`,
    text: [card.face === "use" ? card.s.ru.replace(card.s.token, "___") : card.face === "notice" ? card.s.ru : "",
           card.face === "trigger" || card.face === "form" ? `${triggerTitle(triggerById(card.trigger))}: ${triggerById(card.trigger).en}` : "",
           state.picked || state.shown ? `Answer: ${caseName(triggerById(card.trigger).case)}, ${card.s.said}` : ""]
      .filter(Boolean).join("\n"),
  } : null);

  if (!paths) return <Screen><Loading /></Screen>;
  if (!paths.length) {
    return (
      <Screen>
        <RowText title="Nothing to practice with these options" bold={false} />
        <View style={{ marginTop: 16 }}>
          <Btn block kind="pri" label="Back" testID="casecards-back" onPress={() => navigation.goBack()} />
        </View>
      </Screen>
    );
  }

  if (!path) {
    // The end: each trigger met, with what the session did to it.
    const cards = st.caseCards || {};
    return (
      <Screen footer={
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Btn kind="plain" testID="casecards-again" label="Again" style={{ flex: 1 }}
               onPress={() => { results.current = []; setEnded([]); setP(0); setC(0); setState({ picked: null, shown: false }); setSeed(seed + 1); }} />
          <Btn kind="pri" testID="casecards-done" label="Done" style={{ flex: 1 }} onPress={() => navigation.goBack()} />
        </View>}>
        <Text testID="casecards-end" style={{ color: t.ink, fontSize: T.title, fontWeight: "700" }}>Session done</Text>
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
      </Screen>
    );
  }

  const next = () => {
    if (c + 1 < path.cards.length) {
      setC(c + 1);
      setState({ picked: null, shown: false });
      return;
    }
    // The path is done: grade its triggers once, keep its sentences.
    const grades = pathGrades(path, results.current);
    const shown = path.cards.map((x) => x.s.ru);
    const now = Date.now();
    update((prev) => ({
      ...prev,
      caseCards: gradeTriggers(prev.caseCards, grades, now, schedulerOpts(prev)),
      drills: { ...(prev.drills || {}),
                [CASECARDS_KEY]: { ...((prev.drills || {})[CASECARDS_KEY] || {}),
                                   recent: keepRecent((((prev.drills || {})[CASECARDS_KEY]) || {}).recent, shown) } },
    }));
    setEnded(ended.concat(Object.keys(grades).map((id) => ({ trigger: id, grade: grades[id] }))));
    results.current = [];
    setP(p + 1);
    setC(0);
    setState({ picked: null, shown: false });
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
  const footer = check === "case" && state.picked ? (
    <Btn block kind="pri" testID="casecard-next" label="Continue" onPress={next} />
  ) : check === "self" && state.shown ? (
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
  ) : null;

  return (
    <Screen footer={footer}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <RowText testID="casecards-progress" title={`Path ${p + 1} of ${paths.length}`} bold={false} />
        <PathDots n={path.cards.length} at={c} />
      </View>
      <CaseCard key={`${seed}:${p}:${c}`} card={card} state={state} onPick={pick}
                onShow={() => setState({ ...state, shown: true })} />
    </Screen>
  );
}

/* Where in the path: one dot a card, the done ones filled. */
function PathDots({ n, at }) {
  const t = useTheme();
  return (
    <View testID="casecards-dots" style={{ flexDirection: "row", gap: 6 }}
          accessibilityLabel={`Card ${at + 1} of ${n}`}>
      {Array.from({ length: n }, (_, k) => (
        <View key={k} style={{ width: 8, height: 8, borderRadius: 4,
                               backgroundColor: k <= at ? t.brand : t.surface3 }} />
      ))}
    </View>
  );
}
