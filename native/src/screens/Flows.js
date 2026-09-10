/* Everything the runner drives: vocabulary, lesson quiz, drills, and the two
 * placement routes. Each one supplies its steps and decides what the result means. */

import React, { useMemo, useState } from "react";
import { View, Text, Image } from "react-native";
import { useSession } from "../session";
import { useTheme, radius } from "../theme";
import { IMAGES } from "../images";
import { Screen, Card, Btn, Bar, Pill, Speaker, Muted, List, Row, Thumb, Senses, SectionLabel, Chip } from "../ui";
import { Runner, Done, useAudioStopOnLeave } from "./Run";
import { talkUnlocked, TALK_UNLOCK_STAGE } from "./Talk";
import { Linked } from "../words";
import { Q, DRILL_TYPES, TEST_OUT, QUIZ_KINDS, QUIZ_LENGTHS } from "../questions";
import {
  L, UN, STAGES, lessonWords, lessonCount, markComponent, PASS_MARK, drillPool,
  reachedUnits, unitUnlocked, reviewWords, passages, knownWords,
} from "../data";
import { quizPassed } from "@core/state";
import { firstSense } from "@core/util";
import { soundTip } from "@core/alphabet";
import { touchStreak } from "../store";

/* The mark for a run: partial credit summed over first attempts, as a percentage. */
const scoreOf = (r) => (r.total ? Math.round(r.credit / r.total * 100) : 0);

/* ------------------------------------------------------------- vocabulary */

export function VocabFlow({ route, navigation }) {
  const { st, update } = useSession();
  const t = useTheme();
  const unit = UN.find((u) => u.id === route.params.unitId);
  const index = route.params.index;
  const steps = useMemo(() => Q.vocabSteps(unit, index), [unit.id, index]);
  const [at, setAt] = useState(0);
  const [done, setDone] = useState(false);
  useAudioStopOnLeave();

  if (done) {
    return (
      <Done
        title="Vocabulary done"
        detail={`${lessonWords(unit, index).length} words met`}
        onBack={() => navigation.goBack()}
      />
    );
  }

  // The teaching steps are shown here; question steps hand off to the runner, one
  // at a time, so a lesson interleaves rather than front-loading every card.
  const step = steps[at];
  const advance = () => {
    if (at + 1 >= steps.length) {
      update((prev) => markComponent(prev, unit, index, "vocab"));
      setDone(true);
    } else {
      setAt(at + 1);
    }
  };

  /* The lesson's words, all of them, before the cards begin (the owner,
     2026-09-10). Scrollable rather than paged: reading the set together is the
     point, so it is one list with the photograph, the word and its first
     meaning on each line. */
  if (step.t === "list") {
    return (
      <Screen>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <View style={{ flex: 1 }}><Bar value={at / steps.length} /></View>
          <Pill tone="brand">{`${at + 1}/${steps.length}`}</Pill>
        </View>
        <SectionLabel testID="vocab-list">
          {`${step.words.length} new ${step.words.length === 1 ? "word" : "words"}`}
        </SectionLabel>
        <List>
          {step.words.map((i, k) => {
            const word = L[i];
            return (
              <Row key={i} testID={`new-${word.b}`} last={k === step.words.length - 1}>
                {IMAGES[word.b] ? (
                  <Image source={IMAGES[word.b]} resizeMode="cover"
                         accessibilityLabel={`Photo: ${(word.e || "").split(/[,;]/)[0]}`}
                         style={{ width: 46, height: 46, borderRadius: radius.sm }} />
                ) : (
                  <Thumb id={unit.id} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 19, fontWeight: "600" }}>{word.w}</Text>
                  <Muted numberOfLines={1}>{firstSense(word)}</Muted>
                </View>
                <Speaker text={word.b} size={36} />
              </Row>
            );
          })}
        </List>
        <View style={{ marginTop: "auto", paddingTop: 16 }}>
          <Btn kind="pri" label="Start learning" onPress={advance} />
        </View>
      </Screen>
    );
  }

  if (step.t === "grammar" || step.t === "word") {
    const w = step.t === "word" ? L[step.i] : null;
    return (
      <Screen fill>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12,
                       marginBottom: 16 }}>
          <View style={{ flex: 1 }}><Bar value={at / steps.length} /></View>
          <Pill tone="brand">{`${at + 1}/${steps.length}`}</Pill>
        </View>
        {step.t === "grammar" ? (
          <Card>
            <Muted>{unit.name}</Muted>
            <Text style={{ color: t.ink, fontSize: 19, fontWeight: "600",
                           marginTop: 6, marginBottom: 8 }}>{step.note.title}</Text>
            <Text style={{ color: t.ink2, fontSize: 15 }}>{step.note.body}</Text>
            {(step.note.examples || []).map(([ru, en], k) => (
              <View key={k} style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1,
                                     borderTopColor: t.lineSoft }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Linked text={ru} size={19} />
                  </View>
                  <Speaker text={ru} size={36} />
                </View>
                <Muted>{en}</Muted>
              </View>
            ))}
          </Card>
        ) : (
          <Card style={{ alignItems: "center" }}>
            {IMAGES[w.b] ? (
              // A photograph of the thing, when Commons has a public-domain one
              // (tools/harvest_images.py). Above the word: see it, then read it.
              <Image testID="word-photo" source={IMAGES[w.b]} resizeMode="cover"
                     accessibilityLabel={`Photo: ${(w.e || "").split(/[,;]/)[0]}`}
                     style={{ width: "100%", height: 150, borderRadius: radius.md, marginBottom: 12 }} />
            ) : null}
            <Muted>New word</Muted>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10,
                           marginVertical: 8 }}>
              <Text style={{ color: t.ink, fontSize: 38, fontWeight: "600" }}>{w.w}</Text>
              <Speaker text={w.b} />
            </View>
            {/* The whole entry, sense by sense, and the word in two contexts — a
                card a learner can read, not a gloss (the owner, 2026-09-07). */}
            <Senses e={w.e} size={16} style={{ marginTop: 0 }} />
            <View style={{ flexDirection: "row", gap: 6, marginTop: 10 }}>
              {[w.p, w.g, w.a].filter(Boolean).map((x) => <Pill key={x}>{x}</Pill>)}
            </View>
            {/* One line about a sound this word carries — a letter that is not
                what it looks like, or one English has not got (ROADMAP P10.2).
                A tip, not a lesson: the whole system is under Practice → Sounds. */}
            {soundTip(w.b) ? (
              <View testID="sound-tip"
                    style={{ marginTop: 12, backgroundColor: t.surface2, borderRadius: radius.sm,
                             paddingHorizontal: 12, paddingVertical: 9, alignSelf: "stretch" }}>
                <Muted size={13} style={{ textAlign: "center" }}>{soundTip(w.b)}</Muted>
              </View>
            ) : null}
            {(w.x || []).slice(0, 2).map((ex, k) => (
              <View key={k} style={{ marginTop: k ? 10 : 14, paddingTop: k ? 10 : 12, borderTopWidth: 1,
                                     borderTopColor: t.lineSoft, alignSelf: "stretch" }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Linked text={ex.ru} size={18} />
                  </View>
                  <Speaker text={ex.ru} size={36} />
                </View>
                <Muted>{ex.en}</Muted>
              </View>
            ))}
          </Card>
        )}
        {/* marginTop:"auto" against Screen's flexGrow: the action holds one position
            whatever the card's height, instead of moving down the screen each step.
            The gap lives on the wrapper — putting it on the button would change the
            button's own padding. */}
        <View style={{ marginTop: "auto", paddingTop: 16 }}>
          {/* The word list that follows a grammar card owns "Start learning", so
              the card itself only moves on — the two used to carry the same
              label and the lesson asked to start twice. */}
          <Btn kind="pri"
               label={step.t === "grammar" ? "Continue"
                      : at + 1 >= steps.length ? "Finish" : "Continue"}
               onPress={advance} />
        </View>
      </Screen>
    );
  }

  // A single question, rendered by the shared runner.
  return (
    <Runner
      key={at}
      steps={[step]}
      progress={{ at, total: steps.length }}
      recycle={false}
      onFinish={advance}
    />
  );
}

/* -------------------------------------------------------------- lesson quiz */

export function QuizFlow({ route, navigation }) {
  const { unitId, index } = route.params;
  const unit = UN.find((u) => u.id === unitId);
  const { st, update } = useSession();
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  // The quiz tops up with what is due or in trouble before the unit's earlier
  // words: review comes to the path (the pedagogy review, 2026-09-08).
  // `st.seen` rides along so a word the scheduler already trusts is asked by
  // typing rather than by four choices (ROADMAP P10.1).
  const steps = useMemo(() => Q.quizSteps(unit, index, reviewWords(st), st.seen),
                        [unitId, index, seed]);
  useAudioStopOnLeave();

  if (result) {
    // What the lesson list will show, not the raw mark: the relief rule
    // (core/state.js quizPassed) accepts a lower score from the third try,
    // and this screen used to say "Not quite" over a quiz the list ticked.
    const { passed, relief } = result;
    const last = index + 1 >= lessonCount(unit);
    return (
      <Done
        title={relief ? `Passed on the ${ordinal(result.tries)} try`
             : passed ? "Quiz passed" : `Not quite. ${PASS_MARK}% to pass`}
        detail={`${result.right} of ${result.total} right`}
        score={result.score}
        passed={passed}
        againLabel="Try again"
        onAgain={() => { setResult(null); setSeed(seed + 1); }}
        onContinue={passed && !last
          ? () => navigation.replace("Vocab", { unitId, index: index + 1 })
          : undefined}
        continueLabel="Next lesson"
        onBack={() => navigation.goBack()}
      />
    );
  }

  return (
    <Runner
      steps={steps}
      navigation={navigation}
      onFinish={(r) => {
        const score = scoreOf(r);
        const before = ((st.unit[unit.id] || {}).lessons || {})[index] || {};
        const slot = { q: Math.max(before.q || 0, score), tries: (before.tries || 0) + 1 };
        const passed = quizPassed(slot);
        update((prev) => touchStreak({
          ...markComponent(prev, unit, index, "quiz", score),
          xp: (prev.xp || 0) + r.right * 2 + (passed ? 10 : 0),
        }));
        setResult({ ...r, score, passed, relief: passed && score < PASS_MARK, tries: slot.tries });
      }}
    />
  );
}

const ordinal = (n) => (n === 1 ? "first" : n === 2 ? "second" : n === 3 ? "third" : `${n}th`);

/* ------------------------------------------------------------------ drills */

export function DrillList({ navigation }) {
  const { st } = useSession();
  const t = useTheme();
  const talkOpen = talkUnlocked(st);
  const openDrills = useMemo(() => Q.drillsIntroduced(reachedUnits(st)), [st.unit]);
  return (
    <Screen>
      {/* What is not a grammar drill comes first: a quiz of the learner's own
          making, listening scenes, and conversation. */}
      <SectionLabel>Practise</SectionLabel>
      <List>
        <Row onPress={() => navigation.navigate("QuizSetup")}>
          <Thumb id="core" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>Quiz</Text>
            <Muted>Choose the questions and the sections</Muted>
          </View>
          {((st.drills || {}).quiz || {}).best
            ? <Pill tone="good">{(st.drills.quiz.best) + "%"}</Pill> : null}
        </Row>
        <Row onPress={() => navigation.navigate("Listening")}>
          <Thumb id="speech" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>Listening</Text>
            <Muted>Half a minute of one speaker, on one subject</Muted>
          </View>
        </Row>
        {/* The older activity: a few sentences from the pools, each with its own
            meaning. Kept because it is the only listening a beginner can do —
            a passage of native speech needs words they have not met yet. */}
        <Row onPress={() => navigation.navigate("Scenes")}>
          <Thumb id="time" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>Scenes</Text>
            <Muted>Short sentences from what you have met</Muted>
          </View>
          {((st.drills || {}).listening || {}).best
            ? <Pill tone="good">{(st.drills.listening.best) + "%"}</Pill> : null}
        </Row>
        <Row onPress={() => navigation.navigate("Talk")} disabled={!talkOpen}>
          <Thumb id="emotion" locked={!talkOpen} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>Talk</Text>
            <Muted>{talkOpen ? "A short conversation on a topic" : `Opens after chapter ${TALK_UNLOCK_STAGE + 1}`}</Muted>
          </View>
        </Row>
        {/* The letters and the mouth behind them (ROADMAP P10.2). Open from the
            first screen: nothing else in the app teaches the alphabet. */}
        <Row last onPress={() => navigation.navigate("Sounds")}>
          <Thumb id="speech" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>Sounds</Text>
            <Muted>The alphabet, the vowel pairs and the vowel chart</Muted>
          </View>
        </Row>
      </List>
      <SectionLabel style={{ marginTop: 18 }}>Grammar drills</SectionLabel>
      {/* A drill opens when the route has taught its rule (core/questions.js
          drillsIntroduced), read off the same grammar cards that drive the form
          question. Aspect belongs to chapter 8, and offering it in chapter 1
          meant asking the same fifteen questions the learner's words could fill
          (the owner, 2026-09-10). */}
      <List>
        {DRILL_TYPES.map((d, k) => {
          const best = ((st.drills || {})[d.id] || {}).best;
          const open = st.dev || openDrills.has(d.id);
          const at = Q.drillOpensAt(d.id);
          return (
            <Row key={d.id} last={k === DRILL_TYPES.length - 1} disabled={!open}
                 testID={`drill-${d.id}`}
                 onPress={() => open && navigation.navigate("Drill", { type: d.id })}>
              <Thumb id={d.icon} locked={!open} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>
                  {d.name}
                </Text>
                <Muted>{open ? d.blurb : `Opens in chapter ${at + 1}`}</Muted>
              </View>
              {open && best ? <Pill tone="good">{best + "%"}</Pill> : null}
            </Row>
          );
        })}
      </List>
    </Screen>
  );
}

export function DrillFlow({ route, navigation }) {
  const { type } = route.params;
  const { st, update } = useSession();
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  // Only the learner's own words (data.js drillPool); the pool is fixed for the
  // run so answering does not reshuffle the questions underneath. The cases
  // drill asks only for the cases the route so far has taught.
  //
  // Unless the drill is open only because developer mode says so: a learner in
  // chapter 1 who opens Aspect has met eight verbs, and the drill would ask the
  // same handful all run. Skipping ahead means the whole curriculum is fair game.
  const ahead = useMemo(() => !Q.drillsIntroduced(reachedUnits(st)).has(type), [type]);
  const pool = useMemo(() => (ahead ? null : drillPool(st)), [type, seed, ahead]);
  const cells = useMemo(
    () => (type === "cases" && !ahead ? Q.formsIntroduced(reachedUnits(st)) : undefined),
    [type, seed, ahead]);
  const steps = useMemo(() => Q.drillQuestions(type, undefined, pool, cells), [type, seed, pool, cells]);
  const spec = DRILL_TYPES.find((d) => d.id === type);
  useAudioStopOnLeave();

  if (!steps.length) {
    const from = cells && !cells.length ? STAGES.findIndex((s) => Q.formsIntroduced([s.core]).length) : -1;
    return (
      <Done title={from >= 0 ? "Not yet" : "No questions available"}
            detail={from >= 0 ? `The cases come with chapter ${from + 1}.` : undefined}
            onBack={() => navigation.goBack()} />
    );
  }
  if (result) {
    return (
      <Done
        title={spec.name}
        detail={`${result.right} of ${result.total} right` +
                (result.helped ? ` · ${result.helped} with the table` : "")}
        score={result.score}
        passed={result.score >= 80}
        onAgain={() => { setResult(null); setSeed(seed + 1); }}
        onBack={() => navigation.goBack()}
      />
    );
  }

  return (
    <Runner
      steps={steps}
      navigation={navigation}
      onFinish={(r) => {
        const score = scoreOf(r);
        update((prev) => bestOf(prev, type, score, r.right));
        setResult({ ...r, score });
      }}
    />
  );
}

/* Best and runs for a practice run, keyed like the grammar drills. */
const bestOf = (prev, key, score, xp) => {
  const drills = { ...(prev.drills || {}) };
  const cur = drills[key] || { best: 0, runs: 0 };
  drills[key] = { best: Math.max(cur.best || 0, score), runs: (cur.runs || 0) + 1 };
  return touchStreak({ ...prev, drills, xp: (prev.xp || 0) + xp });
};

/* ------------------------------------------------------------- listening */

export const LISTENING_N = 5;

/* The passages on offer: half a minute of one speaker each, ranked by how many of
   this learner's own words they say (ROADMAP P10.3). Grouped by the video they
   come from, so the list reads as topics rather than as 900 spans. */
export function ListeningList({ navigation }) {
  const { st } = useSession();
  const t = useTheme();
  const known = useMemo(() => new Set(knownWords(st)), [st.seen]);
  const shown = useMemo(() => Q.passagesFor(passages(), known, 30), [known]);

  if (!shown.length) {
    return (
      <Done title="Not yet"
            detail="A passage needs a few words you have already met. Come back after a lesson or two."
            onBack={() => navigation.goBack()} />
    );
  }
  return (
    <Screen>
      <SectionLabel>{`${shown.length} passages`}</SectionLabel>
      <Muted style={{ marginBottom: 10 }}>
        Half a minute of one speaker on one subject, richest in your own words first.
      </Muted>
      <List>
        {shown.map((p, k) => {
          const fit = Q.passageFit(p, known);
          const best = ((st.drills || {})[`passage:${p.id}`] || {}).best;
          return (
            <Row key={p.id} last={k === shown.length - 1} testID={`passage-${p.id}`}
                 onPress={() => navigation.navigate("Passage", { id: p.id })}>
              <Thumb id="speech" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}
                      numberOfLines={2}>
                  {p.title}
                </Text>
                <Muted>{`${fit} words you know · ${Math.round((p.end - p.start) / 1000)}s`}</Muted>
              </View>
              {best ? <Pill tone="good">{best + "%"}</Pill> : null}
            </Row>
          );
        })}
      </List>
    </Screen>
  );
}

/* One passage: hear it, then answer for what you caught. */
export function PassageFlow({ route, navigation }) {
  const { st, update } = useSession();
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  const passage = useMemo(() => passages().find((p) => p.id === route.params.id), [route.params.id]);
  const known = useMemo(() => new Set(knownWords(st)), [st.seen]);
  const steps = useMemo(() => {
    if (!passage) return [];
    const qs = Q.passageQuestions(passage, known);
    if (!qs.length) return [];
    // The passage itself is the first step; the questions follow it.
    return [{ kind: "passage", video: passage.v, title: passage.title,
              start: passage.start, end: passage.end }].concat(qs);
  }, [passage, seed]);
  useAudioStopOnLeave();

  if (!passage || !steps.length) {
    return <Done title="Not yet"
                 detail="This passage needs a few more words you have met."
                 onBack={() => navigation.goBack()} />;
  }
  if (result) {
    return (
      <Done title="Listening" detail={`${result.right} of ${result.total} caught`}
            score={result.score} passed={result.score >= 80}
            onAgain={() => { setResult(null); setSeed(seed + 1); }}
            onBack={() => navigation.goBack()} />
    );
  }
  return (
    <Runner steps={steps} recycle={false} navigation={navigation}
            onFinish={(r) => {
              const score = scoreOf(r);
              update((prev) => bestOf(prev, `passage:${passage.id}`, score, r.right * 2));
              setResult({ ...r, score });
            }} />
  );
}

export function ListeningFlow({ navigation }) {
  const { st, update } = useSession();
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  const units = useMemo(() => reachedUnits(st), [seed]);
  // Scenes that open on a word from the trouble bank, when the pools have one.
  const steps = useMemo(() => Q.listeningDrill(units, LISTENING_N, new Set(reviewWords(st))), [units, seed]);
  useAudioStopOnLeave();

  if (!steps.length) {
    return <Done title="Nothing to listen to yet" detail="Scenes need a few sentences from your units."
                 onBack={() => navigation.goBack()} />;
  }
  if (result) {
    return (
      <Done title="Listening" detail={`${result.right} of ${result.total} scenes clean`}
            score={result.score} passed={result.score >= 80}
            onAgain={() => { setResult(null); setSeed(seed + 1); }}
            onBack={() => navigation.goBack()} />
    );
  }
  return (
    <Runner steps={steps} recycle={false} navigation={navigation}
            onFinish={(r) => {
              const score = scoreOf(r);
              update((prev) => bestOf(prev, "listening", score, r.right * 2));
              setResult({ ...r, score });
            }} />
  );
}

/* ------------------------------------------------------------------ quiz */

/* The learner's own quiz: which kinds of question, which sections, how long. The
   sections default to everything up to where they are on the path. */
export function QuizSetup({ navigation }) {
  const { st } = useSession();
  const t = useTheme();
  const reached = useMemo(() => reachedUnits(st).map((u) => u.id), []);
  const [kinds, setKinds] = useState(QUIZ_KINDS.map((k) => k.id));
  const [units, setUnits] = useState(reached);
  const [n, setN] = useState(QUIZ_LENGTHS[0]);
  const flip = (list, set) => (id) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : list.concat(id));
  const ready = kinds.length > 0 && units.length > 0;

  const Section = ({ label }) => <SectionLabel style={{ marginTop: 18 }}>{label}</SectionLabel>;

  return (
    <Screen>
      <Section label="Questions" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {QUIZ_KINDS.map((k) => (
          <Chip key={k.id} on={kinds.includes(k.id)} label={k.name}
                onPress={() => flip(kinds, setKinds)(k.id)} testID={`kind-${k.id}`} />
        ))}
      </View>
      <Section label="Sections" />
      {STAGES.map((s, si) => {
        const here = [s.core].concat(s.branches).filter((u) => unitUnlocked(st, u));
        if (!here.length) return null;
        return (
          <View key={s.core.id} style={{ marginBottom: 10 }}>
            <Muted style={{ marginBottom: 6 }}>{`Chapter ${s.n} · ${s.title}`}</Muted>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {here.map((u) => (
                <Chip key={u.id} on={units.includes(u.id)} label={u.name}
                      onPress={() => flip(units, setUnits)(u.id)} testID={`unit-${u.id}`} />
              ))}
            </View>
          </View>
        );
      })}
      <Section label="Length" />
      <View style={{ flexDirection: "row", gap: 6 }}>
        {QUIZ_LENGTHS.map((len) => (
          <Chip key={len} on={n === len} label={String(len)} onPress={() => setN(len)}
                testID={`len-${len}`} />
        ))}
      </View>
      <Btn kind="pri" label={ready ? "Start" : "Pick a question type and a section"}
           disabled={!ready} style={{ marginTop: 22 }}
           onPress={() => navigation.navigate("CustomQuiz", { kinds, units, n })} />
    </Screen>
  );
}

export function CustomQuizFlow({ route, navigation }) {
  const { kinds, units: unitIds, n } = route.params;
  const { update } = useSession();
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  const units = useMemo(() => unitIds.map((id) => UN.find((u) => u.id === id)).filter(Boolean), [unitIds]);
  const steps = useMemo(() => Q.customQuiz({ units, kinds, n }), [units, kinds, n, seed]);
  useAudioStopOnLeave();

  if (!steps.length) {
    return <Done title="No questions for that choice" detail="Try more sections or another kind of question."
                 onBack={() => navigation.goBack()} />;
  }
  if (result) {
    return (
      <Done title="Quiz" detail={`${result.right} of ${result.total} right`}
            score={result.score} passed={result.score >= PASS_MARK}
            onAgain={() => { setResult(null); setSeed(seed + 1); }}
            onBack={() => navigation.goBack()} />
    );
  }
  return (
    <Runner steps={steps} navigation={navigation}
            onFinish={(r) => {
              const score = scoreOf(r);
              update((prev) => bestOf(prev, "quiz", score, r.right));
              setResult({ ...r, score });
            }} />
  );
}

/* --------------------------------------------------------------- placement */

export function PlacementFlow({ navigation }) {
  const { update, updateAccount } = useSession();
  const [result, setResult] = useState(null);
  const steps = useMemo(() => Q.placementQuestions(), []);
  useAudioStopOnLeave();

  if (result) {
    return (
      <Done
        title="Placement complete"
        detail={result.detail}
        score={result.score}
        onBack={() => navigation.navigate("Path")}
      />
    );
  }

  return (
    <Runner
      steps={steps}
      recycle={false}
      navigation={navigation}
      onFinish={(r) => {
        // A stage is cleared when its questions were answered well enough. Stop at
        // the first stage that is not — placement must not leave holes behind you.
        let placed = 0;
        update((prev) => {
          let next = prev;
          for (let si = 0; si < STAGES.length; si++) {
            const qs = r.results.filter((x) => x.stage === si);
            if (!qs.length) break;
            if (qs.filter((x) => x.right).length / qs.length < TEST_OUT) break;
            placed = si + 1;
            const core = STAGES[si].core;
            for (let li = 0; li < lessonCount(core); li++) {
              next = markComponent(next, core, li, "vocab");
              next = markComponent(next, core, li, "quiz", 100);
            }
            if (core.v) next = markComponent(next, core, 0, "video");
          }
          return next;
        });
        // Saved with the profile, not written into the live record: the gate
        // and You read it back after a relaunch.
        updateAccount({ placed });
        setResult({
          score: scoreOf(r),
          detail: placed
            ? `${placed === 1 ? "Chapter 1 is" : `Chapters 1–${placed} are`} marked done. You start at chapter ${placed + 1}.`
            : "Starting from chapter 1. Nothing to skip yet.",
        });
      }}
    />
  );
}

export function SectionFlow({ route, navigation }) {
  const unit = UN.find((u) => u.id === route.params.unitId);
  const { update } = useSession();
  const [result, setResult] = useState(null);
  const steps = useMemo(() => Q.sectionQuestions(unit), [unit.id]);
  useAudioStopOnLeave();

  if (result) {
    return (
      <Done title={`${unit.name} test`} detail={result.detail} score={result.score}
            onBack={() => navigation.goBack()} />
    );
  }

  return (
    <Runner
      steps={steps}
      recycle={false}
      navigation={navigation}
      onFinish={(r) => {
        let cleared = 0;
        update((prev) => {
          let next = prev;
          for (let li = 0; li < lessonCount(unit); li++) {
            const qs = r.results.filter((x) => x.lesson === li);
            if (!qs.length) continue;
            const rate = qs.filter((x) => x.right).length / qs.length;
            if (rate >= TEST_OUT) {
              next = markComponent(next, unit, li, "vocab");
              next = markComponent(next, unit, li, "quiz", Math.round(rate * 100));
              cleared += 1;
            }
          }
          return next;
        });
        setResult({
          score: scoreOf(r),
          detail: cleared
            ? `${cleared} of ${lessonCount(unit)} lessons marked done.`
            : "No lessons skipped. Worth working through this one.",
        });
      }}
    />
  );
}
