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
import { markOutOfFive } from "../appearance";
import { Screen, Card, Btn, Bar, Pill, Speaker, Muted, Sheet, Lift, Text, Marked, Note,
         BulbButton } from "../ui";
import { RunTools } from "../askai";
import { Reference, hasReference, IrregularTag } from "../rules";
import { isIrregular } from "@core/facts";
import { GuidePop } from "../guide";
import { saveRun, clearRun, savedRun } from "../resume";
import { RunCard } from "../resumesheet";
import { useEnter, usePop, useSwap, usePress } from "../motion";
import { guideLine, poseFor, reactionFor, LINES } from "@core/guide";
import { say, cue, answerAudioText, stop as stopAudio, whenIdle } from "../audio";
import { right as buzzRight, wrong as buzzWrong, done as buzzDone } from "../haptics";
import { RuInput } from "../keyboard";
import { charDistance } from "@core/compare";
import { Linked } from "../words";
import { useAbout, describe } from "../about";
import { Hear } from "../activities/Hear";
import { Say } from "../activities/Say";
import { Scene } from "../activities/Scene";
import { PairHear, PairSay } from "../activities/Pair";
import { Shadow } from "../activities/Shadow";
import { Build } from "../activities/Build";
import { L, UN, lessonWords, markComponent, PASS_MARK } from "../data";
import { gradeFor, applyGrade, reviewRows, directionOfKind, schedulerOpts, gradesCard } from "@core/scheduler";
import { fold, firstSense } from "@core/util";

/* The row of round tools under a question — speaker, bulb, Teddy, flag. */
export const TOOL_SIZE = 48;
const TOOL_GAP = 20;
/* The right answer under a verdict: the largest thing on the card. */
const ANSWER_SIZE = 26;

/* The kinds whose miss the profile keeps for the tutor: one right answer, one
   thing the learner put instead. The speaking and listening activities carry their
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
           said: said === undefined || said === null ? null : String(said), at: Date.now(),
           // The word the question was about, as its string (rule 20.4), for
           // the day's recap to ask again.
           w: typeof q.i === "number" && L[q.i] ? L[q.i].b : null };
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
          {/* A short Russian answer is the thing being read, so it takes the
              title size: «в» and «вы» at body size sat lost in a full-width box
              under a larger English prompt (the walkthrough, 2026-09-30).
              English options and sentences stay at body size. */}
          <Text style={{ color: t.ink, fontSize: o.cyr && centred ? T.title : 16, fontWeight: "600",
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
    /* An empty box is a stray tap on Check or the keyboard's Enter, not an
       answer: marking it wrong would cost the word a lapse for nothing. */
    if (!typed) return;
    const want = fold(q.target);
    // Another word of the pool with the same meaning is right too: "jacket"
    // is «пиджак» and «куртка», and the prompt did not say which.
    // `said` rides on every verdict: what was put is what an explanation of
    // the miss is about (EXPLAIN_KINDS), and what the profile keeps for the tutor.
    if (typed === want) return onAnswer(true, undefined, undefined, { said: text });
    /* Another right answer is read back as itself: «где» accepted for "where"
       and then «куда» spoken was the app correcting a right answer (the
       owner, 2026-10-05). */
    if ((q.alts || []).includes(typed)) return onAnswer(true, undefined, undefined, { said: text, as: text.trim() });
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
        // Greyed until something is typed, as in Hear: a press that does
        // nothing reads as a frozen screen.
        <Btn block kind="pri" label="Check" style={{ marginTop: 12 }} onPress={check} disabled={!fold(text)} />
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
 * it is the only way the scheduler hears that the word was not recalled.
 *
 * **It is the word's tables and nothing else** (the owner, 2026-10-08:
 * *"Remove random grammar tips from the hint area. Just show the reference
 * conjugation chart. The rest is too busy"*). The facts, the chapter's card
 * and the link to the topic went; a word with no table gets no bulb. The rule
 * still comes under a wrong answer, and the facts on the word's entry.
 */
export function referenceFor(q) {
  const w = q.i !== undefined && q.i !== null ? L[q.i] : null;
  return {
    word: w,
    tables: (w && w.t) || [],
    mark: q.table && q.at ? { table: q.table, at: q.at } : null,
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
  // What a video said, in English, four options (VideoQuiz in Misc.js).
  video: asOptions,
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
/* `tools`: a control beside the progress — the drill's cog (Flows.js).

   `save`: `{ key, route, params, title }` keeps the run as it goes (resume.js),
   after every answer, so it can be picked up where it was left; finishing
   clears it. `restore` is such a saved run to start from instead of `steps`. */
export function Runner({ title, steps, onFinish, gradeWords = true, progress, recycle = true,
                         allowBack = false, stepBack = false, navigation, tools, save, restore, onAnswered }) {
  const { st, update } = useSession();
  const t = useTheme();
  /* A saved run is only started from while it is still saved: once that run
     finishes it is cleared, so a retake mounting with the same prop deals
     afresh rather than replaying a finished run. */
  const from = useRef(restore && save && savedRun(save.key) ? restore : null).current;
  const [queue, setQueue] = useState(() => (from ? from.queue : steps.slice()));
  const [at, setAt] = useState(() => (from ? from.at : 0));
  const finished = useRef(false);
  // What the mark is out of: the deck as first dealt, before any recycling.
  const total = from ? from.total : steps.length;

  /* The back arrow sits a thumb's width from Home, and one mis-tap used to throw
     a ten-minute placement away without a word. With `navigation` given, a run
     that has started and not finished asks first. Grades already written stay
     written; only the mark is lost. */
  const guard = useRef(false);
  useEffect(() => {
    if (!navigation || typeof navigation.addListener !== "function") return undefined;
    return navigation.addListener("beforeRemove", (e) => {
      /* In a lesson's quiz, Back is the question before, not the way out (the
         owner, 2026-10-02). From the first question it leaves as before. */
      const type = e.data && e.data.action && e.data.action.type;
      if (stepBack && atRef.current > 0 && !finished.current && (type === "GO_BACK" || type === "POP")) {
        e.preventDefault();
        stepBackRef.current();
        return;
      }
      if (!guard.current) return;
      e.preventDefault();
      /* Every run comes through here — drills and the mouth drills carry no
         mark — so it names neither a quiz nor a mark. */
      Alert.alert("Leave now?", "What you have answered is kept.",
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
  const results = useRef(from ? from.results : []);
  const tally = useRef(from ? { ...from.tally }
    : { right: 0, wrong: 0, helped: 0, skipped: 0, credit: 0 });
  const sayTimer = useRef(null);
  const atRef = useRef(0);
  const alive = useRef(true);
  /* How far the run has been: a question before this was answered and marked
     already, so one stepped back to (`stepBack`) is practice — it can be
     answered again, and nothing is tallied or graded a second time. */
  const reached = useRef(from ? from.at : 0);
  const revisit = at < reached.current;
  const stepBackRef = useRef(() => {});

  const q = queue[at];
  guard.current = at > 0 && !finished.current;
  /* What the bulb has behind it for this question. Reading it always counts
     as a hint — see referenceFor. */
  const ref = q ? referenceFor(q) : { tables: [] };
  const qWord = ref.word;
  /* For a tester's report: this question, and what they answered if they
     have (about.js). */
  useAbout(q ? { ...describe(q), run: title, step: `${at + 1} of ${queue.length}`,
                 said: verdict && typeof verdict.said === "string" ? verdict.said : undefined,
                 right: verdict ? verdict.right : undefined } : null);
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

  /* The run as it stands once this answer is in, kept for picking up again.
     It is saved pointing at the *next* question: the grade for this one is
     already in the scheduler, and resuming on it would grade it twice. The
     last answer saves nothing new — Continue on it finishes the run. */
  const keep = (deck) => {
    if (onAnswered) onAnswered();
    if (!save) return;
    /* The last answer: its grade is in, and a run saved pointing at it would
       ask it again on resume (the review, 2026-10-02). Only the mark is lost. */
    if (at + 1 >= deck.length) { clearRun(save.key); return; }
    saveRun(save.key, { route: save.route, params: save.params, title: save.title,
                        queue: deck, at: at + 1, total,
                        tally: { ...tally.current }, results: results.current.slice() });
  };

  /* `grade` lets an activity that scores itself hand in 1–4 directly. Without it, the
     answer's right/wrong and whether the table was used decide, as before. An entry
     of `words` that is { i, grade } carries its own grade instead. `extra.credit`
     (0–1, default 1 or 0 from `correct`) is partial credit for the score, with
     `extra.note` saying why ("3 of 4 words"). */
  const record = (correct, words, grade, extra) => {
    if (revisit) {
      const c = extra && typeof extra.credit === "number" ? extra.credit : (correct ? 1 : 0);
      setAnswered(true);
      setVerdict({ right: !!correct, credit: c, note: extra && extra.note ? extra.note : null,
                   said: extra && extra.said !== undefined ? extra.said : null });
      (correct ? buzzRight : buzzWrong)();
      cue(correct ? "right" : "wrong");
      return;
    }
    const credit = extra && typeof extra.credit === "number"
      ? Math.max(0, Math.min(1, extra.credit)) : (correct ? 1 : 0);
    const note = extra && extra.note ? extra.note : null;
    const said = extra && extra.said !== undefined ? extra.said : null;
    // The right answer the learner gave, when it is not the one asked for.
    const as = correct && extra && extra.as ? extra.as : null;
    setAnswered(true);
    setVerdict({ right: !!correct, credit, note, said, as });

    /* A miss is remembered for the tutor to draw on (2026-09-26); a recycled
       question is not recorded twice. It is no longer explained unasked
       (2026-10-08) — the sparkle beside the question is where to ask. */
    if (!correct && EXPLAIN_KINDS.includes(q.kind) && !q.retry) {
      const miss = missOf(q, said);
      update((prev) => ({ ...prev, misses: [miss].concat(prev.misses || []).slice(0, MISSES_KEPT) }));
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
      const text = (correct && extra && extra.as) || answerAudioText(q, opt);
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
    // A word said aloud has had its retries in place (Build.js); sending it
    // round again would be a second test of the same mouth, not practice.
    const recycled = recycle && credit < 1 && !q.retry && !q.assess;
    if (recycled) setQueue((prev) => prev.concat([{ ...q, retry: true }]));
    keep(recycled ? queue.concat([{ ...q, retry: true }]) : queue);
    // A form drill grades no card: the card is the word's meaning (gradesCard).
    if (gradeWords && gradesCard(q.kind)) {
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
    if (revisit) return;
    if (!q.retry) {
      tally.current.skipped += 1;
      results.current.push({ skipped: true, stage: q.stage, lesson: q.lesson, i: q.i });
    }
    keep(queue);
  };

  const next = () => {
    // Moving on cancels a reading that has not started yet; one already playing
    // is left to finish — the next question's audio waits for it.
    if (sayTimer.current) { clearTimeout(sayTimer.current); sayTimer.current = null; }
    reached.current = Math.max(reached.current, at + 1);
    if (at + 1 >= queue.length) {
      finished.current = true;
      guard.current = false;
      if (save) clearRun(save.key);
      onFinish({ ...tally.current, total: total - tally.current.skipped,
                 results: results.current });
      return;
    }
    setAt(at + 1);
    setAnswered(false);
    setVerdict(null);
    setPicked(null);
    setUsedHint(false);
  };

  /* A step backwards, for a run where that is a sensible thing to want.
   *
   * Opt-in (`allowBack`) and nothing but the mouth drills passes it: in a quiz
   * this would be a way to re-answer a question already marked, and the mark is
   * the point. In a pronunciation drill there is no mark — the learner wants
   * the word before because they want to say it again, which is the method.
   * Nothing is un-tallied: a step already answered stays answered in the
   * record, and revisiting it cannot score or grade twice (`revisit`).
   *
   * A lesson's quiz reaches the same step through the header's Back
   * (`stepBack`, 2026-10-02): practice on the question before, never a second
   * mark. */
  const goBack = () => {
    if (sayTimer.current) { clearTimeout(sayTimer.current); sayTimer.current = null; }
    // Leaving an answered question behind: it counts as reached.
    if (answered) reached.current = Math.max(reached.current, at + 1);
    setAt(at - 1);
    setAnswered(false);
    setVerdict(null);
    setPicked(null);
    setUsedHint(false);
  };
  stepBackRef.current = goBack;
  const back = !allowBack || at === 0 ? undefined : goBack;

  const answer = q.options ? q.options.find((o) => o.right) : null;
  const right = verdict ? verdict.right : null;
  const partial = verdict && verdict.right === false && verdict.credit > 0;
  /* The right answer as the verdict shows it: the right answer the learner
     gave when it was another accepted one, else the one asked for. */
  const answerText = (verdict && verdict.as) || (answer ? answer.label : q.answer) || null;
  const answerSpeech = (verdict && verdict.as) || answerAudioText(q, answer);
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
      {/* …and then too low (the owner, 2026-10-09: "Lot of empty space up
          top… move the question up a little"): flush with the answers it left
          the top half of the screen empty. Centred in the room above them now,
          the slack split between above and below. */}
      <Animated.View testID="question-block"
                     style={[questionIn, { flexGrow: hasInput(q) || !q.prompt ? 0 : 1,
                                           justifyContent: "center",
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
        {/* …and, beside them, Teddy's help and the report flag (askai.js):
            asking about the question is part of the question, so it sits
            here rather than in the header (the owner, 2026-10-08). They stay
            after the answer, which is when "why?" is most often asked. */}
        {/* 48 dp and spaced wide (the owner, 2026-10-09: "too small. Make
            them larger and space them out a little bit more horizontally"). */}
        <View style={{ marginTop: 14, flexDirection: "row", gap: TOOL_GAP, justifyContent: "center" }}>
          {promptSpeech(q) ? <Speaker text={promptSpeech(q)} size={TOOL_SIZE} /> : null}
          {!answered && hasReference(ref) ? (
            <BulbButton testID="bulb" on={hintOpen} label="Reference" size={TOOL_SIZE}
                        onPress={() => { setUsedHint(true); setHintOpen(true); }} />
          ) : null}
          <RunTools size={TOOL_SIZE} />
        </View>
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
            {/* Teddy turns up for a clean answer and nowhere else in the runner.
                He is the reward, so he has to stay rare: on every verdict he
                would be wallpaper within one quiz, and on a wrong answer he
                would be a cartoon commiserating with someone who is trying to
                concentrate. */}
            {/* A heading for a right, partial or skipped answer. A wrong one
                has none: the colour says it, and the answer below is what
                matters (the owner, 2026-10-09: "Remove 'not quite' and make the
                correct answer larger"). */}
            {right !== false || partial ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                {right === true && !usedHint ? <GuidePop pose="cheer" size={40} /> : null}
                <Text style={{ color: t.ink, fontWeight: "700", fontSize: 16 }}>
                  {right === null ? "Skipped" : right ? "Correct" : "Almost"}
                </Text>
              </View>
            ) : null}
            {/* The right answer, large, with its speaker right beside it — not
                at the far end of a heading (the owner, 2026-10-09: "make sure
                the speaker button is aligned more with what is actually
                said"). Russian is a word link like everywhere else: one tap
                for the quick look, its More for the whole entry. That
                replaced a separate More button here (same day: "put its
                functionality into clicking the answer itself"). */}
            {right !== null && answerText ? (
              <View testID="verdict-answer" style={{ flexDirection: "row", alignItems: "center",
                                                     flexWrap: "wrap", gap: 10 }}>
                {/* An English answer ("book") cannot be tapped into a Russian
                    word, so the word it means comes first, linked: «книга — book». */}
                {CYR.test(answerText) ? (
                  <Linked text={answerText} size={ANSWER_SIZE} />
                ) : (
                  <>
                    {qWord ? <Linked text={qWord.w} size={ANSWER_SIZE} /> : null}
                    <Text style={{ color: qWord ? t.ink2 : t.ink, fontSize: qWord ? ANSWER_SIZE - 6 : ANSWER_SIZE,
                                   fontWeight: "700" }}>
                      {qWord ? `— ${answerText}` : answerText}
                    </Text>
                  </>
                )}
                {answerSpeech ? (
                  <View testID="verdict-speaker"><Speaker text={answerSpeech} size={40} /></View>
                ) : null}
                {/* The answer card says when the word breaks the rules
                    (2026-09-29), right or wrong. */}
                {irregular ? <IrregularTag word={qWord} testID="verdict-irregular" /> : null}
              </View>
            ) : null}
            {verdict && verdict.note ? (
              <Text style={{ color: t.ink2, marginTop: 4, fontSize: 15 }}>{verdict.note}</Text>
            ) : null}
            {/* The answer, its audio and More — nothing else (the owner,
                2026-10-08: "Remove the bloat in the pop-up. Don't need forced
                AI responses. Instead, just leave the answer, the audio, and
                the full entry"). The model's explanation, the derived one, the
                fact pills and the rule card all used to come under a miss;
                the sparkle beside the question asks Teddy when a learner
                wants the why. */}
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
            <Btn block kind={tone ? tone.btn : "plain"} label="Continue"
                 style={{ marginTop: 12 }} onPress={next} />
          </Card>
        </Animated.View>
      ) : null}

      {hintOpen ? (
        <Reference
          title={ref.word ? ref.word.w : null}
          sub={ref.word ? firstSense(ref.word) : null}
          tables={ref.tables} mark={ref.mark}
          aspect={ref.word ? ref.word.a : null}
          onClose={() => setHintOpen(false)} />
      ) : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------ done */

/* The kinds Done will let Teddy react to; anything else leaves him off. */
const GUIDE_KINDS = Object.keys(LINES);

/* The end of a run. The primary button points forward: after a pass it is
   Continue (or Done), and "Try again" drops to a ghost — it used to be the
   blue button whether the quiz was passed or failed, so passing read as an
   invitation to do it over (the interface review, 2026-09-08). */
/* Whether a flow starts fresh or from where it was left (resume.js). Returns
   `{ restore, prompt }`: while a saved run waits on the learner's choice,
   `prompt` is the screen to show instead of the runner. `params.resume`
   (from the prompt on the way back into the app) means the choice is made. */
/* `onRestart` is what "Start again" leads to before question 1 — a drill's
   options (the owner, 2026-10-04: "If the person says they don't want to
   continue, I'd expect it to prompt them for the question types prior to
   going to question 1"). */
export function useResume(key, params, { onRestart } = {}) {
  const [choice, setChoice] = useState(() => {
    const run = savedRun(key);
    if (!run) return { restore: null };
    return params && params.resume ? { restore: run } : { pending: run };
  });
  const prompt = choice.pending ? (
    <ResumePrompt run={choice.pending}
                  onContinue={() => setChoice({ restore: choice.pending })}
                  onRestart={() => { clearRun(key); setChoice({ restore: null }); if (onRestart) onRestart(); }} />
  ) : null;
  return { restore: choice.restore || null, prompt };
}

export function ResumePrompt({ run, onContinue, onRestart }) {
  return (
    <Screen fill>
      <View testID="resume-prompt"
            style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 }}>
        <GuidePop pose="wave" size={96} style={{ marginBottom: 14 }} />
        <Text style={{ fontSize: T.title, fontWeight: "700", textAlign: "center", marginBottom: 18 }}>
          Pick up where you left off
        </Text>
        <View style={{ alignSelf: "stretch" }}><RunCard run={run} /></View>
      </View>
      <View style={{ gap: 10 }}>
        <Btn block kind="pri" label="Continue" onPress={onContinue} />
        <Btn block kind="ghost" label="Start again" onPress={onRestart} />
      </View>
    </Screen>
  );
}

export function Done({ title, detail, score, passed, onAgain, onBack, againLabel, onContinue, continueLabel, guide }) {
  const t = useTheme();
  const tone = passed === false ? { bg: t.badBg, fg: t.bad }
             : passed === true ? { bg: t.goodBg, fg: t.good }
             : { bg: t.brandBg, fg: t.brandInk };
  const forward = passed !== false;
  /* `guide` is a kind from core/guide.js — "words", "passed", "scraped",
     "failed". It turns the end of a run from a tick over an apology into the one
     screen where Teddy has something to say, and it is opt-in so the half-dozen
     places that reuse Done as an empty-state message box stay plain. */
  const kind = guide && GUIDE_KINDS.includes(guide) ? guide : null;
  const line = kind ? guideLine(kind, (title || "").length) : null;
  /* Every scored run ends with Teddy's face for the score (the owner,
     2026-10-02: "for scored items, Teddy has… different reactions based on the
     score"); a run with no pass mark of its own is read against the lesson's. */
  const pose = score !== undefined
    ? reactionFor(score, passed === undefined ? score >= PASS_MARK : passed)
    : kind ? poseFor(kind) : null;
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
        {pose ? (
          <GuidePop pose={pose} size={108} style={{ marginBottom: 10 }} />
        ) : null}
        {/* Not on a failed run: a 3 is a pass mark in a Russian school. */}
        {score !== undefined && passed !== false ? (
          /* The result as a Russian teacher writes it — a mark out of five in
             red pen, circled by hand, with the percentage small beneath. */
          <Animated.View testID="grade" style={[pop, { alignItems: "center", marginBottom: 16 }]}>
            <View style={{ width: 120, height: 110, alignItems: "center", justifyContent: "center",
                           transform: [{ rotate: "-7deg" }] }}>
              <Svg width={120} height={110} style={{ position: "absolute" }}>
                <Path d="M62 8 C 100 6, 116 34, 110 60 C 104 92, 70 104, 44 98 C 16 92, 4 64, 12 38 C 18 18, 40 6, 70 9"
                      stroke={t.pen} strokeWidth={3} fill="none" strokeLinecap="round" />
              </Svg>
              <Text style={{ color: t.pen, fontSize: 58, lineHeight: 66, fontWeight: "700" }}>
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
      {/* With a way on, it is the one primary button whatever the score and
          trying again the quieter one beside it — no Back as well (the
          owner, 2026-10-06). A run that failed with nowhere to go offers the
          retry first and Back under it. */}
      {forward || onContinue ? (
        <Btn kind="pri" block testID="done-continue" label={onContinue ? (continueLabel || "Continue") : "Done"}
             onPress={onContinue || onBack} />
      ) : null}
      {onAgain ? (
        <Btn kind={forward || onContinue ? "plain" : "pri"} block testID="done-again" label={againLabel || "Again"}
             style={{ marginTop: 8 }} onPress={onAgain} />
      ) : null}
      {!forward && !onContinue ? (
        <Btn kind="ghost" label="Back" style={{ marginTop: 8 }} onPress={onBack} />
      ) : null}
    </Screen>
  );
}
