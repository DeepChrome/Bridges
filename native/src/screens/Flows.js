/* Everything the runner drives: vocabulary, lesson quiz, drills, and the two
 * placement routes. Each one supplies its steps and decides what the result means. */

import React, { useMemo, useRef, useState } from "react";
import { View, Pressable } from "react-native";
import { useSession } from "../session";
import { useTheme, radius, type as T } from "../theme";
import { Screen, Card, Btn, Pill, Speaker, Muted, List, Row, Thumb, SectionLabel, Chip, Tick, Text,
         Sheet, Choice, CogButton } from "../ui";
import { Runner, Done, useAudioStopOnLeave } from "./Run";
import { WordList, GrammarNote, WordCard, StepBar } from "../lesson";
import { VideoLines } from "../prep";
import { Q, DRILL_TYPES, DRILL_N, TEST_OUT, QUIZ_KINDS, QUIZ_LENGTHS, FINAL_N } from "../questions";
import {
  L, UN, STAGES, lessonWords, lessonCount, markComponent, PASS_MARK, drillPool,
  DRILL_POOL_STEPS, chapterWords, irregularWords,
  reachedUnits, unitUnlocked, reviewWords, knownWords, lessonsDone, nextLesson,
  scenarioLibrary, required, linesWith, grammarKey, currentGrammarUnit, grammarNoteOf,
} from "../data";
import { quizPassed } from "@core/state";
import { pairDrill } from "@core/alphabet";
import { buildupDrill } from "@core/buildup";
import { firstSense } from "@core/util";
import { touchStreak } from "../store";

/* The video's sentences a lesson ends on (`VocabFlow`): a few, not a wall. */
const LESSON_LINES = 4;

/* The mark for a run: partial credit summed over first attempts, as a percentage. */
const scoreOf = (r) => (r.total ? Math.round(r.credit / r.total * 100) : 0);

/* Pairs in one run of the pronunciation drill: five heard and five said, which
   is about a minute and a half and does not outstay a contrast. */
export const SOUND_DRILL_N = 10;

/* The drills whose words can break the rules in a way the drill asks about:
   a verb's conjugation and its aspect partner, a noun's cases. */
export const IRREGULAR_DRILLS = ["conjugation", "aspect", "cases"];

/* Words in one build-up run. Six, because each is four or five repetitions of
   the same mouth shape and the value is in doing them properly rather than in
   getting through a list. */
export const BUILD_DRILL_N = 6;

/* Sentences in a shadowing run. Fewer than a quiz: each one is a recording, a
   hold, a wait for the recogniser and usually a second go. */
export const SHADOW_N = 6;

/* ------------------------------------------------------------- vocabulary */

export function VocabFlow({ route, navigation }) {
  const { st, update } = useSession();
  const t = useTheme();
  const unit = UN.find((u) => u.id === route.params.unitId);
  const index = route.params.index;
  /* After the words, the video's own sentences that use them (Phase 14, the
     owner, 2026-09-29: *"more video centric. More sentences/phrases"*) — the
     lesson ends on what it is preparing for. */
  const steps = useMemo(() => {
    const lines = linesWith(unit, lessonWords(unit, index)).slice(0, LESSON_LINES);
    return Q.vocabSteps(unit, index).concat(lines.length ? [{ t: "lines", lines }] : []);
  }, [unit.id, index]);
  const [at, setAt] = useState(0);
  const [done, setDone] = useState(false);
  useAudioStopOnLeave();

  if (done) {
    return (
      <Done
        title="Vocabulary done"
        detail={`${lessonWords(unit, index).length} words met`}
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
      update((prev) => markComponent(prev, unit, index, "vocab"));
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

  if (step.t === "lines") {
    return (
      <Screen>
        <StepBar at={at} total={steps.length} />
        <SectionLabel>From the video</SectionLabel>
        <VideoLines lines={step.lines} testID="lesson-lines"
                    onMoment={(l) => navigation.navigate("Video", { videoId: l.vid, at: l.t })} />
        <View style={{ marginTop: "auto", paddingTop: 16 }}>
          <Btn kind="pri" label="Finish" onPress={advance} />
        </View>
      </Screen>
    );
  }

  if (step.t === "grammar" || step.t === "word") {
    return (
      <Screen fill>
        {step.t === "grammar"
          ? <GrammarNote unit={unit} note={step.note} at={at} total={steps.length}
                         onEpisode={(videoId) => navigation.navigate("Video", { videoId })} />
          : <WordCard i={step.i} at={at} total={steps.length} unit={unit}
                      onMoment={(videoId, word, at) => navigation.navigate("Video", { videoId, word, at })} />}
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
  /* The whole route as well, so a thin pool can be widened along it
     (`shadowDrill`): chapter 1 carries 29 sentences and six a run out of
     twenty-nine is the same six every sitting. */
  const steps = useMemo(() => Q.shadowDrill(units, SHADOW_N, UN), [units, seed]);
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

/* Word building (core/buildup.js): the long words the learner is actually
   studying, each said a syllable at a time. Drawn from `drillPool` like every
   other drill, so nobody is asked to pronounce a word they have not met.

   One question on the way in — should the phone listen? — and then it is not
   asked again (the owner, 2026-09-16). It is a choice and not a setting because
   it is a choice about *this run*: some days you are somewhere you can talk out
   loud and some days you are not. `listen` rides on each question rather than
   being read from state inside the activity, which keeps the activity a
   function of its question (registry.test.js). */
export function BuildDrillFlow({ navigation }) {
  const { st } = useSession();
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  const [listen, setListen] = useState(null);      // null until the question is answered
  const t = useTheme();
  const words = useMemo(
    () => drillPool(st).map((i) => ({ ru: L[i].w, en: firstSense(L[i]) })),
    [st.seen]);   // eslint-disable-line react-hooks/exhaustive-deps
  const steps = useMemo(() => buildupDrill(words, BUILD_DRILL_N, { listen: !!listen }),
                        [words, seed, listen]);
  useAudioStopOnLeave();

  if (result) {
    return (
      <Done
        title="Word building"
        detail={`${result.total} ${result.total === 1 ? "word" : "words"}`}
        onAgain={() => { setResult(null); setListen(null); setSeed(seed + 1); }}
        againLabel="Again"
        onBack={() => navigation.goBack()}
      />
    );
  }
  if (!buildupDrill(words, BUILD_DRILL_N).length) {
    return (
      <Done
        title="Word building"
        detail="No long words yet"
        onBack={() => navigation.goBack()}
      />
    );
  }
  if (listen === null) {
    /* Two buttons and the question, in the middle of the screen. Not a sheet:
       there is nothing behind it yet. */
    return (
      <Screen fill>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 }}>
          <Text style={{ color: t.ink, fontSize: T.title, fontWeight: "700", textAlign: "center" }}>
            Should the phone listen?
          </Text>
          <Muted style={{ textAlign: "center", marginTop: 8 }}>
            It says what it heard, and never marks you wrong
          </Muted>
        </View>
        <Btn kind="pri" testID="build-listen-yes" label="Listen" onPress={() => setListen(true)} />
        <Btn kind="ghost" testID="build-listen-no" label="Just play it" style={{ marginTop: 8 }}
             onPress={() => setListen(false)} />
      </Screen>
    );
  }
  return (
    <Runner steps={steps} recycle={false} allowBack navigation={navigation}
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
    /* Only review words from the route so far. The top-up used to take
       anything due, so a chapter-1 quiz asked for «воспользоваться» — "avail
       oneself", dealt weeks earlier as a flashcard — and a lesson quiz has to
       be passable with what the lessons have taught (the owner, 2026-09-24). */
    const within = new Set(Q.unitsUpTo(unit).flatMap((u) => u.w));
    const review = reviewWords(st).filter((i) => within.has(i));
    const next = Q.quizSteps(unit, index, review, st.seen, asked.current);
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
        update((prev) => touchStreak(markComponent(prev, unit, index, "quiz", score)));
        setResult({ ...r, score, passed, relief: passed && score < PASS_MARK, tries: slot.tries });
      }}
    />
  );
}

const ordinal = (n) => (n === 1 ? "first" : n === 2 ? "second" : n === 3 ? "third" : `${n}th`);

/* ------------------------------------------------------------------ drills */

/* Nothing on this screen is locked and nothing on it carries a score (the
   owner, 2026-09-23: *"For the practice exercises, nothing should be locked…
   no percentages anywhere on that page"*). The drills used to open with the
   chapter that taught their rule and Talk after chapter 2, each with an
   "Opens in chapter N" line and a best-score pill; a learner who wants to try
   the aspect drill in week one may, and the drill widens to the whole
   curriculum when the route has not yet supplied enough (DrillFlow `ahead`). */
export function DrillList({ navigation }) {
  const { st } = useSession();
  const t = useTheme();
  const grammarUnit = useMemo(() => currentGrammarUnit(st),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [st.unit, st.dev]);
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
        </View>
      </Pressable>

      {/* Listening and speaking used to be one section of five rows, and the
          owner could not find the mouth drills in it (2026-09-16): taking
          Russian in and putting it out are two different things to sit down to,
          and a learner deciding "I want to practise speaking" was reading past
          two listening rows to get there. Split, with speaking second because
          that is the order the skills arrive in. */}
      <SectionLabel>Listening</SectionLabel>
      <List>
        {/* Listening at the learner's level comes first, and the native-speed
            one says plainly that it is harder. The owner found the video
            passages "way too advanced" and nothing on the row warned him. */}
        <Row onPress={() => navigation.navigate("SceneList")}>
          <Thumb id="listen" tone="info" />
          <View style={{ flex: 1 }}>
            {/* The section above already says Listening — which is the feature's
                name (§30af) — so the row says what tells the two apart. Naming
                the row "Listening" too read as "LISTENING / Listening", and the
                walkthrough's tap matched the header instead of the row, which
                is how it was found. */}
            <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>At your level</Text>
          </View>
        </Row>
        {/* "Native speed" — 45 s of real video and "which word did you hear?"
            — sat here until 2026-09-23. The owner: *"'what word did you hear'
            is pretty horrible and doesn't actually teach the language."* The
            native-speed listening is Immerse, where the same videos play
            whole with the words they say and the moment each is said. */}
      </List>

      <SectionLabel style={{ marginTop: 18 }}>Speaking</SectionLabel>
      <List>
        {/* Hear it, say it back (P10.6) — the step from taking Russian in to
            putting it out, with the model still in your ear. */}
        <Row onPress={() => navigation.navigate("Shadow")}>
          <Thumb id="shadow" tone="brand" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>Repeat a sentence</Text>
          </View>
        </Row>
        {/* A row of its own, rather than a button inside Alphabet. It was
            reachable only from there and the owner never found it. */}
        <Row onPress={() => navigation.navigate("BuildDrill")}>
          <Thumb id="buildup" tone="brand" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>Word building</Text>
          </View>
        </Row>
        {/* Speak Russian, read it back in English (2026-09-22). Under Speaking
            because holding a microphone is what it asks of you, and because it
            is where a learner goes when they want to say something and are not
            sure they said it. Open from the first screen: it teaches nothing
            and gates nothing, so there is nothing to earn. */}
        <Row onPress={() => navigation.navigate("Translate")}>
          <Thumb id="translate" tone="brand" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>Translate</Text>
          </View>
        </Row>
        <Row onPress={() => navigation.navigate("Talk")}>
          <Thumb id="talk" tone="brand" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>Talk</Text>
          </View>
        </Row>
        {/* The free conversation with a tutor who knows where you are
            (2026-09-26, screens/Tutor.js). Talk is a scene at your level in
            Russian; this is whatever you ask for, in either language. */}
        <Row testID="practice-tutor" onPress={() => navigation.navigate("Tutor")}>
          <Thumb id="tutor" tone="brand" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>Tutor</Text>
          </View>
        </Row>
        {/* The letters and the mouth behind them (ROADMAP P10.2). Open from the
            first screen: nothing else in the app teaches the alphabet. Named
            for the letters rather than for "sounds", which described the vowel
            chart and hid the thirty-three characters underneath it. */}
        <Row onPress={() => navigation.navigate("Sounds")}>
          <Thumb id="letters" tone="brand" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>Alphabet</Text>
          </View>
        </Row>
        {/* Its own row beside Alphabet, not a section inside it: things put
            inside another screen are the things that do not get found (§30ab,
            Word building). */}
        <Row testID="open-endings" onPress={() => navigation.navigate("Endings")}>
          <Thumb id="endings" tone="brand" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>Word endings</Text>
          </View>
        </Row>
      </List>
      <SectionLabel style={{ marginTop: 18 }}>Grammar</SectionLabel>
      <List>
        {/* The reference, first in the section it explains: the rules the
            drills below are drilling. Open from the first screen, like the
            alphabet, and never scored (2026-09-27). */}
        <Row testID="open-grammar" onPress={() => navigation.navigate("Grammar")}>
          <Thumb id="rules" tone="good" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>The rules</Text>
          </View>
        </Row>
        {/* The grammar point of the chapter the learner is in, with its words
            (GrammarFlow) — the unit's module, one tap from Practice. */}
        {grammarUnit ? (
          <Row testID="chapter-grammar"
               onPress={() => navigation.navigate("GrammarRun", { unitId: grammarUnit.id })}>
            <Thumb id="conjugation" tone="good" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>This chapter's grammar</Text>
              <Muted numberOfLines={1}>{grammarNoteOf(grammarUnit).title}</Muted>
            </View>
          </Row>
        ) : null}
        {DRILL_TYPES.map((d) => (
          /* Straight in. What a drill asks about is on the drill's own cog now
             (DrillOptions), not a screen in front of it — the owner, 2026-09-26:
             *"instead of a settings cog, we have this sort of ugly ass top
             menu."* `List` decides which row is last (§30i). */
          <Row key={d.id} testID={`drill-${d.id}`}
               onPress={() => navigation.navigate("Drill", { type: d.id })}>
            <Thumb id={d.icon} tone="good" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>
                {d.name}
              </Text>
            </View>
          </Row>
        ))}
      </List>
    </Screen>
  );
}

/* What a drill asks about and where its words come from, behind the cog on the
 * drill itself (the owner, 2026-09-26: *"for conjugations, you should be able
 * to select which areas to hit… for cases, you should be able to select each
 * case or all cases… for agreement, maybe you want to focus on irregulars… for
 * all of them, maybe you want to select which chapters"*). It replaced a setup
 * screen that stood in front of the drill (§30ac) and that he called ugly.
 *
 * Three things, each with the rule that keeps it honest:
 *
 *   - **Ask about** — the drill's focus ids (`drillFocus`): a tense or the
 *     reading question, the aspect shapes, each of the six cases, an
 *     adjective's stem class. Everything the route has reached is ticked to
 *     begin with (`defaultFocus`), so an untouched cog is exactly the drill as
 *     it was. **The last tick cannot be removed** — an empty selection is a
 *     drill with nothing to ask.
 *   - **Words from** — "Your words" (the learner's own, widened along the
 *     route until a run fills) or any set of chapters. A chapter chosen is a
 *     chapter drawn on whole, quests included, and nothing widens it: the
 *     learner asked for chapter 3 and a run short of ten is what chapter 3 has.
 *   - **Answers** — written or chosen. One setting for every drill
 *     (`typedDrills`), here rather than in Settings, where it was never found.
 *
 * Kept per drill in `st.drillPrefs`, so the cog remembers what it was set to.
 * `null` for a field is "as before" and is what a profile that has never
 * opened the cog carries.
 */
export function DrillOptions({ type, prefs, onChange, onClose }) {
  const { st, update } = useSession();
  const t = useTheme();
  const options = useMemo(() => Q.drillFocus(type), [type]);
  const suggested = useMemo(() => Q.defaultFocus(type, reachedUnits(st)), [type]);
  const on = prefs.only || suggested || options.map((o) => o.id);
  const chapters = prefs.chapters || [];
  const typed = st.typedDrills !== false;

  const toggle = (id) => {
    const next = on.includes(id) ? (on.length > 1 ? on.filter((x) => x !== id) : on) : on.concat([id]);
    // Everything ticked is no filter, and saying so keeps the generators on
    // their ordinary path rather than through a set that matches everything.
    onChange({ ...prefs, only: next.length === options.length ? null : next });
  };
  const toggleChapter = (k) => onChange({
    ...prefs,
    chapters: chapters.includes(k) ? chapters.filter((x) => x !== k) : chapters.concat([k]).sort((a, b) => a - b),
  });
  const groups = [["Ask about", options.filter((o) => !o.group)], ["Stem", options.filter((o) => o.group === "stem")]]
    .filter(([, list]) => list.length > 1);

  return (
    <Sheet onClose={onClose} testID="drill-options" maxHeight="88%"
           footer={<Btn kind="pri" testID="drill-apply" label="Apply" style={{ marginTop: 8 }} onPress={onClose} />}>
      {groups.map(([label, list]) => (
        <View key={label} style={{ marginBottom: 18 }}>
          <SectionLabel>{label}</SectionLabel>
          <List>
            {list.map((o) => (
              <Row key={o.id} testID={`focus-${o.id}`} onPress={() => toggle(o.id)}>
                <Tick on={on.includes(o.id)} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15 }}>{o.name}</Text>
                </View>
              </Row>
            ))}
          </List>
        </View>
      ))}
      {/* The words that break the rules, on their own (the owner, 2026-09-29:
          "have options to drill them specifically"). Only where the drill's
          words have any: verbs for conjugation and aspect, nouns for cases. */}
      {IRREGULAR_DRILLS.includes(type) ? (
        <View style={{ marginBottom: 18 }}>
          <List>
            <Row testID="irregular-only" onPress={() => onChange({ ...prefs, irregular: !prefs.irregular })}>
              <Tick on={!!prefs.irregular} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: 15 }}>Irregular words only</Text>
              </View>
            </Row>
          </List>
        </View>
      ) : null}
      <View style={{ marginBottom: 18 }}>
        <SectionLabel>Words from</SectionLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Chip testID="words-mine" on={!chapters.length} label="Your words"
                onPress={() => onChange({ ...prefs, chapters: [] })} />
          {STAGES.map((s, k) => (
            <Chip key={s.core.id} testID={`words-ch${k + 1}`} on={chapters.includes(k)}
                  label={`Ch ${k + 1}`} onPress={() => toggleChapter(k)} />
          ))}
        </View>
      </View>
      <View style={{ marginBottom: 6 }}>
        <SectionLabel>Answers</SectionLabel>
        <Choice testID="drill-answers" value={typed ? "written" : "chosen"}
                options={[{ id: "written", name: "Written" }, { id: "chosen", name: "Multiple choice" }]}
                onPick={(id) => update((p) => ({ ...p, typedDrills: id === "written" }))} />
      </View>
    </Sheet>
  );
}

export function DrillFlow({ route, navigation }) {
  const { type } = route.params;
  const { st, update } = useSession();
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  const [cog, setCog] = useState(false);
  const prefs = (st.drillPrefs || {})[type] || {};
  const setPrefs = (next) => update((p) => ({ ...p, drillPrefs: { ...(p.drillPrefs || {}), [type]: next } }));
  // Only the learner's own words (data.js drillPool); the pool is fixed for the
  // run so answering does not reshuffle the questions underneath.
  //
  // Unless the drill is open ahead of the route: a learner in chapter 1 who
  // opens Aspect has met eight verbs, and the drill would ask the same handful
  // all run. Skipping ahead means the whole curriculum is fair game.
  const ahead = useMemo(() => !Q.drillsIntroduced(reachedUnits(st)).has(type), [type]);
  /* Written or chosen (the owner, 2026-09-11: *"fill in the blank allows the
     user to generate it completely rather than guess"*). On unless turned off,
     because that is §30j's own finding — recognition meets a word, production
     keeps it — and every drill question used to be four options. */
  const typed = st.typedDrills !== false;
  /* What the cog says to ask about: the learner's ticks, else the cases the
     route has taught (which used to be the `cells` gate, §30i), else
     everything. A cases drill before chapter 4 therefore asks all six cases
     rather than saying "not yet" — nothing in Practice is locked (§30au). */
  const only = useMemo(() => prefs.only || Q.defaultFocus(type, reachedUnits(st)),
                       [type, prefs.only]);
  const chapters = prefs.chapters || [];

  /* **Widen until the run fills.**
   *
   * `drillPool` puts a floor under the number of *words*, which is not a floor
   * under the number of questions: measured on 2026-09-16 (tools/audit_banks.mjs)
   * a learner with 40 words met has **seven** distinct aspect questions in
   * total, because the drill needs verbs carrying a recorded partner. Ten runs
   * is then the same seven questions, which is exactly what the owner reported.
   *
   * So the pool steps further along the route until a full run comes back, and
   * the last step is the whole curriculum. Reaching past what the learner has
   * met is the lesser wrong: §30e's rule is that a drill asks about the
   * learner's own words, and it already bends that way at DRILL_POOL_MIN.
   *
   * Chapters chosen on the cog are not widened: that is the learner saying
   * where the words come from, and a short run is the honest answer. */
  /* "Rule-breakers only" (2026-09-29) narrows any pool to the words that break
     the rules (data.js irregularWords); the widening below then ends on every
     irregular word the course teaches rather than on the whole curriculum. */
  const irregularOnly = !!prefs.irregular && IRREGULAR_DRILLS.includes(type);
  const steps = useMemo(() => {
    const odd = irregularOnly ? new Set(irregularWords()) : null;
    const narrow = (pool) => (odd ? (pool || irregularWords()).filter((i) => odd.has(i)) : pool);
    if (chapters.length) return Q.drillQuestions(type, undefined, narrow(chapterWords(chapters)), undefined, typed, only);
    if (ahead) return Q.drillQuestions(type, undefined, narrow(null), undefined, typed, only);
    let last = [];
    for (const min of DRILL_POOL_STEPS) {
      const p = min === Infinity ? null : drillPool(st, min);
      last = Q.drillQuestions(type, undefined, narrow(p), undefined, typed, only);
      if (last.length >= DRILL_N) return last;
    }
    return last;
  }, [type, seed, typed, only, ahead, chapters.join(","), irregularOnly]);
  const spec = DRILL_TYPES.find((d) => d.id === type);
  useAudioStopOnLeave();

  /* The cog: open it, change things, Apply deals a fresh run. Closing with
     nothing changed leaves the run where it was. */
  const before = useRef(null);
  const openCog = () => { before.current = JSON.stringify([prefs, typed]); setCog(true); };
  const closeCog = () => {
    setCog(false);
    if (JSON.stringify([prefs, typed]) !== before.current) { setResult(null); setSeed(seed + 1); }
  };
  const tools = <CogButton testID="drill-cog" onPress={openCog} label="Drill options" />;
  const sheet = cog ? <DrillOptions type={type} prefs={prefs} onChange={setPrefs} onClose={closeCog} /> : null;

  if (!steps.length) {
    return (
      <>
        <Done title="No questions available" onBack={() => navigation.goBack()}
              onAgain={openCog} againLabel="Options" />
        {sheet}
      </>
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
    <>
      <Runner
        key={seed}
        steps={steps}
        navigation={navigation}
        tools={tools}
        onFinish={(r) => {
          const score = scoreOf(r);
          update((prev) => bestOf(prev, type, score));
          setResult({ ...r, score });
        }}
      />
      {sheet}
    </>
  );
}

/* Best and runs for a practice run, keyed like the grammar drills. */
const bestOf = (prev, key, score) => {
  const drills = { ...(prev.drills || {}) };
  const cur = drills[key] || { best: 0, runs: 0 };
  drills[key] = { best: Math.max(cur.best || 0, score), runs: (cur.runs || 0) + 1 };
  return touchStreak({ ...prev, drills });
};

/* ------------------------------------------------------------- grammar */

/* A run on one chapter's grammar point with that chapter's words
   (core/questions.js grammarRun; the owner, 2026-09-30: "exercises within the
   lessons that focus on … one of the grammar points from that chapter… They
   can be embedded in lessons and also stand alone modules"). With an `index`
   it is a lesson's optional step, starting on that lesson's words; without,
   it is the unit's own module, reached from the unit screen and Practice.
   Graded like any run, so the scheduler hears every word it asks. */
export function GrammarFlow({ route, navigation }) {
  const { unitId, index } = route.params || {};
  const unit = UN.find((u) => u.id === unitId);
  const lesson = index !== undefined && index !== null;
  const { update } = useSession();
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  const steps = useMemo(() => (unit ? Q.grammarRun(unit, lesson ? index : null) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unitId, index, seed]);
  const title = (steps[0] && steps[0].note && steps[0].note.title) || "Grammar";
  useAudioStopOnLeave();

  if (!unit || !steps.length) {
    return <Done title="No grammar practice here yet" onBack={() => navigation.goBack()} />;
  }
  if (result) {
    return (
      <Done
        title={title}
        detail={`${result.right} of ${result.total} right`}
        score={result.score}
        passed={result.score >= 80}
        onAgain={() => { setResult(null); setSeed(seed + 1); }}
        onBack={() => navigation.goBack()}
      />
    );
  }
  return (
    <Runner
      key={seed}
      steps={steps}
      navigation={navigation}
      onFinish={(r) => {
        const score = scoreOf(r);
        update((prev) => bestOf(prev, grammarKey(unit, lesson ? index : null), score));
        setResult({ ...r, score });
      }}
    />
  );
}

/* ------------------------------------------------------------- listening */

/* One scenario, not five. The owner, 2026-09-10: "just one audio is sufficient
   per lesson. It doesn't need to be a series of 5 sets of 5 questions." A
   scenario is half a minute of conversation and five questions about it, which
   is a session of its own — five of them was the old four-sentence scene
   repeated until it read as a drill. */
export const LISTENING_N = 1;

/* The conversations on offer, by chapter (the owner, 2026-09-11: *"one or two
   scenarios per chapter and then maybe some extras. Each should have a scenario
   title"*). Before this the activity drew one and dealt it out, so 168 written
   conversations were a thing a learner could be given but never choose. */
export function ScenesList({ navigation }) {
  const { st } = useSession();
  const t = useTheme();
  const lib = useMemo(() => scenarioLibrary(st), [st.unit, st.dev]);
  if (!lib.length) {
    return <Done title="Nothing to listen to yet" detail="Finish a lesson first."
                 onBack={() => navigation.goBack()} />;
  }
  return (
    <Screen>
      {lib.map(({ stage, rows }) => {
        // Two a chapter since Phase 14 (the twelve extras chapter 1 carried were
        // retired), so every one is listed: the "N more" row had nothing to hide.
        return (
          // The same 18 of air between chapters that Practice leaves between
          // its sections; without it each heading sat on the card above.
          <View key={stage.n} style={{ marginBottom: 18 }}>
            <SectionLabel>{stage.title || `Chapter ${stage.n}`}</SectionLabel>
            <List>
              {rows.map((s) => {
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
                const next = bestOf(prev, "listening", score);
                // A chosen conversation also keeps its own best, so the library
                // shows which have been done.
                return picked ? bestOf(next, `scene:${picked}`, score) : next;
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
    /* Start is pinned: it used to sit under every chapter's unit chips, so on a
       profile with the whole path open the one thing this screen is for was
       thirty-four sections down. */
    <Screen
      footer={
        <Btn kind="pri" label={ready ? "Start" : "Pick a question type and a section"}
             disabled={!ready} testID="quiz-start"
             onPress={() => navigation.navigate("CustomQuiz", { kinds, units, n })} />
      }
    >
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
              update((prev) => bestOf(prev, "quiz", score));
              setResult({ ...r, score });
            }} />
  );
}

/* --------------------------------------------------------------- placement */

/* The final test, from the foot of the path (core/questions.js finalExam).
   Scored like a quiz and kept under `drills.final` like a practice run; it
   unlocks nothing, because there is nothing after it. */
export function FinalFlow({ navigation }) {
  const { update } = useSession();
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  const steps = useMemo(() => Q.finalExam(FINAL_N), [seed]);
  useAudioStopOnLeave();

  if (result) {
    return (
      <Done title="Final test" detail={`${result.right} of ${result.total} right`}
            score={result.score} passed={result.score >= PASS_MARK}
            onAgain={() => { setResult(null); setSeed(seed + 1); }}
            onBack={() => navigation.goBack()} />
    );
  }
  return (
    <Runner steps={steps} navigation={navigation}
            onFinish={(r) => {
              const score = scoreOf(r);
              update((prev) => bestOf(prev, "final", score));
              setResult({ ...r, score });
            }} />
  );
}

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
            /* The spine and every quest the chapter requires: since 2026-09-22
               the next chapter opens on both (§30ap), so a placement that
               marked the spine alone would leave the learner placed at a
               chapter they could not reach. Optional quests are left as they
               are — they gate nothing. */
            for (const unit of [STAGES[si].core, ...required(STAGES[si])]) {
              for (let li = 0; li < lessonCount(unit); li++) {
                next = markComponent(next, unit, li, "vocab");
                next = markComponent(next, unit, li, "quiz", 100);
              }
              if (unit.v) next = markComponent(next, unit, 0, "video");
            }
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
