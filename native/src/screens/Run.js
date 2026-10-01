/* The exercise runner.
 *
 * One component drives every kind of question set — vocabulary, lesson quiz, the six
 * drills, the placement test and a section test-out. They differ in what generates the
 * steps and what happens at the end, not in how a question is asked, so those are the
 * only two things a caller supplies.
 */

import React, { useEffect, useRef, useState } from "react";
import { View, Pressable, ScrollView, Alert, Animated, ActivityIndicator } from "react-native";
import { useSession } from "../session";
import { useTheme, radius, type as T } from "../theme";
import Svg, { Path } from "react-native-svg";
import { isNotebook, notebookFont, markOutOfFive } from "../skin";
import { Screen, Card, Btn, Bar, Pill, Speaker, Muted, Sheet, Lift, Text, Marked, Note,
         BulbButton } from "../ui";
import { RuleCard, Reference, hasReference, StandardWhy } from "../rules";
import { topicFor } from "@core/grammar";
import { wordFacts, isIrregular } from "@core/facts";
import { standardExplanation } from "@core/explain";
import { GuidePop } from "../guide";
import { useEnter, usePop, useSwap, usePress } from "../motion";
import { guideLine, poseFor, LINES } from "@core/guide";
import { say, cue, answerAudioText, stop as stopAudio, whenIdle } from "../audio";
import { right as buzzRight, wrong as buzzWrong, done as buzzDone } from "../haptics";
import { RuInput } from "../keyboard";
import { charDistance } from "@core/compare";
import { Linked, useWords } from "../words";
import { Hear } from "../activities/Hear";
import { Say } from "../activities/Say";
import { Scene } from "../activities/Scene";
import { PairHear, PairSay } from "../activities/Pair";
import { Shadow } from "../activities/Shadow";
import { Build } from "../activities/Build";
import { L, UN, lessonWords, markComponent, PASS_MARK } from "../data";
import { gradeFor, applyGrade, reviewRows, directionOfKind, schedulerOpts } from "@core/scheduler";
import { fold, firstSense } from "@core/util";
import { explain as askWhy, config as workerConfig } from "../lib/feedback";

/* The kinds a wrong answer can be explained for: one right answer, one thing
   the learner put instead. The speaking and listening activities carry their
   own feedback and are not on the list; a match has no single answer. */
export const EXPLAIN_KINDS = ["cases", "aspect", "agreement", "conjugation", "stress",
                              "cloze", "type", "choose-en", "choose-ru", "listen", "form"];
/* How many wrong answers the profile keeps for the tutor (store.js `misses`). */
export const MISSES_KEPT = 30;

/* A wrong answer, as the profile records it: what was asked, what was right,
   what was put. Exported for the tutor's tests. */
export function missOf(q, said) {
  const opt = q.options ? q.options.find((o) => o.right) : null;
  return { kind: q.kind, prompt: String(q.prompt || ""), answer: opt ? String(opt.label) : String(q.answer || ""),
           said: said === undefined || said === null ? null : String(said), at: Date.now() };
}

/* One review into state. The grade comes from gradeFor (right or wrong, table used or
   not) or is handed in directly by an activity that scores itself, as the speaking
   activities do. Every grade goes through core's applyGrade, so the trouble rule
   lives once; the direction is the question's (core/scheduler.js
   DIRECTION_OF_KIND) — a meaning chosen is recognition, a word typed is
   production, a sentence heard is listening. */
function gradeInto(st, idx, grade, direction, now) {
  if (typeof idx !== "number" || !L[idx]) return st;
  const r = applyGrade(st.seen, st.trouble, L[idx].b, direction, grade, now, schedulerOpts(st));
  return { ...st, seen: r.seen, trouble: r.trouble };
}

/* The prompt is the subject of the question, so it should be the largest thing
   on the screen — but a prompt is anything from «в» to a whole sentence with a
   gap in it. Sized to its length, the way the lesson card's band already is
   (lesson.js bandSize): one word gets to be big, a sentence steps down until it
   fits. Latin prompts (an English word to translate) stay smaller — they are
   read at a glance and it is the Russian that is worth looking at. */
export function promptSize(q) {
  const n = String(q.prompt || "").length;
  if (!q.cyr) return n > 28 ? 19 : 22;
  if (n > 40) return 22;
  if (n > 22) return 26;
  if (n > 11) return 34;
  return 44;
}

/* Whether a question's view carries a text input, and so a keyboard.
 *
 * The question block takes the slack above the answers (`flexGrow`), which is
 * right when the answers are four options and wrong the moment a keyboard
 * opens: Android resizes the window, the block centres itself in what is left,
 * and the input and Check sit below the fold — the learner types into a field
 * they cannot see. Seen on the emulator on 2026-09-15 before it shipped. A
 * question that will open a keyboard stacks from the top instead, which is
 * what every keyboard-first exercise does, and it is the layout the learner
 * sees first in any case: neither input auto-focuses, so there is no jump when
 * the keyboard arrives.
 *
 * Not `KeyboardAvoidingView`: with the window already resizing for the
 * keyboard, "height" behaviour shrinks it a second time. */
export const hasInput = (q) => !!q.typed || q.kind === "type" || q.kind === "hear";

function Options({ q, answered, picked, onPick }) {
  /* One- and two-word answers are centred; sentences are not. A short label
     left-aligned in a full-width box leaves the word marooned at one end, and
     four of them read as an empty list — which is what "in / from / this is /
     with" looked like. A sentence has to start at the left or the eye has
     nowhere to return to. */
  const centred = q.options.every((o) => String(o.label).length <= 18);
  return (
    <View style={{ gap: 9 }}>
      {q.options.map((o, i) => (
        <Option key={i} o={o} i={i} answered={answered} picked={picked} onPick={onPick}
                centred={centred} />
      ))}
    </View>
  );
}

/* One option. Its own component because a hook cannot live in a `map`, and it
   needs one: an answer is the thing a learner touches most in this app, so if
   anything is going to feel physical it is this. */
function Option({ o, i, answered, picked, onPick, centred }) {
  const t = useTheme();
  const isPicked = picked === i;
  const show = answered && (o.right || isPicked);
  /* Untouched, the edge is a step darker than the page rather than the hairline
     the surface already carries — an edge the same weight as a border is not an
     edge, which is why these read as flat boxes however thick the bottom was. */
  const edge = !show ? t.surface3 : o.right ? t.goodDim : t.badDim;
  const border = !show ? t.line : o.right ? t.good : t.bad;
  const bg = !show ? t.surface : o.right ? t.goodBg : t.badBg;
  /* The right answer pops when it is revealed — including when the learner
     picked something else, because that is the moment they need their eye taken
     to it. Nothing pops on a wrong pick: the colour says enough, and bouncing
     the thing someone just got wrong is gloating. */
  const reveal = usePop([answered && o.right]);
  return (
    <Animated.View style={answered && o.right ? reveal : null}>
      <Lift edge={edge} fill={bg} border={border} r={radius.md}
            disabled={answered} onPress={() => onPick(i, o)}>
        <View style={{ paddingVertical: 15, paddingHorizontal: 16, minHeight: 54,
                       justifyContent: "center",
                       alignItems: centred ? "center" : "flex-start" }}>
          {/* Weight 600, not regular: an answer is a label on a control, not
              body copy, and the reference sets its buttons heavy. */}
          <Text style={{ color: t.ink, fontSize: 16, fontWeight: "600",
                         textAlign: centred ? "center" : "left" }}>{o.label}</Text>
        </View>
      </Lift>
    </Animated.View>
  );
}

function Typed({ q, answered, onAnswer }) {
  const t = useTheme();
  const [text, setText] = useState("");
  const check = () => {
    if (answered) return;
    /* Russian letters or nothing. Latin typing used to be transliterated and
       accepted; the owner ruled it out (2026-09-19) — a spelling in the wrong
       alphabet is not the word, and the on-screen keyboard is there for a phone
       without a Russian layout. */
    const typed = fold(text);
    const want = fold(q.target);
    // Another word of the pool with the same meaning is right too: "jacket"
    // is «пиджак» and «куртка», and the prompt did not say which.
    // `said` rides on every verdict: what was put is what an explanation of
    // the miss is about (EXPLAIN_KINDS), and what the profile keeps for the tutor.
    if (typed === want || (q.alts || []).includes(typed)) return onAnswer(true, undefined, undefined, { said: text });
    // A letter off on a word of four or more is half credit — the word is known,
    // the spelling is not — and the verdict says which letter.
    const d = charDistance(typed, want);
    if (d === 1 && want.length >= 4) onAnswer(false, undefined, undefined, { credit: 0.5, note: "One letter off", said: text });
    else onAnswer(false, undefined, undefined, { said: text });
  };
  return (
    <View>
      <RuInput value={text} onChangeText={setText} editable={!answered} onSubmit={check}
               testID="type-input" />
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

/* What the bulb has to show for this question.
 *
 * The tables are the word's own — every one of them, so a verb's present, past
 * and imperative all arrive together, which is the "answer key for that verb"
 * the owner asked for. The one cell the question is asking for is blanked
 * (`q.at`, set by the generator), so the sheet is a reference rather than the
 * answer with extra steps.
 *
 * A word is only safe to show at all when it is already on screen. Where the
 * Russian word *is* what the learner has to produce — a typed vocabulary
 * answer, a stress question, anything heard and written back — there is no
 * bulb, because the reference would be the answer. `q.cyr` marks a question
 * whose prompt is the Russian word itself. */
/* What the bulb shows: everything the app knows about the word in the
 * question, with nothing held back.
 *
 * It used to hide the answer — the asked cell blanked, any cell repeating it
 * blanked, a rule example containing it dropped — and the owner reversed that
 * on 2026-09-28: *"Remove that filtering… everything should be referenceable.
 * This isn't a quiz for grade, it's for learning so they should be allowed to
 * reference the correct answer."* He is right about what the thing is for; a
 * reference you have to outwit is not a reference. So `at` marks the asked
 * cell instead of emptying it, which is what a learner wanted from it anyway
 * — "which row am I being asked about" — and every kind of question gets a
 * bulb, not the four whose answer happened to be safe to show.
 *
 * **Opening it still grades the answer Hard**, and that is not a punishment:
 * it is the only way the scheduler hears that the word was not recalled. The
 * cost is uniform across kinds now, because the facts can give the answer
 * away as readily as the table can — the aspect drill asks for a partner and
 * the facts name it.
 */
export function referenceFor(q) {
  const w = q.i !== undefined && q.i !== null ? L[q.i] : null;
  return {
    word: w,
    tables: (w && w.t) || [],
    facts: w ? wordFacts(w) : [],
    mark: q.table && q.at ? { table: q.table, at: q.at } : null,
    note: q.note || null,
    topic: topicFor(q.kind) || (w ? topicFor(w.p) : null),
  };
}

/* What the prompt can be read aloud as: the generator's own `say`, else a
   Russian prompt with no gap in it. Exported for the test. */
const CYR = /[Ѐ-ӿ]/;
export function promptSpeech(q) {
  if (q.say) return q.say;
  if (q.cyr && q.prompt && CYR.test(q.prompt) && !/_/.test(q.prompt)) return q.prompt;
  return null;
}

/* A chapter's grammar card under a verdict (§30al — the owner: *"the grammar
   tips can be feedback after an incorrect answer on a question featuring the
   grammar tip"*). `RuleCard` in rules.js is the one renderer; this name is
   kept because the verdict, the reference sheet and the lesson's teaching step
   all reach for it and the tests name it. */
export function RuleNote({ note, testID }) {
  return <RuleCard note={note} testID={testID} />;
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
           onPick={(i, o) => { r.setPicked(i); r.record(!!o.right, undefined, undefined, { said: o.label }); }} />
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
  type: (q, r) => <Typed q={q} answered={r.answered} onAnswer={r.record} />,
  // The chapter's form: chosen from the paradigm early, typed later — the
  // question says which (core/questions.js FORM_MIX).
  form: eitherWay,
  match: (q, r) => <Match q={q} onDone={(ok, idxs, credit, note) => r.record(ok, idxs, undefined, { credit, note })} />,
  hear: (q, r) => <Hear q={q} r={r} />,
  say: (q, r) => <Say q={q} r={r} />,
  scene: (q, r) => <Scene q={q} r={r} />,
  // The pronunciation drill: hear a contrast, then produce it (P10.8).
  "pair-hear": (q, r) => <PairHear q={q} r={r} />,
  "pair-say": (q, r) => <PairSay q={q} r={r} />,
  // Hear a sentence and say it straight back (P10.6).
  shadow: (q, r) => <Shadow q={q} r={r} />,
  // A long word built from its end, a syllable at a time (core/buildup.js).
  buildup: (q, r) => <Build q={q} r={r} />,
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
/* `tools`: a control beside the progress — the drill's cog (Flows.js). */
export function Runner({ title, steps, onFinish, gradeWords = true, progress, recycle = true,
                         allowBack = false, navigation, tools }) {
  const { st, update } = useSession();
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
  /* The reference sheet is a native Modal, which is a window of its own: it
     stays on top of whatever the stack shows next. A word link inside it
     opens that word's entry on the Root stack and leaves the drill mounted
     underneath, so without this the sheet floated over the entry it had just
     opened. Leaving the screen, however it is left, closes it. */
  useEffect(() => {
    if (!navigation || typeof navigation.addListener !== "function") return undefined;
    return navigation.addListener("blur", () => setHintOpen(false));
  }, [navigation]);
  // Why the answer was wrong, from the Worker: null (not asked), "pending",
  // or the text. Anything but the text draws nothing — the verdict stands alone.
  const [why, setWhy] = useState(null);
  /* The reference behind the two lines, open only if it is asked for (the
     owner, 2026-09-26: *"the user can click a box and get a little hint on
     the rules to address the thing being drilled"*). Collapsed it costs a
     line; open it teaches the pattern rather than fixing the one word. */
  const [ruleOpen, setRuleOpen] = useState(false);
  const results = useRef([]);
  const tally = useRef({ right: 0, wrong: 0, helped: 0, skipped: 0, credit: 0 });
  const sayTimer = useRef(null);
  const atRef = useRef(0);
  const alive = useRef(true);

  const q = queue[at];
  guard.current = at > 0 && !finished.current;
  /* What the bulb has behind it for this question. Reading it always counts
     as a hint — see referenceFor. */
  const ref = q ? referenceFor(q) : { tables: [], facts: [], note: null, topic: null };
  const qWord = ref.word;
  const words = useWords();
  /* The explanation a miss gets when the model gives none (core/explain.js):
     computed once the answer is in and only for a miss. */
  const standard = verdict && verdict.right === false && q ? standardExplanation(q, qWord) : null;
  const irregular = !!(qWord && isIrregular(qWord));

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
    const said = extra && extra.said !== undefined ? extra.said : null;
    setAnswered(true);
    setVerdict({ right: !!correct, credit, note, said });

    /* A miss is explained, and remembered (2026-09-26). The explanation is the
       Worker's and arrives under the verdict when it does — a failure of any
       kind leaves the verdict exactly as drawn, the rule Say follows for its
       online feedback. The miss itself goes to the profile whatever happens,
       for the tutor to draw on; a recycled question is not recorded twice. */
    if (!correct && EXPLAIN_KINDS.includes(q.kind)) {
      const miss = missOf(q, said);
      if (!q.retry) {
        update((prev) => ({ ...prev, misses: [miss].concat(prev.misses || []).slice(0, MISSES_KEPT) }));
      }
      if (st.explain !== false && workerConfig("/v1/explain")) {
        setWhy("pending");
        const mine = at;
        askWhy({ kind: q.kind, ask: q.ask, prompt: q.prompt, sub: q.sub, answer: miss.answer, said,
                 rule: q.note ? q.note.title : null }).then((reply) => {
          if (!alive.current || atRef.current !== mine) return;
          setWhy(reply && reply.ok === true && reply.why
            ? { why: reply.why, yours: reply.yours || "", rule: reply.rule || "" } : null);
        });
      }
    }

    /* The verdict reaches three senses at once, and the buzz is the one that
       arrives first — a learner with the volume down has only this and the
       colour. It is fired beside the cue rather than inside it because a cue
       is a sound and this is not one. */
    (correct ? buzzRight : buzzWrong)();
    cue(correct ? "right" : "wrong");
    // The right form, just behind the cue so the two do not talk over each
    // other. On every answer, not only a correct one (the owner, 2026-09-23:
    // "the user is always hearing the words to help build the association")
    // — a learner who got it wrong is the one who most needs to hear it, and
    // the verdict carries a speaker to hear it again.
    {
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
        const dir = directionOfKind(q.kind), now = Date.now();
        // The log rows are built here, from the cards as they stand, and
        // handed in beside the update — never from inside it (session.js).
        const list = entries.map((e) => (typeof e === "number" ? { i: e, grade: g } : { i: e.i, grade: e.grade }))
          .filter((e) => typeof e.i === "number" && L[e.i])
          .map((e) => ({ word: L[e.i].b, direction: dir, grade: e.grade }));
        const rows = reviewRows(st.seen, list, now, q.kind, schedulerOpts(st));
        update((prev) => entries.reduce((acc, e) => (
          typeof e === "number" ? gradeInto(acc, e, g, dir, now) : gradeInto(acc, e.i, e.grade, dir, now)
        ), prev), rows);
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
    setWhy(null);
    setRuleOpen(false);
  };

  /* A step backwards, for a run where that is a sensible thing to want.
   *
   * Opt-in (`allowBack`) and nothing but the mouth drills passes it: in a quiz
   * this would be a way to re-answer a question already marked, and the mark is
   * the point. In a pronunciation drill there is no mark — the learner wants
   * the word before because they want to say it again, which is the method.
   * Nothing is un-tallied: a step already answered stays answered in the
   * record, and revisiting it cannot score twice (`q.retry` guards that). */
  const back = !allowBack || at === 0 ? undefined : () => {
    if (sayTimer.current) { clearTimeout(sayTimer.current); sayTimer.current = null; }
    setAt(at - 1);
    setAnswered(false);
    setVerdict(null);
    setPicked(null);
    setUsedHint(false);
    setWhy(null);
    setRuleOpen(false);
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
        {tools || null}
      </View>

      {/* The question takes the space above the answers rather than sitting on
          top of them.
       *
          Everything used to stack from the top, so on a one-word question the
          options finished halfway down and the bottom half of the screen was
          empty — and the word being *asked about* was the smallest thing on it,
          «в» at 30 px against option boxes of 54. Now the question is centred in
          whatever room is left and the answers sit low, where the thumb is.

          The question slides in from the right as the last one leaves. Eight
          questions with a hard cut between them read as one question whose
          words keep changing; this is what gives a quiz the sense of moving
          through something. */}
      {/* …and a question with no prompt has nothing to centre. The build-up
          drill's `ask` is a caption for the activity below it, not a question
          in its own right, so growing the block put one small grey line in the
          middle of the screen with the whole drill crammed under the fold and
          six hundred pixels of nothing between them. The slack goes to the
          activity instead (below), which is what the learner is looking at.
          Read off the walkthrough shots, 2026-09-16. */}
      {/* …and the slack goes **above** the question, not around it.
          `justifyContent: "center"` put the prompt in the middle of the block
          while the answers stayed pinned below it, so a short question and four
          short options sat five hundred pixels apart with nothing in between —
          the single loudest "unfinished" signal on the screen a learner spends
          most of their time on, and it survived three interface passes because
          nobody read a quiz shot (2026-09-17). A question and its answers are
          one thing and belong together; the breathing room belongs under the
          progress bar, where it reads as air rather than as a rift. */}
      <Animated.View testID="question-block"
                     style={[questionIn, { flexGrow: hasInput(q) || !q.prompt ? 0 : 1,
                                           justifyContent: "flex-end",
                                           alignItems: "center", marginBottom: 20 }]}>
        <Text style={{ color: t.ink3, fontSize: 12, fontWeight: "600", letterSpacing: 1,
                       textTransform: "uppercase", marginBottom: 12,
                       textAlign: "center" }}>
          {q.ask}
        </Text>
        {q.prompt ? (
          <Text style={{ color: t.ink, fontWeight: "600", textAlign: "center",
                         fontSize: promptSize(q), lineHeight: promptSize(q) + 8 }}>
            {q.prompt}
          </Text>
        ) : null}
        {q.sub ? <Muted style={{ marginTop: 6, textAlign: "center" }}>{q.sub}</Muted> : null}
        {/* Whatever Russian the question shows can be heard (the owner,
            2026-09-23). `say` where the generator named it; otherwise the
            prompt itself when it is Russian and whole — a gapped sentence
            («___ среда») is not a thing to read aloud. */}
        {/* The two things to do with the word on screen — hear it, look it up
            — in one row under it, rather than a speaker here and a text link
            adrift in the middle of the screen. */}
        {promptSpeech(q) || (!answered && hasReference(ref)) ? (
          <View style={{ marginTop: 12, flexDirection: "row", gap: 10, justifyContent: "center" }}>
            {promptSpeech(q) ? <Speaker text={promptSpeech(q)} /> : null}
            {!answered && hasReference(ref) ? (
              <BulbButton testID="bulb" on={hintOpen} label="Reference"
                          onPress={() => { setUsedHint(true); setHintOpen(true); }} />
            ) : null}
          </View>
        ) : null}
      </Animated.View>

      {q.hint && !answered ? (
        usedHint ? (
          <Muted testID="hint-text" style={{ marginBottom: 12, textAlign: "center", fontSize: 15 }}>
            {q.hint}
          </Muted>
        ) : (
          <Btn kind="ghost" label="Hint" style={{ marginBottom: 12 }}
               onPress={() => setUsedHint(true)} />
        )
      ) : null}

      {/* Keyed by position so a view is remounted for every step: two typed
          questions in a row otherwise share one input, and the second opens with
          the first's answer still in it. */}
      {/* A question with no prompt — shadowing, a listen-and-choose, the
          build-up — used to centre its activity in all the slack, which put a
          "Hear it again" button and a microphone in the middle of the screen
          with seven hundred pixels of nothing above them (the shadowing shot,
          2026-09-18: the same defect the prompt case had, pointing the other
          way — §30ah). One rule for both cases now: the caption at the top,
          the thing to touch in the lower half where the thumb is, the air in
          between. A first cut sent this case to the *top* instead, which put
          the two kinds of screen at opposite ends — read off the shots. */}
      <Animated.View key={at} testID="answer-block"
                     style={[answerIn, !q.prompt && !hasInput(q)
                       ? { flexGrow: 1, justifyContent: "flex-end", paddingBottom: 8 } : null]}>
        {VIEWS[q.kind] ? VIEWS[q.kind](q, { answered, picked, setPicked, record, skip, usedHint, back, next }) : null}
      </Animated.View>

      {answered ? (
        // At the foot of the screen, so Continue sits in the same place on every
        // question instead of wherever the options happened to end — the same
        // rule Flows.js and the web runner already follow. The gap lives on the
        // wrapper, not the card.
        //
        // `paddingTop`, not `marginTop: "auto"`: the question block above now
        // carries flexGrow and takes the slack, so the verdict is already at the
        // foot and an auto margin would have nothing left to push against.
        <Animated.View testID="verdict" style={[verdictIn, { paddingTop: 18 }]}>
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
              {/* The answer card says when the word breaks the rules
                  (2026-09-29), right or wrong — it is worth knowing either way. */}
              {right !== null && irregular ? <Pill tone="irregular" testID="verdict-irregular">Irregular</Pill> : null}
            </View>
            {verdict && verdict.note ? (
              <Text style={{ color: t.ink2, marginTop: 4, fontSize: 15 }}>{verdict.note}</Text>
            ) : null}
            {right === false && (answer || q.answer) ? (
              <Text style={{ color: t.ink2, marginTop: 4, fontSize: 15 }}>
                {`Answer: ${answer ? answer.label : q.answer}`}
              </Text>
            ) : null}
            {/* Hear the right form again, whatever the verdict. It was read
                out as the verdict landed; this is the button for once more. */}
            {right !== null && answerAudioText(q, answer) ? (
              <View testID="verdict-speaker" style={{ marginTop: 8, alignSelf: "flex-start" }}>
                <Speaker text={answerAudioText(q, answer)} size={36} />
              </View>
            ) : null}
            {/* Why, when the Worker has one: two short lines, the Russian in
                them set apart (ui.js `Marked`). A spinner while it is on its
                way, and the chapter's rule card below **only if it does not
                come** — the two together were the "large ugly verbose block"
                the owner read on his phone (2026-09-26). The explanation is
                about the word just missed and the card is the rule in
                general, so where there is an explanation the card is the
                thing to cut. */}
            {right === false && why === "pending" ? (
              <ActivityIndicator testID="why-pending" color={t.ink3}
                                 style={{ alignSelf: "flex-start", marginTop: 12 }} />
            ) : right === false && why ? (
              <View testID="why" style={{ marginTop: 12, paddingTop: 12,
                                          borderTopWidth: 1, borderTopColor: t.line }}>
                <Note testID="why-line" text={why.why} />
                {why.yours ? (
                  <Marked testID="why-yours" text={why.yours} size={T.small} color={t.ink3}
                          italic style={{ marginTop: 6 }} />
                ) : null}
                {/* The reference, behind a tap. Two short lines stay two
                    short lines for whoever does not want it. */}
                {why.rule ? (
                  ruleOpen ? (
                    <View testID="why-rule" style={{ marginTop: 10, padding: 12, borderRadius: radius.md,
                                                     backgroundColor: t.surface2 }}>
                      <Note text={why.rule} size={T.small + 1} color={t.ink2} />
                    </View>
                  ) : (
                    <Btn kind="link" testID="why-rule-open" label="The rule"
                         style={{ marginTop: 6, alignSelf: "flex-start" }}
                         onPress={() => setRuleOpen(true)} />
                  )
                ) : null}
              </View>
            ) : right === false && standard ? (
              /* Without the model — no Worker in this build, the setting off,
                 the day's allowance spent, no connection — a miss still gets
                 the whole answer: which form it is, what decides it, and the
                 rule and the entry to read it in (core/explain.js). */
              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.line }}>
                <StandardWhy ex={standard}
                             onRule={navigation ? (r) => navigation.navigate("Grammar", { topic: r.topic, section: r.heading }) : null}
                             onWord={qWord && words ? () => words.openFull(q.i) : null} />
              </View>
            ) : right === false && q.note ? (
              /* A kind with nothing to derive from (no word behind it): the
                 chapter's rule card, as before. A rule read at the moment it
                 was broken is a rule that sticks (§30al). */
              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.line }}>
                <RuleNote note={q.note} testID="rule-note" />
              </View>
            ) : null}
            {/* A gap-fill gives the sentence back whole, every word a link, and
                names the form that filled it. */}
            {right !== null && q.reveal ? (
              <View style={{ marginTop: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <View style={{ flex: 1 }}><Linked text={q.reveal} size={17} /></View>
                  <Speaker text={q.reveal} size={32} />
                </View>
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

      {hintOpen ? (
        <Reference
          title={ref.word ? ref.word.w : null}
          sub={ref.word ? firstSense(ref.word) : null}
          tables={ref.tables} mark={ref.mark} facts={ref.facts}
          note={ref.note} topic={ref.topic}
          onTopic={(id) => navigation.navigate("Grammar", { topic: id })}
          onClose={() => setHintOpen(false)} />
      ) : null}
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
  /* Only a real pass. Half a dozen screens reuse `Done` as an empty-state
     message box and those pass no `passed` at all — a phone that buzzed to
     announce "no questions available" would be celebrating a dead end. */
  useEffect(() => { if (passed === true) buzzDone(); }, [passed]);
  /* The end of a run is the one moment on the whole route that is a reward, and
     it was a panel at the top of an empty screen — the same bordered white box
     the verdict, the word card and the settings rows are, with three quarters of
     the screen blank underneath it. There is nothing here to group against, so
     there is nothing for a container to say. The result takes the middle of the
     screen and the actions sit at the foot of it, where a thumb is (§25). */
  return (
    <Screen fill>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center",
                     paddingHorizontal: 16, paddingVertical: 24 }}>
        {kind ? (
          <GuidePop pose={poseFor(kind)} size={108} style={{ marginBottom: 10 }} />
        ) : null}
        {isNotebook() && score !== undefined ? (
          /* The UI test skin (skin.js): the result as a Russian teacher
             writes it — a mark out of five in red pen, circled by hand, with
             the percentage small beneath in pencil. */
          <Animated.View testID="grade" style={[pop, { alignItems: "center", marginBottom: 16 }]}>
            <View style={{ width: 120, height: 110, alignItems: "center", justifyContent: "center",
                           transform: [{ rotate: "-7deg" }] }}>
              <Svg width={120} height={110} style={{ position: "absolute" }}>
                <Path d="M62 8 C 100 6, 116 34, 110 60 C 104 92, 70 104, 44 98 C 16 92, 4 64, 12 38 C 18 18, 40 6, 70 9"
                      stroke={t.pen} strokeWidth={3} fill="none" strokeLinecap="round" />
              </Svg>
              <Text style={{ color: t.pen, fontFamily: notebookFont.hand, fontSize: 76, lineHeight: 84 }}>
                {String(markOutOfFive(score / 100))}
              </Text>
            </View>
            <Muted>{`${score}%`}</Muted>
          </Animated.View>
        ) : (
        <Animated.View
          style={[pop, { width: 104, height: 104, borderRadius: 52, marginBottom: 20,
                         alignItems: "center", justifyContent: "center",
                         backgroundColor: tone.bg }]}>
          <Text style={{ color: tone.fg, fontSize: 30, fontWeight: "800",
                         letterSpacing: -0.5 }}>
            {score !== undefined ? `${score}%` : "✓"}
          </Text>
        </Animated.View>
        )}
        <Text style={{ color: t.ink, fontSize: T.title, fontWeight: "700",
                       textAlign: "center", letterSpacing: -0.3 }}>{title}</Text>
        {detail ? <Muted style={{ marginTop: 8, textAlign: "center" }}>{detail}</Muted> : null}
        {line ? (
          <Muted testID="done-line" style={{ marginTop: 12, textAlign: "center", fontStyle: "italic" }}>
            {line}
          </Muted>
        ) : null}
      </View>
      {forward ? (
        <Btn kind="pri" label={onContinue ? (continueLabel || "Continue") : "Done"}
             onPress={onContinue || onBack} />
      ) : null}
      {onAgain ? (
        <Btn kind={forward ? "ghost" : "pri"} label={againLabel || "Again"}
             style={{ marginTop: 8 }} onPress={onAgain} />
      ) : null}
      {!forward || onContinue ? (
        <Btn kind="ghost" label="Back" style={{ marginTop: 8 }} onPress={onBack} />
      ) : null}
    </Screen>
  );
}
