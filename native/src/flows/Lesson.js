/* A lesson's two runs: the vocabulary walk and the quiz that closes it, with
 * the second look a failed quiz gives before the retake. */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useSession } from "../session";
import { useTheme } from "../theme";
import { Screen, Btn, SectionLabel } from "../ui";
import { Runner, Done, useAudioStopOnLeave } from "../screens/Run";
import { clearRun, saveRun, useResume } from "../resume";
import { WordList, GrammarNote, WordCard, StepBar } from "../lesson";
import { VideoLines } from "../prep";
import { Q } from "../questions";
import {
  L, UN, lessonWords, lessonCount, markComponent, PASS_MARK,
  reviewWords, linesWith, onwardFrom, lowPriorityIdx, sensesOf,
} from "../data";
import { quizPassed } from "@core/state";
import { firstSense } from "@core/util";
import { touchStreak } from "../store";
import { hasRealAudio } from "../audio";
import { useAbout, cardAbout, noteText, linesText } from "../about";
import { scoreOf } from "./shared";

/* What this learner has been taught, for the lesson builders (core/questions.js
   withTaught): a word the scheduler holds a card for has been met. */
export const taughtBy = (st) => {
  const seen = (st && st.seen) || {};
  return (i) => !!(L[i] && seen[L[i].b]);
};

/* The video's sentences a lesson ends on (`VocabFlow`): a few, not a wall. */
const LESSON_LINES = 4;

/* ------------------------------------------------------------- vocabulary */

/* What a teaching step shows, as about.js carries it. The word card's
   sentences are the ones the card draws (lesson.js WordCard: the video's own
   lines, else recorded examples), so the AI counts them as the eye does. */
export function aboutStep(s, at, total, unit, isQuestion) {
  if (!s || isQuestion(s)) return null;
  const base = { kind: s.t, step: `${at + 1} of ${total}` };
  if (s.t === "word" && typeof s.i === "number" && L[s.i]) {
    const w = L[s.i];
    const lines = unit ? linesWith(unit, [s.i], 2) : [];
    const x = lines.length ? lines.map((l) => ({ ru: l.ru, en: l.en }))
      : (w.x || []).filter((ex) => hasRealAudio(ex.ru)).slice(0, 2);
    return { ...base, word: w.b, answer: firstSense(w),
             card: cardAbout({ b: w.b, w: w.w, e: w.e, x }, sensesOf(s.i), { maxSenses: 4, maxExamples: 2 }) };
  }
  if (s.t === "grammar") return { ...base, text: noteText(s.note) };
  if (s.t === "list") {
    return { ...base, text: linesText((s.words || []).map((i) => (L[i] ? { ru: L[i].w, en: firstSense(L[i]) } : null))) };
  }
  if (s.t === "lines") return { ...base, text: linesText(s.lines) };
  return base;
}

export function VocabFlow({ route, navigation }) {
  const { st, update } = useSession();
  const t = useTheme();
  const unit = UN.find((u) => u.id === route.params.unitId);
  const index = route.params.index;
  /* After the words, the video's own sentences that use them (Phase 14, the
     owner, 2026-09-29: *"more video centric. More sentences/phrases"*) — the
     lesson ends on what it is preparing for. */
  const fresh = useMemo(() => {
    const lines = linesWith(unit, lessonWords(unit, index), LESSON_LINES);
    return Q.withTaught(taughtBy(st), () => Q.vocabSteps(unit, index))
      .concat(lines.length ? [{ t: "lines", lines }] : []);
  }, [unit.id, index]);
  const save = { key: `vocab:${unit.id}:${index}`, route: "Vocab", params: { unitId: unit.id, index },
                 title: `${unit.name} · Lesson ${index + 1} words` };
  const resume = useResume(save.key, route.params);
  // A saved walk keeps the steps it was dealt; its questions were drawn at random.
  const steps = resume.restore ? resume.restore.queue : fresh;
  // Null until the learner has moved: where it was left, or the top.
  const [moved, setAt] = useState(null);
  const at = moved !== null ? moved : resume.restore ? resume.restore.at : 0;
  const [done, setDone] = useState(false);
  /* The furthest step reached: a question before it has been answered and
     graded, so stepping back and forth passes over it rather than asking it
     again — which would grade the word twice. */
  const [furthest, setFurthest] = useState(0);
  const reach = Math.max(furthest, at);
  const isQuestion = (s) => !["list", "lines", "grammar", "word"].includes(s.t);
  const skip = (j) => isQuestion(steps[j]) && j < reach;
  useAudioStopOnLeave();

  /* Back goes to the previous card, not out of the lesson (the owner,
     2026-10-02: "the back button should take me to the previous page… right
     now it seems to take me out of the lesson completely"). Only a plain
     back — the header arrow or the phone's — is turned round; Home and a
     jump elsewhere leave as they always did. From the first card it leaves. */
  const atRef = useRef(at);
  atRef.current = at;
  useEffect(() => {
    if (!navigation || typeof navigation.addListener !== "function") return undefined;
    return navigation.addListener("beforeRemove", (e) => {
      const type = e.data && e.data.action && e.data.action.type;
      if (done || (type !== "GO_BACK" && type !== "POP")) return;
      let j = atRef.current - 1;
      while (j >= 0 && skip(j)) j--;
      if (j < 0) return;
      e.preventDefault();
      setFurthest((f) => Math.max(f, atRef.current));
      setAt(j);
    });
  }, [navigation, done, steps, reach]);
  /* A teaching card, for a tester's report and the AI (a question registers
     itself in the runner). What the card shows rides along — the word's
     meanings and the sentences under it, the rule card whole, the word list —
     so "why is it «кухню» in the second sentence?" is about this card (the
     tester, 2026-11-10: "the AI assist can't always reference the screen that
     prompted it"; a word card used to register only its word and first sense). */
  const shown = steps[at];
  useAbout(aboutStep(shown, at, steps.length, unit, isQuestion));

  if (resume.prompt) return resume.prompt;

  if (done) {
    /* On to the quiz (or whatever this lesson has next): the step used to end
       on Back alone, which put the learner on the unit screen or the path
       (the owner, 2026-11-17). */
    const onward = onwardFrom(st, unit, index, "vocab");
    return (
      <Done
        title="Vocabulary done"
        detail={`${lessonWords(unit, index).length} words met`}
        guide="words"
        onContinue={onward ? () => navigation.replace(...onward) : undefined}
        onBack={() => navigation.goBack()}
      />
    );
  }

  // The teaching steps are shown here; question steps hand off to the runner, one
  // at a time, so a lesson interleaves rather than front-loading every card.
  const step = steps[at];
  const advance = () => {
    let next = at + 1;
    while (next < steps.length && skip(next) && next < reach) next++;
    if (next >= steps.length) {
      clearRun(save.key);
      update((prev) => markComponent(prev, unit, index, "vocab"));
      setDone(true);
    } else {
      saveRun(save.key, { ...save, queue: steps, at: Math.max(next, reach), total: steps.length });
      setFurthest((f) => Math.max(f, at));
      setAt(next);
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
          <Btn block kind="pri" label="Finish" onPress={advance} />
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
          : <WordCard i={step.i} at={at} total={steps.length} unit={unit} />}
        {/* marginTop:"auto" against Screen's flexGrow: the action holds one position
            whatever the card's height, instead of moving down the screen each step.
            The gap lives on the wrapper — putting it on the button would change the
            button's own padding. */}
        <View style={{ marginTop: "auto", paddingTop: 16 }}>
          {/* The word list that follows a grammar card owns "Start learning", so
              the card itself only moves on — the two used to carry the same
              label and the lesson asked to start twice. */}
          <Btn kind="pri" label={at + 1 >= steps.length ? "Finish" : "Continue"}
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
      lesson
      onFinish={advance}
      /* Saved the moment the answer is in, pointing past it — saving on
         Continue left a run that re-asked a graded question (the review). */
      onAnswered={() => saveRun(save.key, { ...save, queue: steps, at: at + 1, total: steps.length })}
      navigation={navigation}
    />
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
    const next = Q.withTaught(taughtBy(st), () => Q.quizSteps(unit, index, review, st.seen, asked.current,
                                                                lowPriorityIdx(st)));
    asked.current = Q.stepKeys(next);
    return next;
  }, [unitId, index, seed]);
  useAudioStopOnLeave();
  const save = { key: `quiz:${unitId}:${index}`, route: "Quiz", params: { unitId, index },
                 title: `${unit.name} · Lesson ${index + 1} quiz` };
  const resume = useResume(save.key, route.params);
  if (resume.prompt) return resume.prompt;

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
    const { passed, relief, thisRun } = result;
    const missed = missedWords(result.results, lessonWords(unit, index));
    // The rest of the lesson, the next lesson, or the next unit (data.js).
    const onward = onwardFrom(st, unit, index, "quiz");
    return (
      <Done
        title={relief ? `Passed on the ${ordinal(result.tries)} try`
             : thisRun ? "Quiz passed"
             : passed ? "Lesson already passed" : `Not quite. ${PASS_MARK}% to pass`}
        /* Which words, not just how many: a score says a learner failed, the
           words say what to do about it. Language material, so it is not the
           explanatory copy rule 20.7 bans. */
        detail={missed.length && !passed
          ? `${result.right} of ${result.total} right · ${missed.map((i) => L[i].w).join(", ")}`
          : `${result.right} of ${result.total} right`}
        score={result.score}
        passed={passed}
        /* The end of a lesson quiz is where Teddy belongs and the drills are
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
        /* On to what follows in this lesson — the summary, then the video
           (data.js afterStep) — and only then the next lesson. */
        onContinue={!passed || !onward ? undefined : () => navigation.replace(...onward)}
        /* Done's own "Continue", not the step's name (the owner,
           2026-10-09: "Replace summary with Continue"). */
        onBack={() => navigation.goBack()}
      />
    );
  }

  return (
    <Runner
      steps={steps}
      navigation={navigation}
      stepBack
      lesson
      save={save}
      restore={resume.restore}
      onFinish={(r) => {
        const score = scoreOf(r);
        const before = ((st.unit[unit.id] || {}).lessons || {})[index] || {};
        const slot = { q: Math.max(before.q || 0, score), tries: (before.tries || 0) + 1 };
        const passed = quizPassed(slot);
        /* What *this* run did, beside what the lesson now is. `passed` reads the
           best mark, so a 90 % pass retaken at 30 % said "Passed on the second
           try" over a 30 (the review, 2026-10-01). Relief is a fact about the
           run that earned the pass. */
        const thisRun = quizPassed({ q: score, tries: slot.tries });
        update((prev) => touchStreak(markComponent(prev, unit, index, "quiz", score)));
        setResult({ ...r, score, passed, thisRun, relief: thisRun && score < PASS_MARK, tries: slot.tries });
      }}
    />
  );
}

const ordinal = (n) => (n === 1 ? "first" : n === 2 ? "second" : n === 3 ? "third" : `${n}th`);
