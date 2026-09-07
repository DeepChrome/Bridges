/* Talk — a short conversation in Russian on a topic (ROADMAP Phase 6).
 *
 * Three screens in one: the picker (a scenario per unit, open when the unit is,
 * with the day's sessions left), the exchange, and the summary. The tutor is the
 * Worker's /v1/talk route; the learner speaks through the same hold-to-speak as
 * Say (../speech.js). Every turn: the learner's words are graded against the
 * tutor's correction the way Say grades them — per lemma, into the scheduler,
 * with the tags counted — and any word the tutor used that the learner has not
 * studied is offered to pin for study.
 *
 * Tutor bubbles carry the Russian with every recognised word a dictionary link,
 * the English behind a tap, and a Speaker — which, having no recording, is the
 * device voice and says so (doctrine §27). Nothing here stores audio; the whole
 * exchange goes to the Worker each turn and the Worker keeps none of it.
 */

import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useSession } from "../session";
import { useTheme, radius, space } from "../theme";
import { Screen, Card, Btn, Pill, Muted, Speaker, List, Row, Thumb } from "../ui";
import { Linked } from "../words";
import { L, IX, UN, STAGES, stageDone, unitUnlocked, drillPool } from "../data";
import { talk as askTutor } from "../lib/feedback";
import { useRecognizer } from "../speech";
import { HoldButton, Feedback, Blocked } from "../activities/Say";
import { Alignment } from "../activities/Alignment";
import { SCENARIOS } from "@core/scenarios";
import { feedbackTags } from "@core/speech";
import { recordAttempt, talkAllowance, startTalkSession, TALK_TURNS } from "@core/state";
import { applyGrade } from "@core/fsrs";
import { fold, today } from "@core/util";

/* Talk unlocks once chapter 5's spine is done (ROADMAP P6.6), or in dev mode. */
export const TALK_UNLOCK_STAGE = 4;
export const talkUnlocked = (st) => !!st.dev || stageDone(st, STAGES[TALK_UNLOCK_STAGE]);

/* Which words to tell the tutor the learner knows: the words met, strongest
   first, topped up along the route — the same pool the drills use. */
const studiedFor = (st) => drillPool(st).map((i) => L[i].b).slice(0, 300);

/* Per-lemma grades from the tutor's word-by-word correction, the Say rule: right
   is Good, wrong or missing is Again, an extra word grades nothing. */
function gradeTurn(words) {
  const grade = {};
  for (const w of words || []) {
    if (!w.expected) continue;
    const hit = IX[fold(w.lemma || w.expected)] || IX[fold(w.expected)];
    if (!hit || !hit.length) continue;
    const g = w.status === "ok" ? 3 : 1;
    grade[hit[0]] = hit[0] in grade ? Math.min(grade[hit[0]], g) : g;
  }
  return Object.keys(grade).map((k) => ({ i: Number(k), grade: grade[k] }));
}

function TutorBubble({ turn }) {
  const t = useTheme();
  const [showEn, setShowEn] = useState(false);
  return (
    <View testID="tutor-bubble" style={{ alignSelf: "flex-start", maxWidth: "88%", marginBottom: 10 }}>
      <Pressable onPress={() => setShowEn(!showEn)} accessibilityRole="button"
                 accessibilityLabel={showEn ? "Hide the English" : "Show the English"}
                 style={{ backgroundColor: t.surface, borderColor: t.line, borderWidth: 1,
                          borderRadius: radius.lg, borderBottomLeftRadius: 4, padding: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <View style={{ flex: 1 }}><Linked text={turn.ru} size={17} /></View>
          <Speaker text={turn.ru} size={32} />
        </View>
        {showEn ? <Muted style={{ marginTop: 6 }}>{turn.en}</Muted> : null}
      </Pressable>
    </View>
  );
}

function LearnerBubble({ turn }) {
  const t = useTheme();
  return (
    <View testID="learner-bubble" style={{ alignSelf: "flex-end", maxWidth: "88%", marginBottom: 10 }}>
      <View style={{ backgroundColor: t.brandBg, borderColor: t.brand, borderWidth: 1,
                     borderRadius: radius.lg, borderBottomRightRadius: 4, padding: 12 }}>
        {turn.alignment ? (
          <Alignment alignment={turn.alignment} />
        ) : (
          <Text style={{ color: t.ink, fontSize: 17 }}>{turn.ru}</Text>
        )}
        {turn.pending ? <ActivityIndicator testID="turn-pending" color={t.ink3} style={{ alignSelf: "flex-start", marginTop: 6 }} /> : null}
        {turn.feedback ? <Feedback fb={turn.feedback} /> : null}
      </View>
    </View>
  );
}

/* A word the tutor used that the learner has not studied: offer it. */
function NewWord({ w, pinned, onPin }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.ink, fontSize: 16 }}>{w.lemma}</Text>
        <Muted>{w.en}</Muted>
      </View>
      {pinned ? <Pill tone="good">added</Pill>
        : <Btn kind="ghost" label="Add to study" onPress={() => onPin(w)} />}
    </View>
  );
}

export default function Talk({ navigation, route }) {
  const { st, update } = useSession();
  const t = useTheme();
  const day = today();
  const allowance = talkAllowance(st.speech, day);
  const [scenario, setScenario] = useState(null);
  const [turns, setTurns] = useState([]);           // { who, ru, en?, tokens?, alignment?, feedback?, pending? }
  const [newWords, setNewWords] = useState([]);     // offered across the session, by lemma
  const [ended, setEnded] = useState(false);
  const [failure, setFailure] = useState(null);     // the Worker could not answer
  const learnerTurns = turns.filter((x) => x.who === "learner" && !x.pending).length;
  const scrollRef = useRef(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const unit = scenario ? UN.find((u) => u.id === scenario.unit) : null;

  /* One round trip: the whole exchange plus the learner's latest words. */
  const ask = async (history, transcript) => {
    setFailure(null);
    const reply = await askTutor({
      scenario: scenario.prompt, topic: unit && unit.g ? unit.g.title : null,
      studied: studiedFor(st),
      history: history.map((x) => ({ who: x.who, ru: x.ru })),
      transcript,
    });
    if (!alive.current) return;
    if (!reply || reply.ok !== true) {
      setTurns((prev) => prev.map((x) => (x.pending ? { ...x, pending: false } : x)));
      setFailure(reply && reply.reason === "cap" ? "Today's conversations are used up."
        : reply && reply.reason === "offline" ? "No connection. Try again when you are online."
        : "The tutor could not answer. Try again.");
      return;
    }
    // The learner's turn, graded now that the tutor has read it.
    if (transcript && reply.feedback) {
      const words = reply.feedback.words || [];
      const alignment = words.map((w) => ({ said: w.said, expected: w.expected,
        status: w.status === "ins" ? "ins" : w.status }));
      const grades = gradeTurn(words);
      const tags = feedbackTags(reply.feedback);
      update((prev) => {
        let next = prev;
        for (const g of grades) {
          const r = applyGrade(next.seen, next.trouble, L[g.i].b, g.grade, day);
          next = { ...next, seen: r.seen, trouble: r.trouble };
        }
        return {
          ...next,
          speech: recordAttempt(next.speech, {
            ts: Date.now(), key: fold(transcript), kind: "talk", unit: scenario.unit,
            scenario: scenario.id, transcript, target: words.map((w) => w.expected || "").join(" ").trim(),
            wer: words.length ? words.filter((w) => w.status !== "ok").length / words.length : 0,
            tags, grade: reply.feedback.overall === "ok" ? 3 : 1,
          }),
        };
      });
      setTurns((prev) => prev.map((x) => (x.pending
        ? { ...x, pending: false, alignment: alignment.length ? alignment : null, feedback: reply.feedback }
        : x)));
    }
    setTurns((prev) => prev.concat([{ who: "tutor", ru: reply.reply_ru, en: reply.reply_en,
                                      tokens: reply.reply_tokens }]));
    if (reply.newWords && reply.newWords.length) {
      setNewWords((prev) => {
        const have = new Set(prev.map((w) => w.lemma));
        return prev.concat(reply.newWords.filter((w) => !have.has(w.lemma)));
      });
    }
  };

  /* A scenario can start when Talk is open, its unit is, and a session is left
     today. The row reads this to dim itself and start() checks it again: the guard
     lives with the action, not only in the control that offers it. */
  const canStart = (s) => {
    const u = UN.find((x) => x.id === s.unit);
    return talkUnlocked(st) && !!u && unitUnlocked(st, u) && allowance.left > 0;
  };
  const start = (s) => {
    if (!canStart(s)) return;
    update((prev) => ({ ...prev, speech: startTalkSession(prev.speech, day) }));
    setScenario(s);
    setTurns([]); setNewWords([]); setEnded(false);
    // The tutor opens; the effect below sends the empty first turn.
  };
  useEffect(() => {
    if (scenario && turns.length === 0 && !ended) ask([], "");
  }, [scenario]);

  const rec = useRecognizer({
    enabled: !!scenario && !ended && learnerTurns < TALK_TURNS && !turns.some((x) => x.pending),
    onFinal: (transcript) => {
      if (!transcript.trim()) return;
      const history = turns.concat([{ who: "learner", ru: transcript }]);
      setTurns((prev) => prev.concat([{ who: "learner", ru: transcript, pending: true }]));
      ask(history, transcript);
    },
  });

  const pin = (w) => {
    update((prev) => ({ ...prev, pinned: (prev.pinned || []).includes(w.lemma) ? prev.pinned
      : (prev.pinned || []).concat([w.lemma]) }));
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollToEnd({ animated: true });
  }, [turns.length]);

  /* ---- picker ---- */
  if (!scenario) {
    const open = talkUnlocked(st);
    return (
      <Screen>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginBottom: 14 }}>
          <Text style={{ color: t.ink, fontSize: 20, fontWeight: "700" }}>{allowance.left}</Text>
          <Muted size={14}>{`of ${allowance.left + allowance.used} conversations left today`}</Muted>
        </View>
        {!open ? (
          <Muted style={{ marginBottom: 12 }}>
            {`Opens after chapter ${TALK_UNLOCK_STAGE + 1}`}
          </Muted>
        ) : null}
        <List>
          {SCENARIOS.map((s, k) => {
            const u = UN.find((x) => x.id === s.unit);
            const enabled = canStart(s);
            return (
              <Row key={s.id} last={k === SCENARIOS.length - 1} disabled={!enabled}
                   onPress={() => start(s)}>
                <Thumb id={s.icon} locked={!enabled} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>{s.title}</Text>
                  <Muted>{`${s.en} · ${u ? u.name : ""}`}</Muted>
                </View>
              </Row>
            );
          })}
        </List>
      </Screen>
    );
  }

  /* ---- summary ---- */
  if (ended) {
    const graded = turns.filter((x) => x.who === "learner" && x.feedback);
    const okTurns = graded.filter((x) => x.feedback.overall === "ok").length;
    const tags = {};
    for (const x of graded) for (const g of x.feedback.grammar || []) tags[g.tag] = (tags[g.tag] || 0) + 1;
    return (
      <Screen>
        <Card>
          <Muted>{scenario.en}</Muted>
          <Text style={{ color: t.ink, fontSize: 19, fontWeight: "600", marginTop: 4 }}>
            {`${learnerTurns} ${learnerTurns === 1 ? "turn" : "turns"}, ${okTurns} clean`}
          </Text>
          {Object.keys(tags).length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {Object.entries(tags).map(([tag, n]) => (
                <Pill key={tag}>{`${tag.toLowerCase().replace(/_/g, " ")} ×${n}`}</Pill>
              ))}
            </View>
          ) : null}
        </Card>
        {newWords.length ? (
          <Card style={{ marginTop: 12 }}>
            <Muted>New words the tutor used</Muted>
            {newWords.map((w) => (
              <NewWord key={w.lemma} w={w} pinned={(st.pinned || []).includes(w.lemma)} onPin={pin} />
            ))}
          </Card>
        ) : null}
        <Btn kind="pri" label="Another conversation" style={{ marginTop: 16 }}
             onPress={() => { setScenario(null); setEnded(false); }} />
        <Btn kind="ghost" label="Back" style={{ marginTop: 8 }} onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  /* ---- the exchange ---- */
  const turnsLeft = TALK_TURNS - learnerTurns;
  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, padding: space.pad }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Pill tone="brand">{scenario.title}</Pill>
        <View style={{ flex: 1 }} />
        <Muted size={12}>{`${turnsLeft} ${turnsLeft === 1 ? "turn" : "turns"} left`}</Muted>
      </View>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
        {turns.map((x, k) => (x.who === "tutor" ? <TutorBubble key={k} turn={x} /> : <LearnerBubble key={k} turn={x} />))}
        {turns.length === 0 && !failure ? <ActivityIndicator testID="turn-pending" color={t.ink3} style={{ marginTop: 20 }} /> : null}
        {failure ? (
          <View style={{ alignItems: "center", gap: 8, marginTop: 8 }}>
            <Muted>{failure}</Muted>
            {!/used up/.test(failure) ? (
              <Btn label="Try again" onPress={() => {
                const lastLearner = [...turns].reverse().find((x) => x.who === "learner");
                if (turns.length === 0) ask([], "");
                else if (lastLearner && turns[turns.length - 1] === lastLearner) {
                  setTurns((prev) => prev.map((x) => (x === lastLearner ? { ...x, pending: true } : x)));
                  ask(turns, lastLearner.ru);
                }
              }} />
            ) : null}
          </View>
        ) : null}
        {newWords.length ? (
          <View style={{ marginTop: 6 }}>
            {newWords.map((w) => (
              <NewWord key={w.lemma} w={w} pinned={(st.pinned || []).includes(w.lemma)} onPin={pin} />
            ))}
          </View>
        ) : null}
      </ScrollView>
      <View style={{ paddingTop: 10, alignItems: "center", gap: 10 }}>
        {rec.block ? (
          <Blocked block={rec.block} onGetModel={rec.getModel} onSkip={() => setEnded(true)} skipLabel="End" />
        ) : turnsLeft > 0 ? (
          <>
            <HoldButton phase={rec.phase} onIn={rec.hold} onOut={rec.release} size={72} />
            <Text style={{ color: t.ink, fontSize: 16, minHeight: 22, textAlign: "center" }}>
              {rec.phase === "listening" ? rec.live : rec.note || ""}
            </Text>
          </>
        ) : (
          <Muted>That is the whole conversation</Muted>
        )}
        <Btn kind="ghost" label="End" onPress={() => setEnded(true)} />
      </View>
      </View>
    </Screen>
  );
}
