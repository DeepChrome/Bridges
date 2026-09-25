/* Talk — a short conversation in Russian on a topic (ROADMAP Phase 6).
 *
 * Three screens in one: the picker (a scenario per unit, open when the unit is,
 * with the level and pace to talk at), the exchange, and the summary. The tutor
 * is the Worker's /v1/talk route; the learner speaks through the same
 * hold-to-speak as Say (../speech.js). Every turn: the learner's words are
 * graded against the tutor's correction the way Say grades them — per lemma,
 * into the scheduler, with the tags counted. Words the tutor used that the
 * learner has not studied wait for the summary, where each can be added to
 * review — the transcript itself stays a conversation.
 *
 * Tutor bubbles carry the Russian with every recognised word a dictionary link,
 * an English line one toggle turns off, and a Speaker to hear it again — the
 * reply is read out once on arrival, and having no recording it is the device
 * voice and says so (doctrine §27). A bulb asks the Worker for one suitable
 * reply. Nothing here stores audio; the whole exchange goes to the Worker each
 * turn and the Worker keeps none of it.
 */

import React, { useEffect, useRef, useState } from "react";
import { View, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSession } from "../session";
import { useTheme, radius, space } from "../theme";
import { Screen, Btn, Pill, Muted, Speaker, List, Row, Thumb, Choice, SectionLabel, Text } from "../ui";
import { Linked } from "../words";
import { L, IX, UN, STAGES, drillPool, nextLesson } from "../data";
import { talk as askTutor, review as askReview, hint as askHint, config } from "../lib/feedback";
import { say, SPEEDS } from "../audio";
import { tagInfo } from "@core/errortags";
import { useRecognizer } from "../speech";
import { HoldButton, Feedback, Blocked } from "../activities/Say";
import { Alignment } from "../activities/Alignment";
import { SCENARIOS } from "@core/scenarios";
import { feedbackTags } from "@core/speech";
import { recordAttempt, talkAllowance, startTalkSession, TALK_TURNS } from "@core/state";
import { applyGrade, reviewRows, strength, schedulerOpts } from "@core/scheduler";
import { fold, today, firstSense } from "@core/util";

/* What a failed turn says. The reasons that will not fix themselves are named
   as such — a build without the Worker's address, a refused key, the day's
   backstop — so the learner is not told to try again what cannot work. `retry`
   says whether the button that resends the turn is offered. */
export function failureText(reply) {
  const r = reply || {};
  const cap = r.reason === "cap" || r.status === 429 || r.detail === "cap";
  if (!reply || r.reason === "unconfigured") {
    return { text: "Conversation is not available in this build.", retry: false };
  }
  if (cap) return { text: "Today's conversations are used up. Tomorrow, then.", retry: false };
  if (r.status === 401 || r.status === 403) {
    return { text: "This build's tutor key was refused.", retry: false };
  }
  if (r.reason === "offline") return { text: "No connection. Try again when you are online.", retry: true };
  if (r.reason === "timeout") return { text: "The tutor took too long. Try again.", retry: true };
  /* Every remaining failure used to come out as "The tutor could not answer",
     which is four different faults wearing one coat — and the owner saw it often
     enough to ask what it meant (2026-09-11). Each is named now, and `detail`
     carries what the server actually said, under the message in smaller type:
     a validator complaint ("reply cut off at 1000 tokens") is the difference
     between a bug to fix and a connection to retry. */
  const why = Array.isArray(r.errors) && r.errors.length ? String(r.errors[0])
            : r.detail ? String(r.detail) : null;
  if (r.reason === "parse") {
    return { text: "The tutor's answer came back malformed.", detail: why, retry: true };
  }
  if (r.reason === "upstream") {
    return { text: "The tutor's service did not answer.", detail: why, retry: true };
  }
  if (r.status) {
    return { text: `The tutor answered with an error (${r.status}).`, detail: why, retry: true };
  }
  return { text: "The tutor could not answer. Try again.", detail: why, retry: true };
}

/* Talk is open from the first screen, and so is every scenario in it (the
   owner, 2026-09-23: nothing in Practice is locked). It opened after chapter
   2's spine until then, and each scenario with its unit. The tutor pitches
   itself to the learner's level either way (talkLevelFor: chapters 1–4
   beginner, 5–7 intermediate, 8–10 advanced). */

/* Which words to tell the tutor the learner knows: the words met, strongest
   first — by the scheduler's stability, not the order they were met in —
   topped up along the route (the same pool the drills use). */
const studiedFor = (st) => {
  const s = (i) => strength((st.seen || {})[L[i].b]);
  return drillPool(st).slice().sort((a, b) => s(b) - s(a)).map((i) => L[i].b).slice(0, 300);
};

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

/* The tutor's turn: the Russian, every word a link, and the English under it
   when translations are on (the toolbar's EN switch, on by default). */
function TutorBubble({ turn, en }) {
  const t = useTheme();
  return (
    <View testID="tutor-bubble" style={{ alignSelf: "flex-start", maxWidth: "88%", marginBottom: 10 }}>
      <View style={{ backgroundColor: t.surface, borderColor: t.line, borderWidth: 1,
                     borderRadius: radius.lg, borderBottomLeftRadius: 4, padding: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <View style={{ flex: 1 }}><Linked text={turn.ru} size={17} /></View>
          {/* Hear it again — it was read out when it arrived. */}
          <Speaker text={turn.ru} size={32} />
        </View>
        {en ? <Muted testID="tutor-en" style={{ marginTop: 6 }}>{turn.en}</Muted> : null}
      </View>
    </View>
  );
}

/* One thing the learner could say next, under the transcript, until they speak. */
function HintCard({ hint, en, onClose }) {
  const t = useTheme();
  return (
    <View testID="hint-card" style={{ alignSelf: "stretch", marginTop: 4, marginBottom: 10, padding: 12,
                   borderRadius: radius.md, borderWidth: 1, borderColor: t.brand, backgroundColor: t.brandBg }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Muted size={11} style={{ flex: 1, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" }}>
          You could say
        </Muted>
        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close the hint">
          <Muted>✕</Muted>
        </Pressable>
      </View>
      {hint.pending ? (
        <ActivityIndicator testID="hint-pending" color={t.ink3} style={{ alignSelf: "flex-start", marginTop: 8 }} />
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 6 }}>
            <View style={{ flex: 1 }}><Linked text={hint.ru} size={17} /></View>
            <Speaker text={hint.ru} size={32} />
          </View>
          {en ? <Muted style={{ marginTop: 4 }}>{hint.en}</Muted> : null}
        </>
      )}
    </View>
  );
}

/* A toolbar button: an icon, a label for the screen reader, nothing else. */
function Tool({ label, on, onPress, testID, children }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={label}
               accessibilityState={on !== undefined ? { selected: !!on } : undefined} testID={testID}
               style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: "center",
                 justifyContent: "center", borderWidth: 1,
                 borderColor: on ? t.brand : t.line, backgroundColor: on ? t.brandBg : t.surface,
                 opacity: pressed ? 0.6 : 1 })}>
      {children}
    </Pressable>
  );
}

const Icon = ({ d, color, size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9}
       strokeLinecap="round" strokeLinejoin="round"><Path d={d} /></Svg>
);
const RESTART = "M3 12a9 9 0 1 0 3-6.7M3 4v5h5";
const END = "M6 6h12v12H6z";
const BULB = "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.6 1 1.4 1 2.5h6c0-1.1.3-1.9 1-2.5A6 6 0 0 0 12 3z";

/* The end of a conversation, read back: what went well, what to work on, and
   a few of the words that came up, each a tap from the review bank. Vocabulary
   is not shown during the exchange — it cluttered the transcript. */
function Summary({ scenario, turns, newWords, st, onPin, onPinAll, onAgain, onBack }) {
  const t = useTheme();
  const graded = turns.filter((x) => x.who === "learner" && x.feedback);
  const okTurns = graded.filter((x) => x.feedback.overall === "ok").length;
  const said = turns.filter((x) => x.who === "learner" && !x.pending).length;
  const praise = unique(graded.map((x) => x.feedback.praise).filter(Boolean)).slice(0, 3);
  const rightWords = graded.reduce((a, x) => a + (x.feedback.words || []).filter((w) => w.status === "ok").length, 0);
  const points = {};
  for (const x of graded) {
    for (const g of x.feedback.grammar || []) {
      const p = points[g.tag] = points[g.tag] || { tag: g.tag, n: 0, notes: [] };
      p.n++;
      if (g.note && p.notes.length < 2 && !p.notes.includes(g.note)) p.notes.push(g.note);
    }
  }
  const better = unique(graded.flatMap((x) => (x.feedback.wordChoice || [])
    .map((c) => `${c.said} → ${c.better}`))).slice(0, 4);
  const words = conversationWords(turns, newWords, st);
  const pinned = new Set(st.pinned || []);
  const good = [];
  if (said) good.push(`${said} ${said === 1 ? "turn" : "turns"}, ${okTurns} with nothing to correct`);
  if (rightWords) good.push(`${rightWords} words right as said`);
  good.push(...praise);
  return (
    <Screen>
      <Muted>{scenario.en}</Muted>
      <Text style={{ color: t.ink, fontSize: 19, fontWeight: "600", marginTop: 4, marginBottom: 14 }}>
        {scenario.title}
      </Text>

      <SectionLabel>Went well</SectionLabel>
      {good.map((g, k) => <Text key={k} style={{ color: t.ink2, fontSize: 15, marginBottom: 4 }}>{g}</Text>)}

      <SectionLabel style={{ marginTop: 18 }}>To work on</SectionLabel>
      {!Object.keys(points).length && !better.length ? (
        <Muted>Nothing the tutor corrected.</Muted>
      ) : null}
      {Object.values(points).sort((a, b) => b.n - a.n).map((p) => (
        <View key={p.tag} style={{ marginBottom: 8 }}>
          <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>
            {(tagInfo(p.tag) || {}).en || p.tag.toLowerCase().replace(/_/g, " ")}{p.n > 1 ? ` ×${p.n}` : ""}
          </Text>
          {p.notes.map((n, k) => <Muted key={k} style={{ marginTop: 2 }}>{n}</Muted>)}
        </View>
      ))}
      {better.map((b, k) => <Text key={k} style={{ color: t.ink2, fontSize: 15, marginBottom: 4 }}>{b}</Text>)}

      {words.length ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 18, marginBottom: 6 }}>
            <SectionLabel style={{ flex: 1, marginBottom: 0 }}>Words from this conversation</SectionLabel>
            {words.some((w) => !pinned.has(w.lemma)) ? (
              <Btn kind="ghost" label="Add all to review" onPress={() => onPinAll(words)} />
            ) : null}
          </View>
          <List>
            {words.map((w) => (
              <Row key={w.lemma}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 16 }}>{w.lemma}</Text>
                  <Muted>{w.en}</Muted>
                </View>
                {pinned.has(w.lemma) ? <Pill tone="good">in review</Pill>
                  : <Btn kind="ghost" label="Add" onPress={() => onPin(w)} />}
              </Row>
            ))}
          </List>
        </>
      ) : null}

      <Btn kind="pri" label="Another conversation" style={{ marginTop: 20 }} onPress={onAgain} />
      <Btn kind="ghost" label="Back" style={{ marginTop: 8 }} onPress={onBack} />
    </Screen>
  );
}

const unique = (a) => a.filter((x, k) => a.indexOf(x) === k);

/* The words to feature at the end: what the tutor used that the learner had not
   studied, then up to six curriculum words from the tutor's turns that the
   learner has not met or has trouble with, then any others — content words only. */
export function conversationWords(turns, newWords, st) {
  const out = [], have = new Set();
  for (const w of newWords || []) {
    if (!have.has(w.lemma)) { have.add(w.lemma); out.push({ lemma: w.lemma, en: w.en, isNew: true }); }
  }
  const cands = [];
  for (const x of turns) {
    if (x.who !== "tutor") continue;
    for (const tok of x.tokens || []) {
      const hit = IX[fold(tok.lemma || tok.ru)];
      if (!hit || !hit.length) continue;
      const e = L[hit[0]];
      if (!e || have.has(e.b) || hit[0] < 150) continue;         // function words are not vocabulary
      if (!["noun", "verb", "adjective"].includes(e.p)) continue;
      have.add(e.b);
      const card = (st.seen || {})[e.b];
      const rank = (st.trouble || {})[e.b] ? 0 : !card ? 1 : 2;
      cands.push({ lemma: e.b, en: firstSense(e), rank });
    }
  }
  cands.sort((a, b) => a.rank - b.rank);
  return out.concat(cands).slice(0, 8);
}

/* The learner's words in a bubble; the tutor's notes on them under it, outside
   the bubble, in a quieter face — there to read, not part of what was said. */
function LearnerBubble({ turn }) {
  const t = useTheme();
  return (
    <View testID="learner-bubble" style={{ alignSelf: "flex-end", maxWidth: "88%", marginBottom: 10, alignItems: "flex-end" }}>
      <View style={{ backgroundColor: t.brandBg, borderColor: t.brand, borderWidth: 1,
                     borderRadius: radius.lg, borderBottomRightRadius: 4, padding: 12 }}>
        {turn.alignment ? (
          <Alignment alignment={turn.alignment} />
        ) : (
          <Text style={{ color: t.ink, fontSize: 17 }}>{turn.ru}</Text>
        )}
        {turn.pending ? <ActivityIndicator testID="turn-pending" color={t.ink3} style={{ alignSelf: "flex-start", marginTop: 6 }} /> : null}
      </View>
      {turn.feedback ? <Feedback fb={turn.feedback} quiet style={{ marginTop: 6, paddingHorizontal: 4 }} /> : null}
    </View>
  );
}

/* The tutor's pitch and pace, chosen on the picker and kept. */
export const TALK_LEVELS = [
  { id: "beginner", name: "Beginner", blurb: "Simple words, present tense" },
  { id: "intermediate", name: "Intermediate", blurb: "Everyday Russian, all tenses" },
  { id: "advanced", name: "Advanced", blurb: "Idioms and longer sentences" },
];
/* Without a choice, the level follows the route: chapters 1–4 beginner, 5–7
   intermediate, later advanced. */
export function talkLevelFor(st) {
  if (st.talkLevel && TALK_LEVELS.some((l) => l.id === st.talkLevel)) return st.talkLevel;
  const here = nextLesson(st);
  const stage = here ? STAGES.findIndex((s) => s.core.id === here.unit.id) : STAGES.length;
  return stage < 4 ? "beginner" : stage < 7 ? "intermediate" : "advanced";
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
  const [hint, setHint] = useState(null);           // { pending } | { ru, en } | null
  const en = st.talkEn !== false;
  const learnerTurns = turns.filter((x) => x.who === "learner" && !x.pending).length;
  const scrollRef = useRef(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const unit = scenario ? UN.find((u) => u.id === scenario.unit) : null;

  const level = talkLevelFor(st);
  const speed = st.talkSpeed || "normal";

  /* The learner's turn, marked. Applied whenever the marking arrives, which is
     after the tutor has already answered — a turn with no marking at all is
     allowed, and then the words stand as said and the conversation goes on. */
  const applyReview = (feedback, transcript) => {
    if (!transcript || !feedback) {
      setTurns((prev) => prev.map((x) => (x.pending ? { ...x, pending: false } : x)));
      return;
    }
    const words = feedback.words || [];
    const alignment = words.map((w) => ({ said: w.said, expected: w.expected,
      status: w.status === "ins" ? "ins" : w.status }));
    const grades = gradeTurn(words);
    const tags = feedbackTags(feedback);
    // A spoken turn is production: the learner found the word, nobody showed it.
    const now = Date.now();
    const rows = reviewRows(st.seen, grades.map((g) => ({ word: L[g.i].b, direction: "produce", grade: g.grade })),
                            now, "talk", schedulerOpts(st));
    update((prev) => {
      let next = prev;
      for (const g of grades) {
        const r = applyGrade(next.seen, next.trouble, L[g.i].b, "produce", g.grade, now, schedulerOpts(prev));
        next = { ...next, seen: r.seen, trouble: r.trouble };
      }
      return {
        ...next,
        speech: recordAttempt(next.speech, {
          ts: Date.now(), key: fold(transcript), kind: "talk", unit: scenario.unit,
          scenario: scenario.id, transcript, target: words.map((w) => w.expected || "").join(" ").trim(),
          wer: words.length ? words.filter((w) => w.status !== "ok").length / words.length : 0,
          tags, grade: feedback.overall === "ok" ? 3 : 1,
        }),
      };
    }, rows);
    setTurns((prev) => prev.map((x) => (x.pending
      ? { ...x, pending: false, alignment: alignment.length ? alignment : null, feedback }
      : x)));
  };

  /* A turn is two requests, sent together (the owner, 2026-09-11: *"the AI is
   * extremely slow sometimes"*).
   *
   * Answering the learner and marking what they said are both answers to the
   * same turn, and neither needs the other. Asked as one request the model wrote
   * about seven hundred tokens before the learner heard a word; asked together
   * the reply is a fifth of that and lands first, and the marking appears under
   * their own bubble a moment later — which is what Say has always done with its
   * feedback. The wait goes from the sum of the two to the longer of them. */
  const ask = async (history, transcript) => {
    setFailure(null);
    const asHistory = history.map((x) => ({ who: x.who, ru: x.ru }));
    const replying = askTutor({
      scenario: scenario.prompt, topic: unit && unit.g ? unit.g.title : null,
      studied: studiedFor(st), history: asHistory, transcript, level,
    });
    const marking = transcript
      ? askReview({ scenario: scenario.prompt, history: asHistory, transcript, level })
      : null;
    // Neither request is left unhandled: an unawaited rejection here would be
    // reported by the platform as an app error over a conversation that is fine.
    if (marking) marking.catch(() => null);

    let reply = await replying;
    if (!alive.current) return;
    /* A malformed answer is asked for again once, silently, before the
       learner is told (the owner, 2026-09-24: "need to have some error
       handling there"). The Worker has already retried inside its own
       request; a fresh request is a fresh draw, and it succeeds far more often
       than not. Only for `parse` — a cap or a dead connection would fail the
       same way twice. */
    if (reply && reply.reason === "parse") {
      reply = await askTutor({
        scenario: scenario.prompt, topic: unit && unit.g ? unit.g.title : null,
        studied: studiedFor(st), history: asHistory, transcript, level,
      });
      if (!alive.current) return;
    }
    if (!reply || reply.ok !== true) {
      setTurns((prev) => prev.map((x) => (x.pending ? { ...x, pending: false } : x)));
      setFailure(failureText(reply));
      return;
    }
    setTurns((prev) => prev.concat([{ who: "tutor", ru: reply.reply_ru, en: reply.reply_en,
                                      tokens: reply.reply_tokens }]));
    // The tutor speaks its turn as it arrives (the owner, 2026-09-07), at the
    // pace chosen on the picker; the speaker on the bubble is for hearing it again.
    say(reply.reply_ru, { repeat: false, speed });
    if (reply.newWords && reply.newWords.length) {
      setNewWords((prev) => {
        const have = new Set(prev.map((w) => w.lemma));
        return prev.concat(reply.newWords.filter((w) => !have.has(w.lemma)));
      });
    }

    if (!transcript) return;
    const review = marking ? await Promise.resolve(marking).catch(() => null) : null;
    if (!alive.current) return;
    /* Marking that fails, or never comes, is not a failed turn: the tutor has
       answered and the conversation is fine. The bubble stops waiting either
       way — a turn left spinning for ever is the worse failure. */
    applyReview(review && review.ok === true ? review.feedback : null, transcript);
  };

  /* A scenario can start when the build has a Worker and a session is left
     today. The row reads this to dim itself and start() checks it again: the guard
     lives with the action, not only in the control that offers it. */
  // A build without the Worker's address cannot start a conversation at all;
  // the picker says so instead of spinning.
  const configured = !!config("/v1/talk");
  const canStart = (s) => configured && !!UN.find((x) => x.id === s.unit) && allowance.left > 0;
  const [run, setRun] = useState(0);                // bumps on Restart so the opening is asked again
  const start = (s) => {
    if (!canStart(s)) return;
    update((prev) => ({ ...prev, speech: startTalkSession(prev.speech, day) }));
    setScenario(s);
    setTurns([]); setNewWords([]); setEnded(false); setHint(null); setFailure(null);
    setRun((n) => n + 1);
    // The tutor opens; the effect below sends the empty first turn.
  };
  useEffect(() => {
    if (scenario && turns.length === 0 && !ended) ask([], "");
  }, [scenario, run]);

  const rec = useRecognizer({
    enabled: !!scenario && !ended && learnerTurns < TALK_TURNS && !turns.some((x) => x.pending),
    onFinal: (transcript) => {
      if (!transcript.trim()) return;
      setHint(null);
      const history = turns.concat([{ who: "learner", ru: transcript }]);
      setTurns((prev) => prev.concat([{ who: "learner", ru: transcript, pending: true }]));
      ask(history, transcript);
    },
  });

  /* One thing to say next, from the tutor; shown until the learner speaks. */
  const getHint = async () => {
    if (!scenario || hint && hint.pending) return;
    setHint({ pending: true });
    const reply = await askHint({ scenario: scenario.prompt, studied: studiedFor(st),
                                  history: turns.map((x) => ({ who: x.who, ru: x.ru })), level });
    if (!alive.current) return;
    if (!reply || reply.ok !== true) { setHint(null); setFailure({ text: "No hint this time.", retry: false }); return; }
    setHint({ ru: reply.hint_ru, en: reply.hint_en });
  };

  const pin = (w) => {
    update((prev) => ({ ...prev, pinned: (prev.pinned || []).includes(w.lemma) ? prev.pinned
      : (prev.pinned || []).concat([w.lemma]) }));
  };
  const pinAll = (ws) => {
    update((prev) => ({ ...prev, pinned: (prev.pinned || [])
      .concat(ws.map((w) => w.lemma).filter((l) => !(prev.pinned || []).includes(l))) }));
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollToEnd({ animated: true });
  }, [turns.length]);

  /* ---- picker ---- */
  if (!scenario) {
    return (
      <Screen>
        {!configured ? (
          <Muted testID="talk-unconfigured" style={{ marginBottom: 12 }}>
            Conversation is not available in this build.
          </Muted>
        ) : null}
        <SectionLabel>The tutor</SectionLabel>
        <Choice testID="talk-level" options={TALK_LEVELS} value={level}
                onPick={(id) => update((p) => ({ ...p, talkLevel: id }))} />
        <Muted style={{ marginTop: 6, marginBottom: 10 }}>
          {TALK_LEVELS.find((l) => l.id === level).blurb + (st.talkLevel ? "" : " · set by where you are")}
        </Muted>
        <Choice testID="talk-speed" options={SPEEDS} value={speed}
                onPick={(id) => update((p) => ({ ...p, talkSpeed: id }))} />
        <Muted style={{ marginTop: 6, marginBottom: 16 }}>How fast the tutor is read out</Muted>
        <List>
          {SCENARIOS.map((s) => {
            const u = UN.find((x) => x.id === s.unit);
            const enabled = canStart(s);
            return (
              <Row key={s.id} disabled={!enabled}
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
    return (
      <Summary scenario={scenario} turns={turns} newWords={newWords} st={st}
               onPin={pin} onPinAll={pinAll}
               onAgain={() => { setScenario(null); setEnded(false); }}
               onBack={() => navigation.goBack()} />
    );
  }

  /* ---- the exchange ---- */
  const turnsLeft = TALK_TURNS - learnerTurns;
  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, padding: space.pad }}>
      {/* The controls, and only these: restart, end, a hint, English on or off.
          Home is in the header, as everywhere. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Pill tone="brand">{scenario.title}</Pill>
        <View style={{ flex: 1 }} />
        <Tool label="Restart the conversation" testID="talk-restart"
              onPress={() => (turns.some((x) => x.who === "learner")
                ? Alert.alert("Start over?", "This conversation is wiped.",
                              [{ text: "Keep going", style: "cancel" },
                               { text: "Restart", style: "destructive", onPress: () => start(scenario) }])
                : start(scenario))}>
          <Icon d={RESTART} color={t.ink2} />
        </Tool>
        <Tool label="End the conversation" testID="talk-end" onPress={() => setEnded(true)}>
          <Icon d={END} color={t.ink2} />
        </Tool>
        <Tool label="Hint: something you could say" testID="talk-hint" onPress={getHint}
              on={!!hint}>
          <Icon d={BULB} color={hint ? t.brandInk : t.ink2} />
        </Tool>
        <Tool label={en ? "Hide the English" : "Show the English"} testID="talk-en" on={en}
              onPress={() => update((p) => ({ ...p, talkEn: !en }))}>
          <Text style={{ color: en ? t.brandInk : t.ink2, fontSize: 12, fontWeight: "700" }}>EN</Text>
        </Tool>
      </View>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
        {turns.map((x, k) => (x.who === "tutor" ? <TutorBubble key={k} turn={x} en={en} /> : <LearnerBubble key={k} turn={x} />))}
        {turns.length === 0 && !failure ? <ActivityIndicator testID="turn-pending" color={t.ink3} style={{ marginTop: 20 }} /> : null}
        {hint ? <HintCard hint={hint} en={en} onClose={() => setHint(null)} /> : null}
        {failure ? (
          <View style={{ alignItems: "center", gap: 8, marginTop: 8 }}>
            <Muted testID="talk-failure">{failure.text}</Muted>
            {/* What the server actually said, under it and smaller: the
                difference between something to retry and something to fix. */}
            {failure.detail ? (
              <Muted testID="talk-failure-why" size={11} numberOfLines={3}
                     style={{ textAlign: "center", opacity: 0.85 }}>
                {failure.detail}
              </Muted>
            ) : null}
            {failure.retry ? (
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
          <Btn kind="pri" label="See how it went" onPress={() => setEnded(true)} />
        )}
        <Muted size={12}>{`${turnsLeft} ${turnsLeft === 1 ? "turn" : "turns"} left`}</Muted>
      </View>
      </View>
    </Screen>
  );
}
