/* Everything the runner drives: vocabulary, lesson quiz, drills, and the two
 * placement routes. Each one supplies its steps and decides what the result means. */

import React, { useMemo, useRef, useState } from "react";
import { View, Pressable } from "react-native";
import { useSession } from "../session";
import { useTheme, radius } from "../theme";
import { Screen, Card, Btn, Pill, Speaker, Muted, List, Row, Thumb, SectionLabel, Chip, Text } from "../ui";
import { Runner, Done, useAudioStopOnLeave } from "./Run";
import { talkUnlocked, TALK_UNLOCK_STAGE } from "./Talk";
import { WordList, GrammarNote, WordCard } from "../lesson";
import { Q, DRILL_TYPES, TEST_OUT, QUIZ_KINDS, QUIZ_LENGTHS } from "../questions";
import {
  L, UN, STAGES, lessonWords, lessonCount, markComponent, PASS_MARK, drillPool,
  reachedUnits, unitUnlocked, reviewWords, passages, knownWords, lessonsDone, nextLesson,
  scenarioLibrary,
} from "../data";
import { quizPassed } from "@core/state";
import { pairDrill } from "@core/alphabet";
import { touchStreak } from "../store";

/* The mark for a run: partial credit summed over first attempts, as a percentage. */
const scoreOf = (r) => (r.total ? Math.round(r.credit / r.total * 100) : 0);

/* Meeting a lesson's words is work, and it used to pay nothing: quizzes and
   drills moved `st.xp`, vocabulary did not, so finishing the teaching half of a
   lesson changed nothing a learner could see on the path. Deliberately smaller
   than a quiz — reading a set is not the same as retrieving it. */
export const VOCAB_XP = 5;

/* Pairs in one run of the pronunciation drill: five heard and five said, which
   is about a minute and a half and does not outstay a contrast. */
export const SOUND_DRILL_N = 10;

/* Sentences in a shadowing run. Fewer than a quiz: each one is a recording, a
   hold, a wait for the recogniser and usually a second go. */
export const SHADOW_N = 6;

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
        detail={`${lessonWords(unit, index).length} words met · +${VOCAB_XP} XP`}
        guide="words"
        onBack={() => navigation.goBack()}
      />
    );
  }

  // The teaching steps are shown here; question steps hand off to the runner, one
  // at a time, so a lesson interleaves rather than front-loading every card.
  const step = steps[at];
  const advance = () => {
    if (at + 1 >= steps.length) {
      update((prev) => ({
        ...markComponent(prev, unit, index, "vocab"),
        xp: (prev.xp || 0) + VOCAB_XP,
      }));
      setDone(true);
    } else {
      setAt(at + 1);
    }
  };

  /* The three teaching steps live in `lesson.js` — they were inline here, which
     is most of why they could not be designed: no component, no name, nothing to
     test. The flow keeps what is genuinely its own (which step, what the button
     says, when the lesson is over) and the steps draw themselves. */
  if (step.t === "list") {
    return (
      <Screen>
        <WordList unit={unit} words={step.words} at={at} total={steps.length} />
        <View style={{ marginTop: "auto", paddingTop: 16 }}>
          <Btn kind="pri" label="Start learning" onPress={advance} />
        </View>
      </Screen>
    );
  }

  if (step.t === "grammar" || step.t === "word") {
    return (
      <Screen fill>
        {step.t === "grammar"
          ? <GrammarNote unit={unit} note={step.note} at={at} total={steps.length} />
          : <WordCard i={step.i} at={at} total={steps.length} />}
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

/* ---------------------------------------------------------------- shadowing */

/* Hear a sentence, say it back (ROADMAP P10.6). Drawn from the speak pool, so
   every sentence has a real recording — shadowing a device voice would be
   shadowing a robot's rhythm, which is the one thing the exercise is for. */
export function ShadowFlow({ navigation }) {
  const { st } = useSession();
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  const units = useMemo(() => reachedUnits(st), [seed]);
  const steps = useMemo(() => Q.shadowDrill(units, SHADOW_N), [units, seed]);
  useAudioStopOnLeave();

  if (!steps.length) {
    return <Done title="Nothing to shadow yet"
                 detail="Come back after a lesson or two."
                 onBack={() => navigation.goBack()} />;
  }
  if (result) {
    return (
      <Done title="Shadowing"
            detail={`${result.right} of ${result.total} clean`}
            score={scoreOf(result)} passed={scoreOf(result) >= 70}
            onAgain={() => { setResult(null); setSeed(seed + 1); }}
            onBack={() => navigation.goBack()} />
    );
  }
  return (
    <Runner steps={steps} recycle={false} navigation={navigation}
            onFinish={(r) => setResult(r)} />
  );
}

/* ------------------------------------------------------ pronunciation drill */

/* Minimal pairs, heard and then said (ROADMAP P10.8). Reached from Sounds,
   which is the home of the writing system: a drill on the letters belongs with
   the letters rather than as a twelfth row on Practice (rule 20.8).

   Not scored out of a pass mark. A pronunciation attempt the recogniser did not
   catch is skipped rather than failed (see Pair.js), so a percentage here would
   be a percentage of however many attempts happened to be audible. */
export function SoundDrillFlow({ navigation }) {
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  const steps = useMemo(() => pairDrill(SOUND_DRILL_N), [seed]);
  useAudioStopOnLeave();

  if (result) {
    return (
      <Done
        title="Sounds"
        detail={result.total
          ? `${result.right} of ${result.total} caught`
          : "Nothing the phone could hear"}
        onAgain={() => { setResult(null); setSeed(seed + 1); }}
        againLabel="Again"
        onBack={() => navigation.goBack()}
      />
    );
  }
  return (
    <Runner steps={steps} recycle={false} navigation={navigation}
            onFinish={(r) => setResult(r)} />
  );
}

/* -------------------------------------------------------------- lesson quiz */

/* How many words a failed quiz puts back in front of the learner before the
   retake. Four, because more than that is the vocabulary step again — which they
   have already done — and the point is the handful that did not stick. */
export const RETEACH_MAX = 4;

/* The lesson's own words that were got wrong, in the order the lesson teaches
   them. A step with no lemma behind it (a scenario, a spoken sentence) grades
   its own words and carries no `i`, so it contributes nothing here. */
export function missedWords(results, words) {
  const bad = new Set();
  for (const r of results || []) {
    // A skipped step is not a wrong answer — the microphone was off, or there
    // was no Russian recogniser — and it is already left out of the total.
    // Re-teaching a word the learner was never asked would punish the phone.
    // (It carries no `credit` at all, so this held by accident before.)
    if (r.skipped) continue;
    if (typeof r.i === "number" && r.credit < 1) bad.add(r.i);
  }
  const own = (words || []).filter((i) => bad.has(i));
  const rest = [...bad].filter((i) => !own.includes(i));
  return own.concat(rest).slice(0, RETEACH_MAX);
}

/* The second look, before the second attempt: one card per missed word, the
   same card the lesson taught it with rather than a new kind of screen.
   Its own component because the inline version had no name and no test seam,
   which is most of why the three teaching steps could not be designed either
   (§30m) — and this is the same shape of thing. */
export function Reteach({ words, at, onNext, onDone }) {
  const i = words[at];
  if (i === undefined) return null;
  const last = at + 1 >= words.length;
  return (
    <Screen fill>
      <WordCard i={i} at={at} total={words.length} />
      <View style={{ marginTop: "auto", paddingTop: 16 }}>
        <Btn
          kind="pri"
          label={last ? "Try again" : "Continue"}
          testID="reteach-next"
          onPress={() => (last ? onDone() : onNext(at + 1))}
        />
      </View>
    </Screen>
  );
}

export function QuizFlow({ route, navigation }) {
  const { unitId, index } = route.params;
  const unit = UN.find((u) => u.id === unitId);
  const { st, update } = useSession();
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  /* Which of the missed words is on screen, or null when the quiz is running.
     A failed retake used to be the same quiz again five minutes later: the words
     come back (the lesson's own words are always asked) but nothing showed them
     again, so a learner who did not know «хотеть» was asked about «хотеть»
     twice and told twice that they were wrong. The struggling simulated learner
     retook 357 times over the route — that is the loop this breaks. */
  const [reteach, setReteach] = useState(null);
  /* What the previous attempt asked. A retake used to repeat a quarter of the
     quiz as the same shape about the same word, which is not a second look at
     the material — it is the same screen again five minutes later (P11.4). Held
     in a ref rather than state so recording it cannot itself cause a render, and
     read at generation time. It lives for the session: a retake days later is a
     real review and may legitimately look the same. */
  const asked = useRef(null);
  // The quiz tops up with what is due or in trouble before the unit's earlier
  // words: review comes to the path (the pedagogy review, 2026-09-08).
  // `st.seen` rides along so a word the scheduler already trusts is asked by
  // typing rather than by four choices (ROADMAP P10.1).
  const steps = useMemo(() => {
    const next = Q.quizSteps(unit, index, reviewWords(st), st.seen, asked.current);
    asked.current = Q.stepKeys(next);
    return next;
  }, [unitId, index, seed]);
  useAudioStopOnLeave();

  if (reteach !== null) {
    return (
      <Reteach
        words={missedWords(result ? result.results : [], lessonWords(unit, index))}
        at={reteach}
        onNext={setReteach}
        onDone={() => { setReteach(null); setResult(null); setSeed(seed + 1); }}
      />
    );
  }

  if (result) {
    // What the lesson list will show, not the raw mark: the relief rule
    // (core/state.js quizPassed) accepts a lower score from the third try,
    // and this screen used to say "Not quite" over a quiz the list ticked.
    const { passed, relief } = result;
    const last = index + 1 >= lessonCount(unit);
    const missed = missedWords(result.results, lessonWords(unit, index));
    return (
      <Done
        title={relief ? `Passed on the ${ordinal(result.tries)} try`
             : passed ? "Quiz passed" : `Not quite. ${PASS_MARK}% to pass`}
        /* Which words, not just how many: a score says a learner failed, the
           words say what to do about it. Language material, so it is not the
           explanatory copy rule 20.7 bans. */
        detail={missed.length && !passed
          ? `${result.right} of ${result.total} right · ${missed.map((i) => L[i].w).join(", ")}`
          : `${result.right} of ${result.total} right`}
        score={result.score}
        passed={passed}
        /* The end of a lesson quiz is where Yuri belongs and the drills are
           where he does not: this is the moment a lesson closes, and he stays
           worth seeing only by not being on every results screen in the app. */
        guide={relief ? "scraped" : passed ? "passed" : "failed"}
        againLabel="Try again"
        onAgain={() => {
          // Straight back into the quiz when there is nothing to show again —
          // a pass being retaken for the mark, or a fail on steps that grade
          // their own words and carry no lemma.
          if (missed.length && !passed) setReteach(0);
          else { setResult(null); setSeed(seed + 1); }
        }}
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
      {/* The screen was eleven identical rows under a label reading "Practise"
          beneath a header reading "Practice" — the same word twice, and no
          hierarchy at all, so nothing on it looked more worth doing than
          anything else (the interface review, P11.9).

          A quiz of the learner's own making is the thing most often wanted, so
          it leads and looks like it. The rest group by what they ask of you. */}
      <Pressable
        testID="practice-quiz"
        accessibilityRole="button"
        onPress={() => navigation.navigate("QuizSetup")}
        style={({ pressed }) => ({
          flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20,
          backgroundColor: t.brandBg, borderColor: t.brandDim, borderWidth: 1,
          borderRadius: radius.lg, padding: 14, minHeight: 64,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Thumb id="quiz" />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.ink, fontSize: 17, fontWeight: "700" }}>Build a quiz</Text>
          <Muted>Choose the questions and the sections</Muted>
        </View>
        {((st.drills || {}).quiz || {}).best
          ? <Pill tone="good">{(st.drills.quiz.best) + "%"}</Pill> : null}
      </Pressable>

      <SectionLabel>Listening and speaking</SectionLabel>
      <List>
        {/* Listening at the learner's level comes first, and the native-speed
            one says plainly that it is harder. The owner found the video
            passages "way too advanced" and nothing on the row warned him. */}
        <Row onPress={() => navigation.navigate("SceneList")}>
          <Thumb id="listen" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>Listening</Text>
            <Muted>Conversations at the level you are on</Muted>
          </View>
          {((st.drills || {}).listening || {}).best
            ? <Pill tone="good">{(st.drills.listening.best) + "%"}</Pill> : null}
        </Row>
        <Row onPress={() => navigation.navigate("Listening")}>
          <Thumb id="native" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>
              Native speed
            </Text>
            <Muted>Half a minute of a real speaker · much harder</Muted>
          </View>
        </Row>
        {/* Listen, then say it back (P10.6). Sits between the two listening
            rows and Talk because that is what it is: the step from taking
            Russian in to putting it out, with the model still in your ear. */}
        <Row onPress={() => navigation.navigate("Shadow")}>
          <Thumb id="shadow" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>Shadowing</Text>
            <Muted>Hear a sentence and say it straight back</Muted>
          </View>
        </Row>
        <Row onPress={() => navigation.navigate("Talk")} disabled={!talkOpen}>
          <Thumb id="talk" locked={!talkOpen} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>Talk</Text>
            <Muted>{talkOpen ? "A short conversation on a topic" : `Opens after chapter ${TALK_UNLOCK_STAGE + 1}`}</Muted>
          </View>
        </Row>
        {/* The letters and the mouth behind them (ROADMAP P10.2). Open from the
            first screen: nothing else in the app teaches the alphabet. */}
        <Row last onPress={() => navigation.navigate("Sounds")}>
          <Thumb id="letters" />
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
  /* Written or chosen (the owner, 2026-09-11: *"fill in the blank allows the
     user to generate it completely rather than guess"*). On unless turned off,
     because that is §30j's own finding — recognition meets a word, production
     keeps it — and every drill question used to be four options. */
  const typed = st.typedDrills !== false;
  const steps = useMemo(() => Q.drillQuestions(type, undefined, pool, cells, typed),
                        [type, seed, pool, cells, typed]);
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

/* One scenario, not five. The owner, 2026-09-10: "just one audio is sufficient
   per lesson. It doesn't need to be a series of 5 sets of 5 questions." A
   scenario is half a minute of conversation and five questions about it, which
   is a session of its own — five of them was the old four-sentence scene
   repeated until it read as a drill. */
export const LISTENING_N = 1;

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
            detail="Come back after a lesson or two."
            onBack={() => navigation.goBack()} />
    );
  }
  return (
    <Screen>
      <SectionLabel>{`${shown.length} passages`}</SectionLabel>
      <List>
        {shown.map((p, k) => {
          const fit = Q.passageFit(p, known);
          const best = ((st.drills || {})[`passage:${p.id}`] || {}).best;
          return (
            <Row key={p.id} last={k === shown.length - 1} testID={`passage-${p.id}`}
                 onPress={() => navigation.navigate("Passage", { id: p.id })}>
              {/* No tile. Every row here is the same kind of thing, so one icon
                  repeated down the list marks nothing — it is a column of grey
                  squares beside the titles that are the actual information. */}
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
                 detail="Come back after a lesson or two."
                 onBack={() => navigation.goBack()} />;
  }
  if (result) {
    return (
      // Named apart from the level-matched activity: the two used to share the
      // word "Listening" across four surfaces, so one score could not be told
      // from the other's (P11.9).
      <Done title="Native speed" detail={`${result.right} of ${result.total} caught`}
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

/* Which conversations a chapter puts forward before the rest of them: the two
   from its spine, the unit the chapter is named for. The side quests are
   optional detours (§30e), so their scenarios are the extras. */
const SCENES_SHOWN = 2;

/* The conversations on offer, by chapter (the owner, 2026-09-11: *"one or two
   scenarios per chapter and then maybe some extras. Each should have a scenario
   title"*). Before this the activity drew one and dealt it out, so 168 written
   conversations were a thing a learner could be given but never choose. */
export function ScenesList({ navigation }) {
  const { st } = useSession();
  const t = useTheme();
  const lib = useMemo(() => scenarioLibrary(st), [st.unit, st.dev]);
  const [open, setOpen] = useState({});

  if (!lib.length) {
    return <Done title="Nothing to listen to yet" detail="Finish a lesson first."
                 onBack={() => navigation.goBack()} />;
  }
  return (
    <Screen>
      {lib.map(({ stage, rows }) => {
        const extras = rows.length - SCENES_SHOWN;
        const showing = open[stage.n] ? rows : rows.slice(0, SCENES_SHOWN);
        return (
          <View key={stage.n}>
            <SectionLabel>{stage.title || `Chapter ${stage.n}`}</SectionLabel>
            <List>
              {showing.map((s) => {
                const best = ((st.drills || {})[`scene:${s.key}`] || {}).best;
                return (
                  <Row key={s.key} testID={`scene-row-${s.key}`}
                       onPress={() => navigation.navigate("Scenes", { key: s.key })}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}
                            numberOfLines={2}>
                        {s.title}
                      </Text>
                      <Muted>{s.cast.join(" · ")}</Muted>
                    </View>
                    {best ? <Pill tone="good">{best + "%"}</Pill> : null}
                  </Row>
                );
              })}
              {extras > 0 && !open[stage.n] ? (
                <Row testID={`scene-more-${stage.n}`}
                     onPress={() => setOpen({ ...open, [stage.n]: true })}>
                  <View style={{ flex: 1 }}>
                    <Muted>{`${extras} more`}</Muted>
                  </View>
                </Row>
              ) : null}
            </List>
          </View>
        );
      })}
    </Screen>
  );
}

export function ListeningFlow({ route, navigation }) {
  const { st, update } = useSession();
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  const picked = route && route.params ? route.params.key : null;
  const units = useMemo(() => reachedUnits(st), [seed]);
  /* The passages written for the lessons this learner has finished (§30l).
     The owner, 2026-09-10: the native-speed video passages were "way too
     advanced", and the build's own numbers agreed — 45 s of a native speaker
     uses more words than the first three chapters hold. These are pitched at
     the lesson instead, and the corpus scene is the fallback for a lesson with
     no script, so the activity never goes empty. */
  const steps = useMemo(() => {
    /* A conversation chosen from the library is the one that plays — the whole
       point of the list is that it can be gone back to. */
    if (picked) {
      const [id, i] = picked.split(":");
      const unit = units.find((u) => u.id === id) || UN.find((u) => u.id === id);
      const one = unit ? Q.scriptScene(unit, Number(i)) : null;
      return one ? [one] : [];
    }
    const want = new Set(reviewWords(st));
    /* Where they are, not only what they have finished. Counting finished
       lessons alone left a learner on their very first lesson with nothing
       written to listen to, and the corpus fallback then handed them the
       unconnected sentences the owner objected to in the first place. The
       lesson Continue would open is a lesson being taught now, so its passage
       is revision of what is in front of them. */
    const here = nextLesson(st);
    const done = (u) =>
      here && here.unit.id === u.id ? here.index + 1 : lessonsDone(st, u);
    const out = [];
    const seen = new Set();
    for (let k = 0; k < LISTENING_N * 6 && out.length < LISTENING_N; k++) {
      const p = Q.writtenPassage(units, done) || Q.lessonPassage(units, want);
      if (!p || !p.lines.length || seen.has(p.lines[0].ru)) continue;
      seen.add(p.lines[0].ru);
      out.push(p);
    }
    return out;
  }, [units, seed]);
  useAudioStopOnLeave();

  if (!steps.length) {
    return <Done title="Nothing to listen to yet"
                 detail="Finish a lesson first."
                 onBack={() => navigation.goBack()} />;
  }
  if (result) {
    return (
      <Done title="Listening" detail={steps[0] ? steps[0].topic : null}
            score={result.score} passed={result.score >= 80}
            onAgain={() => { setResult(null); setSeed(seed + 1); }}
            onBack={() => navigation.goBack()} />
    );
  }
  return (
    <Runner steps={steps} recycle={false} navigation={navigation}
            onFinish={(r) => {
              const score = scoreOf(r);
              update((prev) => {
                const next = bestOf(prev, "listening", score, r.right * 2);
                // A chosen conversation also keeps its own best, so the library
                // shows which have been done. XP is paid once, above.
                return picked ? bestOf(next, `scene:${picked}`, score, 0) : next;
              });
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
    return <Done title="No questions for that choice" detail="Try more sections."
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
            : "No lessons skipped.",
        });
      }}
    />
  );
}
