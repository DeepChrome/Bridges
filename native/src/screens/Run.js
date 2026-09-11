/* The exercise runner.
 *
 * One component drives every kind of question set — vocabulary, lesson quiz, the six
 * drills, the placement test and a section test-out. They differ in what generates the
 * steps and what happens at the end, not in how a question is asked, so those are the
 * only two things a caller supplies.
 */

import React, { useEffect, useRef, useState } from "react";
import { View, Pressable, ScrollView, Alert, Animated } from "react-native";
import { useSession } from "../session";
import { useTheme, radius } from "../theme";
import { Screen, Card, Btn, Bar, Pill, Speaker, Muted, Sheet, Text } from "../ui";
import { GuidePop } from "../guide";
import { useEnter, usePop, useSwap, usePress } from "../motion";
import { guideLine, poseFor, LINES } from "@core/guide";
import { say, cue, answerAudioText, stop as stopAudio, whenIdle } from "../audio";
import { RuInput } from "../keyboard";
import { charDistance } from "@core/compare";
import { Linked } from "../words";
import { Hear } from "../activities/Hear";
import { Say } from "../activities/Say";
import { Scene } from "../activities/Scene";
import { Passage } from "../activities/Passage";
import { PairHear, PairSay } from "../activities/Pair";
import { Shadow } from "../activities/Shadow";
import { L, UN, lessonWords, markComponent, PASS_MARK } from "../data";
import { gradeFor, applyGrade } from "@core/fsrs";
import { fold, translit, today, translitBack, firstSense } from "@core/util";

/* One review into state. The grade comes from gradeFor (right or wrong, table used or
   not) or is handed in directly by an activity that scores itself, as the speaking
   activities will. Both go through core's applyGrade, so the trouble rule lives once
   for both platforms. */
function gradeInto(st, idx, grade) {
  if (typeof idx !== "number" || !L[idx]) return st;
  const r = applyGrade(st.seen, st.trouble, L[idx].b, grade, today());
  return { ...st, seen: r.seen, trouble: r.trouble };
}

function Options({ q, answered, picked, onPick }) {
  return (
    <View style={{ gap: 9 }}>
      {q.options.map((o, i) => (
        <Option key={i} o={o} i={i} answered={answered} picked={picked} onPick={onPick} />
      ))}
    </View>
  );
}

/* One option. Its own component because a hook cannot live in a `map`, and it
   needs one: an answer is the thing a learner touches most in this app, so if
   anything is going to feel physical it is this. */
function Option({ o, i, answered, picked, onPick }) {
  const t = useTheme();
  const press = usePress();
  const isPicked = picked === i;
  const show = answered && (o.right || isPicked);
  const border = !show ? t.line : o.right ? t.good : t.bad;
  const bg = !show ? t.surface : o.right ? t.goodBg : t.badBg;
  /* The right answer pops when it is revealed — including when the learner
     picked something else, because that is the moment they need their eye taken
     to it. Nothing pops on a wrong pick: the colour says enough, and bouncing
     the thing someone just got wrong is gloating. */
  const reveal = usePop([answered && o.right]);
  return (
    <Animated.View style={[answered && o.right ? reveal : null, answered ? null : press.style]}>
      <Pressable
        disabled={answered}
        onPress={() => onPick(i, o)}
        onPressIn={answered ? undefined : press.onPressIn}
        onPressOut={answered ? undefined : press.onPressOut}
        style={({ pressed }) => ({
          backgroundColor: bg, borderColor: border, borderWidth: 1,
          borderBottomWidth: pressed ? 1 : 3, borderRadius: radius.md,
          paddingVertical: 15, paddingHorizontal: 16, minHeight: 54,
          justifyContent: "center",
        })}
      >
        <Text style={{ color: t.ink, fontSize: 16 }}>{o.label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function Typed({ q, answered, onAnswer }) {
  const t = useTheme();
  const [text, setText] = useState("");
  const check = () => {
    if (answered) return;
    const given = fold(text);
    const want = fold(q.target);
    const typed = given === want || translit(given) === want ? want
      : /[а-яё]/i.test(given) ? given : translit(given);
    // Another word of the pool with the same meaning is right too: "jacket"
    // is «пиджак» and «куртка», and the prompt did not say which.
    if (typed === want || (q.alts || []).includes(typed)) return onAnswer(true);
    // A letter off on a word of four or more is half credit — the word is known,
    // the spelling is not — and the verdict says which letter.
    const d = charDistance(typed, want);
    if (d === 1 && want.length >= 4) onAnswer(false, undefined, undefined, { credit: 0.5, note: "One letter off" });
    else onAnswer(false);
  };
  return (
    <View>
      <RuInput value={text} onChangeText={setText} editable={!answered} onSubmit={check}
               testID="type-input" />
      {/* The Latin spelling of the answer is shown only once it has been given —
          before that it is the answer, in a font the learner can read. */}
      {answered ? (
        <Muted style={{ marginTop: 8 }}>{`Latin spelling: “${translitBack(q.target)}”`}</Muted>
      ) : null}
      {!answered ? (
        <Btn kind="pri" label="Check" style={{ marginTop: 12 }} onPress={check} />
      ) : null}
    </View>
  );
}

function Match({ q, onDone }) {
  const t = useTheme();
  const [left] = useState(() => q.pairs.slice().sort(() => Math.random() - 0.5));
  const [right] = useState(() => q.pairs.slice().sort(() => Math.random() - 0.5));
  const [picked, setPicked] = useState(null);
  const [cleared, setCleared] = useState([]);
  const [wrong, setWrong] = useState(null);
  const missed = useRef(0);

  const tap = (side, item) => {
    if (cleared.includes(item.i)) return;
    if (!picked) { setPicked({ side, item }); return; }
    if (picked.side === side) { setPicked({ side, item }); return; }
    if (picked.item.i === item.i) {
      const next = cleared.concat(item.i);
      setCleared(next);
      setPicked(null);
      if (next.length === q.pairs.length) {
        // Every pair gets matched in the end; the credit is how many were matched
        // without a miss along the way.
        const credit = Math.max(0, 1 - missed.current / q.pairs.length);
        onDone(missed.current === 0, q.pairs.map((p) => p.i), credit,
               missed.current ? `${missed.current} ${missed.current === 1 ? "miss" : "misses"}` : null);
      }
    } else {
      missed.current += 1;
      setWrong(item.i);
      setTimeout(() => setWrong(null), 400);
      setPicked(null);
    }
  };

  const cell = (side, item, label) => {
    const done = cleared.includes(item.i);
    const sel = picked && picked.side === side && picked.item.i === item.i;
    const bad = wrong === item.i;
    return (
      <Pressable
        key={side + item.i}
        disabled={done}
        onPress={() => tap(side, item)}
        style={{ backgroundColor: done ? t.goodBg : bad ? t.badBg : t.surface,
                 borderColor: done ? t.good : bad ? t.bad : sel ? t.info : t.line,
                 borderWidth: 1, borderBottomWidth: 3, borderRadius: radius.md,
                 padding: 13, minHeight: 54, justifyContent: "center", flex: 1 }}
      >
        <Text style={{ color: t.ink, fontSize: 15 }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flexDirection: "row", gap: 9 }}>
      <View style={{ flex: 1, gap: 9 }}>{left.map((p) => cell("l", p, p.ru))}</View>
      <View style={{ flex: 1, gap: 9 }}>{right.map((p) => cell("r", p, p.en))}</View>
    </View>
  );
}

function HintSheet({ q, onClose }) {
  const t = useTheme();
  return (
    <Sheet onClose={onClose}
           footer={<Btn kind="pri" label="Got it" style={{ marginTop: 14 }} onPress={onClose} />}>
      {q.table ? (
        <>
          <Text style={{ color: t.ink, fontSize: 17, fontWeight: "600",
                         marginBottom: 8 }}>{q.table.title}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={{ flexDirection: "row" }}>
                {q.table.columns.map((c) => (
                  <Text key={c} style={{ width: 105, color: t.ink3, fontSize: 10,
                                         fontWeight: "600", paddingVertical: 6,
                                         textTransform: "uppercase" }}>{c}</Text>
                ))}
              </View>
              {q.table.rows.map((r, ri) => (
                <View key={ri} style={{ flexDirection: "row", borderTopWidth: 1,
                                        borderTopColor: t.lineSoft }}>
                  {r.map((cell, ci) => (
                    <Text key={ci} style={{ width: 105, paddingVertical: 6,
                                            fontSize: ci === 0 ? 12 : 15,
                                            color: ci === 0 ? t.ink3 : t.ink }}>
                      {Array.isArray(cell) ? cell.join(" / ") : cell}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </>
      ) : null}
      {q.note ? (
        <>
          <Text style={{ color: t.ink, fontSize: 17, fontWeight: "600" }}>
            {q.note.title}
          </Text>
          <Text style={{ color: t.ink2, fontSize: 15, marginTop: 6 }}>
            {q.note.body}
          </Text>
          {(q.note.examples || []).map(([ru, en], k) => (
            <View key={k} style={{ marginTop: 12, borderTopWidth: 1,
                                   borderTopColor: t.lineSoft, paddingTop: 10 }}>
              <Linked text={ru} size={18} />
              <Muted>{en}</Muted>
            </View>
          ))}
        </>
      ) : null}
    </Sheet>
  );
}

/* ---------------------------------------------------------------- registry */

/* Which component draws a question, by its kind — the same shape as the web app's
   EXERCISES map. Every kind core/questions.js can emit has an entry, and
   registry.test.js proves that by running the generators rather than by a list that
   could drift. Adding an activity is one generator case, one entry here, one
   component. A kind with no entry draws nothing; the test makes that a failure
   rather than a blank step in someone's lesson.

   The runner hands each view the same small contract: the question, and
   { answered, picked, setPicked, record, skip } — record(correct, words, grade)
   being how any view reports a result. `words` is a list of lemma indices sharing
   one grade, or of { i, grade } pairs when the view scored each word itself, as
   the speech activities do. skip() is for a step that cannot be attempted at all
   (no microphone): it grades nothing and leaves the score alone. */
const asOptions = (q, r) => (
  <Options q={q} answered={r.answered} picked={r.picked}
           onPick={(i, o) => { r.setPicked(i); r.record(!!o.right); }} />
);

/* A question that is written when it was built to be written and chosen when it
   was not. The generator decides (core/questions.js): some shapes have nothing
   to produce, and a run with the setting on still falls back to those. */
const eitherWay = (q, r) => (q.typed
  ? <Typed q={q} answered={r.answered} onAnswer={r.record} />
  : asOptions(q, r));

export const VIEWS = {
  "choose-en": asOptions,
  "choose-ru": asOptions,
  listen: asOptions,
  cloze: asOptions,
  /* The four drills a learner can either choose from or write (Settings →
     "Write drill answers"). The question says which it is, exactly as the
     chapter's form question does below. */
  cases: eitherWay,
  aspect: eitherWay,
  agreement: eitherWay,
  conjugation: eitherWay,
  // Where the stress falls, and what a rule says: neither is a thing to write.
  stress: asOptions,
  grammar: asOptions,
  type: (q, r) => <Typed q={q} answered={r.answered} onAnswer={r.record} />,
  // The chapter's form: chosen from the paradigm early, typed later — the
  // question says which (core/questions.js FORM_MIX).
  form: eitherWay,
  match: (q, r) => <Match q={q} onDone={(ok, idxs, credit, note) => r.record(ok, idxs, undefined, { credit, note })} />,
  hear: (q, r) => <Hear q={q} r={r} />,
  say: (q, r) => <Say q={q} r={r} />,
  scene: (q, r) => <Scene q={q} r={r} />,
  // A listening passage and the questions that follow it (ROADMAP P10.3).
  passage: (q, r) => <Passage q={q} r={r} />,
  heard: asOptions,
  // The pronunciation drill: hear a contrast, then produce it (P10.8).
  "pair-hear": (q, r) => <PairHear q={q} r={r} />,
  "pair-say": (q, r) => <PairSay q={q} r={r} />,
  // Hear a sentence and say it straight back (P10.6).
  shadow: (q, r) => <Shadow q={q} r={r} />,
};

/* ------------------------------------------------------------------ runner */

/* Leaving a flow stops whatever is playing. This lives on the flow screens, not
   the runner: the vocabulary flow remounts its runner for every question, and a
   recording must be allowed to finish across that boundary. */
export function useAudioStopOnLeave() {
  useEffect(() => () => stopAudio(), []);
}

/* `progress` overrides the bar and the count when the runner is showing one step
   of a longer flow — the vocabulary lesson runs each question in its own runner,
   and "1/1" over an empty bar on every question said nothing.

   `recycle` (default on): a question answered short of full credit goes to the
   back of the deck and comes round once more. The score counts first attempts
   only, so the retake is practice, not a second chance at the mark; the retake
   is still a review for the scheduler. Off for the placement and section tests,
   which measure rather than teach, and for the one-question vocabulary runner. */
export function Runner({ title, steps, onFinish, gradeWords = true, progress, recycle = true, navigation }) {
  const { update } = useSession();
  const t = useTheme();
  const [queue, setQueue] = useState(() => steps.slice());
  const [at, setAt] = useState(0);
  const finished = useRef(false);

  /* The back arrow sits a thumb's width from Home, and one mis-tap used to throw
     a ten-minute placement away without a word. With `navigation` given, a run
     that has started and not finished asks first. Grades already written stay
     written; only the mark is lost. */
  const guard = useRef(false);
  useEffect(() => {
    if (!navigation || typeof navigation.addListener !== "function") return undefined;
    return navigation.addListener("beforeRemove", (e) => {
      if (!guard.current) return;
      e.preventDefault();
      Alert.alert("Leave the quiz?", "The mark is lost; what you have answered is kept.",
                  [{ text: "Stay", style: "cancel" },
                   { text: "Leave", style: "destructive",
                     onPress: () => navigation.dispatch(e.data.action) }]);
    });
  }, [navigation]);
  const [answered, setAnswered] = useState(false);
  const [verdict, setVerdict] = useState(null);      // { right, credit, note } | skipped: right null
  const [picked, setPicked] = useState(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [usedHint, setUsedHint] = useState(false);
  const results = useRef([]);
  const tally = useRef({ right: 0, wrong: 0, helped: 0, skipped: 0, credit: 0 });
  const sayTimer = useRef(null);
  const atRef = useRef(0);
  const alive = useRef(true);

  const q = queue[at];
  guard.current = at > 0 && !finished.current;

  // Autoplay waits for whatever is still playing — the previous answer's reading,
  // the previous question's recording — so nothing talks over the language audio.
  // If the learner has moved on again by the time it is quiet, this one is
  // dropped — and so is one queued when the runner itself has gone: leaving
  // stops the audio, and stopping is exactly what released the wait.
  useEffect(() => {
    atRef.current = at;
    if (!q || !q.autoplay) return;
    const mine = at;
    whenIdle().then(() => { if (alive.current && atRef.current === mine) say(q.autoplay, { repeat: false }); });
  }, [at]);

  useEffect(() => () => {
    alive.current = false;
    if (sayTimer.current) clearTimeout(sayTimer.current);
  }, []);

  if (!q) return null;

  /* `grade` lets an activity that scores itself hand in 1–4 directly. Without it, the
     answer's right/wrong and whether the table was used decide, as before. An entry
     of `words` that is { i, grade } carries its own grade instead. `extra.credit`
     (0–1, default 1 or 0 from `correct`) is partial credit for the score, with
     `extra.note` saying why ("3 of 4 words"). */
  const record = (correct, words, grade, extra) => {
    const credit = extra && typeof extra.credit === "number"
      ? Math.max(0, Math.min(1, extra.credit)) : (correct ? 1 : 0);
    const note = extra && extra.note ? extra.note : null;
    setAnswered(true);
    setVerdict({ right: !!correct, credit, note });

    cue(correct ? "right" : "wrong");
    // The word itself, just behind the cue so the two do not talk over each
    // other. Only on a correct answer: hearing the right form is the reward,
    // and it is also the moment the learner is listening for it.
    if (correct) {
      const opt = q.options ? q.options.find((o) => o.right) : null;
      const text = answerAudioText(q, opt);
      if (text) {
        if (sayTimer.current) clearTimeout(sayTimer.current);
        sayTimer.current = setTimeout(() => say(text, { repeat: false }), 420);
      }
    }

    // The mark is the first attempt's; a recycled question is not scored again.
    if (!q.retry) {
      if (correct) tally.current.right += 1; else tally.current.wrong += 1;
      tally.current.credit += credit;
      if (usedHint) tally.current.helped += 1;
      results.current.push({ right: !!correct, credit, stage: q.stage, lesson: q.lesson, i: q.i });
    }
    if (recycle && credit < 1 && !q.retry) {
      setQueue((prev) => prev.concat([{ ...q, retry: true }]));
    }
    if (gradeWords) {
      const entries = words || (typeof q.i === "number" ? [q.i] : []);
      if (entries.length) {
        const g = grade || gradeFor(correct, usedHint);
        update((prev) => entries.reduce((acc, e) => (
          typeof e === "number" ? gradeInto(acc, e, g) : gradeInto(acc, e.i, e.grade)
        ), prev));
      }
    }
  };

  /* A step that could not be attempted. Not a wrong answer: it is left out of the
     total, so a phone with the microphone off scores the same quiz as one without. */
  const skip = () => {
    setAnswered(true);
    setVerdict({ right: null, credit: 0, note: null });
    if (!q.retry) {
      tally.current.skipped += 1;
      results.current.push({ skipped: true, stage: q.stage, lesson: q.lesson, i: q.i });
    }
  };

  const next = () => {
    // Moving on cancels a reading that has not started yet; one already playing
    // is left to finish — the next question's audio waits for it.
    if (sayTimer.current) { clearTimeout(sayTimer.current); sayTimer.current = null; }
    if (at + 1 >= queue.length) {
      finished.current = true;
      guard.current = false;
      onFinish({ ...tally.current, total: steps.length - tally.current.skipped,
                 results: results.current });
      return;
    }
    setAt(at + 1);
    setAnswered(false);
    setVerdict(null);
    setPicked(null);
    setUsedHint(false);
  };

  const answer = q.options ? q.options.find((o) => o.right) : null;
  const right = verdict ? verdict.right : null;
  const partial = verdict && verdict.right === false && verdict.credit > 0;
  const tone = !verdict || verdict.right === null ? null
    : verdict.right ? { bg: t.goodBg, line: t.good, btn: "good" }
    : partial ? { bg: t.brandBg, line: t.brand, btn: "pri" }
    : { bg: t.badBg, line: t.bad, btn: "bad" };
  /* The verdict rises into place instead of appearing whole. It is the one
     moment in a quiz where something happens *to* the learner rather than
     because of them, and it used to be indistinguishable from a re-render.
     Keyed on the step as well as `answered` so it plays once per question. */
  const verdictIn = useEnter([answered, at], { distance: 14 });
  /* Keyed on the question rather than on the index: a recycled question comes
     back at a different position, and a learner who has just been handed the
     same word again should see it arrive rather than find it already there. */
  const questionIn = useSwap(`${at}:${q.kind}:${q.prompt}`);
  const answerIn = useSwap(`${at}:answer`, { distance: 22 });

  return (
    <Screen fill>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12,
                     marginBottom: 16 }}>
        <View style={{ flex: 1 }}>
          <Bar animate value={progress ? progress.at / progress.total : at / queue.length} />
        </View>
        <Pill tone="brand">
          {progress ? `${progress.at + 1}/${progress.total}` : `${at + 1}/${queue.length}`}
        </Pill>
      </View>

      {/* The question slides in from the right as the last one leaves. Eight
          questions with a hard cut between them read as one question whose
          words keep changing; this is what gives a quiz the sense of moving
          through something. */}
      <Animated.View style={[questionIn, { alignItems: "center", marginBottom: 20 }]}>
        <Text style={{ color: t.ink3, fontSize: 12, fontWeight: "600", letterSpacing: 1,
                       textTransform: "uppercase", marginBottom: 12,
                       textAlign: "center" }}>
          {q.ask}
        </Text>
        {q.prompt ? (
          <Text style={{ color: t.ink, fontWeight: "600", textAlign: "center",
                         fontSize: q.cyr ? 30 : 22, lineHeight: q.cyr ? 38 : 30 }}>
            {q.prompt}
          </Text>
        ) : null}
        {q.sub ? <Muted style={{ marginTop: 6, textAlign: "center" }}>{q.sub}</Muted> : null}
        {q.say ? <View style={{ marginTop: 12 }}><Speaker text={q.say} /></View> : null}
      </Animated.View>

      {/* A hint — the table, or the meaning of what was heard — costs the grade:
          right with a hint is Hard, not Good. The label says so beforehand;
          nothing used to, and the table opened on every question. */}
      {(q.table || q.note) && !answered ? (
        <Btn
          kind="ghost"
          label={usedHint ? "Table used · counts as a hint" : "Show the table · counts as a hint"}
          disabled={usedHint}
          style={{ marginBottom: 12 }}
          onPress={() => { setUsedHint(true); setHintOpen(true); }}
        />
      ) : null}

      {q.hint && !answered ? (
        usedHint ? (
          <Muted testID="hint-text" style={{ marginBottom: 12, textAlign: "center", fontSize: 15 }}>
            {q.hint}
          </Muted>
        ) : (
          <Btn kind="ghost" label="Hint · counts" style={{ marginBottom: 12 }}
               onPress={() => setUsedHint(true)} />
        )
      ) : null}

      {/* Keyed by position so a view is remounted for every step: two typed
          questions in a row otherwise share one input, and the second opens with
          the first's answer still in it. */}
      <Animated.View key={at} style={answerIn}>
        {VIEWS[q.kind] ? VIEWS[q.kind](q, { answered, picked, setPicked, record, skip, usedHint }) : null}
      </Animated.View>

      {answered ? (
        // Anchored to the foot of the screen against Screen's flexGrow, so Continue
        // sits in the same place on every question instead of wherever the options
        // happened to end — the same rule Flows.js and the web runner already follow.
        // The gap lives on the wrapper, not the card.
        <Animated.View testID="verdict"
                       style={[verdictIn, { marginTop: "auto", paddingTop: 18 }]}>
          <Card style={tone ? { backgroundColor: tone.bg, borderColor: tone.line } : undefined}>
            {/* Yuri turns up for a clean answer and nowhere else in the runner.
                He is the reward, so he has to stay rare: on every verdict he
                would be wallpaper within one quiz, and on a wrong answer he
                would be a cartoon commiserating with someone who is trying to
                concentrate. */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {right === true && !usedHint ? <GuidePop pose="cheer" size={40} /> : null}
              <Text style={{ color: t.ink, fontWeight: "700", fontSize: 16 }}>
                {right === null ? "Skipped" : right ? "Correct" : partial ? "Almost" : "Not quite"}
              </Text>
            </View>
            {verdict && verdict.note ? (
              <Text style={{ color: t.ink2, marginTop: 4, fontSize: 15 }}>{verdict.note}</Text>
            ) : null}
            {right === false && (answer || q.answer) ? (
              <Text style={{ color: t.ink2, marginTop: 4, fontSize: 15 }}>
                {`Answer: ${answer ? answer.label : q.answer}`}
              </Text>
            ) : null}
            {/* A gap-fill gives the sentence back whole, every word a link, and
                names the form that filled it. */}
            {right !== null && q.reveal ? (
              <View style={{ marginTop: 8 }}>
                <Linked text={q.reveal} size={17} />
                {q.formNote ? <Muted style={{ marginTop: 3 }}>{q.formNote}</Muted> : null}
              </View>
            ) : null}
            {/* "Comes round again" and "Right, with a hint" used to sit here.
                Both explained a mechanism rather than telling the learner
                anything they could act on — the question does come round again,
                and they will see it; the hint button said it counted before it
                was pressed. The owner, 2026-09-10: "don't have to explain
                features that don't have to be explained." */}
            <Btn kind={tone ? tone.btn : "plain"} label="Continue"
                 style={{ marginTop: 12 }} onPress={next} />
          </Card>
        </Animated.View>
      ) : null}

      {hintOpen ? <HintSheet q={q} onClose={() => setHintOpen(false)} /> : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------ done */

/* The kinds Done will let Yuri react to; anything else leaves him off. */
const GUIDE_KINDS = Object.keys(LINES);

/* The end of a run. The primary button points forward: after a pass it is
   Continue (or Done), and "Try again" drops to a ghost — it used to be the
   blue button whether the quiz was passed or failed, so passing read as an
   invitation to do it over (the interface review, 2026-09-08). */
export function Done({ title, detail, score, passed, onAgain, onBack, againLabel, onContinue, continueLabel, guide }) {
  const t = useTheme();
  const tone = passed === false ? { bg: t.badBg, fg: t.bad }
             : passed === true ? { bg: t.goodBg, fg: t.good }
             : { bg: t.brandBg, fg: t.brandInk };
  const forward = passed !== false;
  /* `guide` is a kind from core/guide.js — "words", "passed", "scraped",
     "failed". It turns the end of a run from a tick over an apology into the one
     screen where Yuri has something to say, and it is opt-in so the half-dozen
     places that reuse Done as an empty-state message box stay plain. */
  const kind = guide && GUIDE_KINDS.includes(guide) ? guide : null;
  const line = kind ? guideLine(kind, (title || "").length) : null;
  const pop = usePop([kind, title]);
  return (
    <Screen>
      <Card style={{ alignItems: "center", paddingVertical: 30 }}>
        {kind ? (
          <GuidePop pose={poseFor(kind)} size={92} style={{ marginBottom: 6 }} />
        ) : null}
        <Animated.View
          style={[pop, { width: 76, height: 76, borderRadius: 38, marginBottom: 14,
                         alignItems: "center", justifyContent: "center",
                         backgroundColor: tone.bg }]}>
          <Text style={{ color: tone.fg, fontSize: 22, fontWeight: "700" }}>
            {score !== undefined ? `${score}%` : "✓"}
          </Text>
        </Animated.View>
        <Text style={{ color: t.ink, fontSize: 16, fontWeight: "600" }}>{title}</Text>
        {detail ? <Muted style={{ marginTop: 6, textAlign: "center" }}>{detail}</Muted> : null}
        {line ? (
          <Muted testID="done-line" style={{ marginTop: 10, textAlign: "center", fontStyle: "italic" }}>
            {line}
          </Muted>
        ) : null}
      </Card>
      {forward ? (
        <Btn kind="pri" label={onContinue ? (continueLabel || "Continue") : "Done"}
             style={{ marginTop: 16 }} onPress={onContinue || onBack} />
      ) : null}
      {onAgain ? (
        <Btn kind={forward ? "ghost" : "pri"} label={againLabel || "Again"}
             style={{ marginTop: forward ? 8 : 16 }} onPress={onAgain} />
      ) : null}
      {!forward || onContinue ? (
        <Btn kind="ghost" label="Back" style={{ marginTop: 8 }} onPress={onBack} />
      ) : null}
    </Screen>
  );
}
