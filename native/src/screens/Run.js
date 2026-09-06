/* The exercise runner.
 *
 * One component drives every kind of question set — vocabulary, lesson quiz, the six
 * drills, the placement test and a section test-out. They differ in what generates the
 * steps and what happens at the end, not in how a question is asked, so those are the
 * only two things a caller supplies.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Modal } from "react-native";
import { useSession } from "../session";
import { useTheme, radius } from "../theme";
import { Screen, Card, Btn, Bar, Pill, Speaker, Muted, List, Row } from "../ui";
import { say, cue, answerAudioText, stop as stopAudio } from "../audio";
import { Linked } from "../words";
import { Hear } from "../activities/Hear";
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
  const t = useTheme();
  return (
    <View style={{ gap: 9 }}>
      {q.options.map((o, i) => {
        const isPicked = picked === i;
        const show = answered && (o.right || isPicked);
        const border = !show ? t.line : o.right ? t.good : t.bad;
        const bg = !show ? t.surface : o.right ? t.goodBg : t.badBg;
        return (
          <Pressable
            key={i}
            disabled={answered}
            onPress={() => onPick(i, o)}
            style={({ pressed }) => ({
              backgroundColor: bg, borderColor: border, borderWidth: 1,
              borderBottomWidth: pressed ? 1 : 3, borderRadius: radius.md,
              paddingVertical: 15, paddingHorizontal: 16, minHeight: 54,
              justifyContent: "center",
            })}
          >
            <Text style={{ color: t.ink, fontSize: 16 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Typed({ q, answered, onAnswer }) {
  const t = useTheme();
  const [text, setText] = useState("");
  const check = () => {
    if (answered) return;
    const given = fold(text);
    onAnswer(given === fold(q.target) || translit(given) === fold(q.target));
  };
  return (
    <View>
      <TextInput
        value={text}
        onChangeText={setText}
        editable={!answered}
        placeholder="Cyrillic or Latin"
        placeholderTextColor={t.ink3}
        autoCorrect={false}
        autoCapitalize="none"
        onSubmitEditing={check}
        style={{ backgroundColor: t.surface, borderColor: t.line, borderWidth: 1,
                 borderBottomWidth: 3, borderRadius: radius.md, paddingHorizontal: 14,
                 paddingVertical: 13, fontSize: 20, color: t.ink }}
      />
      <Muted style={{ marginTop: 8 }}>
        {`Latin spelling works — “${translitBack(q.target)}”.`}
      </Muted>
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
      if (next.length === q.pairs.length) onDone(missed.current === 0, q.pairs.map((p) => p.i));
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
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)",
                     justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: t.bg, borderTopLeftRadius: radius.lg,
                       borderTopRightRadius: radius.lg, padding: 16, maxHeight: "85%" }}>
          <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: t.line,
                         alignSelf: "center", marginBottom: 14 }} />
          <ScrollView>
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
          </ScrollView>
          <Btn kind="pri" label="Got it" style={{ marginTop: 14 }} onPress={onClose} />
        </View>
      </View>
    </Modal>
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
   { answered, picked, setPicked, record } — record(correct, words, grade) being
   how any view reports a result. `words` is a list of lemma indices sharing one
   grade, or of { i, grade } pairs when the view scored each word itself, as the
   speech activities do. */
const asOptions = (q, r) => (
  <Options q={q} answered={r.answered} picked={r.picked}
           onPick={(i, o) => { r.setPicked(i); r.record(!!o.right); }} />
);

export const VIEWS = {
  "choose-en": asOptions,
  "choose-ru": asOptions,
  listen: asOptions,
  cloze: asOptions,
  cases: asOptions,
  aspect: asOptions,
  agreement: asOptions,
  conjugation: asOptions,
  stress: asOptions,
  grammar: asOptions,
  type: (q, r) => <Typed q={q} answered={r.answered} onAnswer={r.record} />,
  match: (q, r) => <Match q={q} onDone={(ok, idxs) => r.record(ok, idxs)} />,
  hear: (q, r) => <Hear q={q} r={r} />,
};

/* ------------------------------------------------------------------ runner */

export function Runner({ title, steps, onFinish, gradeWords = true }) {
  const { update } = useSession();
  const t = useTheme();
  const [at, setAt] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [right, setRight] = useState(null);
  const [picked, setPicked] = useState(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [usedHint, setUsedHint] = useState(false);
  const results = useRef([]);
  const tally = useRef({ right: 0, wrong: 0, helped: 0 });
  const sayTimer = useRef(null);

  const q = steps[at];

  useEffect(() => {
    if (q && q.autoplay) say(q.autoplay);
  }, [at]);

  // A pending answer reading must not outlive the screen, or the word arrives
  // over the top of whatever the learner moved on to.
  useEffect(() => () => {
    if (sayTimer.current) clearTimeout(sayTimer.current);
    stopAudio();
  }, []);

  if (!q) return null;

  /* `grade` lets an activity that scores itself hand in 1–4 directly. Without it, the
     answer's right/wrong and whether the table was used decide, as before. An entry
     of `words` that is { i, grade } carries its own grade instead. */
  const record = (correct, words, grade) => {
    setAnswered(true);
    setRight(correct);

    cue(correct ? "right" : "wrong");
    // The word itself, just behind the cue so the two do not talk over each
    // other. Only on a correct answer: hearing the right form is the reward,
    // and it is also the moment the learner is listening for it.
    if (correct) {
      const opt = q.options ? q.options.find((o) => o.right) : null;
      const text = answerAudioText(q, opt);
      if (text) {
        if (sayTimer.current) clearTimeout(sayTimer.current);
        sayTimer.current = setTimeout(() => say(text), 420);
      }
    }

    if (correct) tally.current.right += 1; else tally.current.wrong += 1;
    if (usedHint) tally.current.helped += 1;
    results.current.push({ right: correct, stage: q.stage, lesson: q.lesson, i: q.i });
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

  const next = () => {
    // Moving on cancels a reading that has not started yet.
    if (sayTimer.current) { clearTimeout(sayTimer.current); sayTimer.current = null; }
    if (at + 1 >= steps.length) {
      onFinish({ ...tally.current, total: steps.length, results: results.current });
      return;
    }
    setAt(at + 1);
    setAnswered(false);
    setRight(null);
    setPicked(null);
    setUsedHint(false);
  };

  const answer = q.options ? q.options.find((o) => o.right) : null;

  return (
    <Screen fill>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12,
                     marginBottom: 16 }}>
        <View style={{ flex: 1 }}><Bar value={at / steps.length} /></View>
        <Pill tone="brand">{`${at + 1}/${steps.length}`}</Pill>
      </View>

      <View style={{ alignItems: "center", marginBottom: 20 }}>
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
      </View>

      {(q.table || q.note) && !answered ? (
        <Btn
          label={usedHint ? "Table used" : "Show the table"}
          disabled={usedHint}
          style={{ marginBottom: 12 }}
          onPress={() => { setUsedHint(true); setHintOpen(true); }}
        />
      ) : null}

      {VIEWS[q.kind] ? VIEWS[q.kind](q, { answered, picked, setPicked, record }) : null}

      {answered ? (
        // Anchored to the foot of the screen against Screen's flexGrow, so Continue
        // sits in the same place on every question instead of wherever the options
        // happened to end — the same rule Flows.js and the web runner already follow.
        // The gap lives on the wrapper, not the card.
        <View testID="verdict" style={{ marginTop: "auto", paddingTop: 18 }}>
          <Card style={{ backgroundColor: right ? t.goodBg : t.badBg,
                         borderColor: right ? t.good : t.bad }}>
            <Text style={{ color: t.ink, fontWeight: "700", fontSize: 16 }}>
              {right ? "Correct" : "Not quite"}
            </Text>
            {!right && (answer || q.answer) ? (
              <Text style={{ color: t.ink2, marginTop: 4, fontSize: 15 }}>
                {`Answer: ${answer ? answer.label : q.answer}`}
              </Text>
            ) : null}
            <Btn kind={right ? "good" : "bad"} label="Continue"
                 style={{ marginTop: 12 }} onPress={next} />
          </Card>
        </View>
      ) : null}

      {hintOpen ? <HintSheet q={q} onClose={() => setHintOpen(false)} /> : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------ done */

export function Done({ title, detail, score, passed, onAgain, onBack, againLabel }) {
  const t = useTheme();
  const tone = passed === false ? { bg: t.badBg, fg: t.bad }
             : passed === true ? { bg: t.goodBg, fg: t.good }
             : { bg: t.brandBg, fg: t.brandInk };
  return (
    <Screen>
      <Card style={{ alignItems: "center", paddingVertical: 30 }}>
        <View style={{ width: 76, height: 76, borderRadius: 38, marginBottom: 14,
                       alignItems: "center", justifyContent: "center",
                       backgroundColor: tone.bg }}>
          <Text style={{ color: tone.fg, fontSize: 22, fontWeight: "700" }}>
            {score !== undefined ? `${score}%` : "✓"}
          </Text>
        </View>
        <Text style={{ color: t.ink, fontSize: 16, fontWeight: "600" }}>{title}</Text>
        {detail ? <Muted style={{ marginTop: 6, textAlign: "center" }}>{detail}</Muted> : null}
      </Card>
      {onAgain ? (
        <Btn kind="pri" label={againLabel || "Again"} style={{ marginTop: 16 }}
             onPress={onAgain} />
      ) : null}
      <Btn kind="ghost" label="Back" style={{ marginTop: 8 }} onPress={onBack} />
    </Screen>
  );
}
