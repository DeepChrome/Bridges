/* Tutor — a free conversation with someone who knows where you are (2026-09-26).
 *
 * The owner: *"a talk with AI mode where it's sort of just a free flowing
 * conversation… 'give me drills one at a time to conjugate irregular verbs in
 * present tense' and 'what do you think I should study next' and 'drill me on
 * some words from chapter one that I've had issues with' or just 'simulator
 * being a girl on a blind date but coach me through making mistakes'… it also
 * builds context about the user to learn their progress, strengths,
 * weaknesses, preferences."*
 *
 * Talk (Talk.js) is a scene at the learner's level, in Russian, every turn
 * graded per word into the scheduler. This is the other thing: any request,
 * in either language, typed or spoken, and the tutor decides what to do with
 * it. Nothing here is scored and nothing enters the scheduler — a drill the
 * tutor runs is marked by the tutor, in words, and what the profile keeps from
 * it is the tutor's own note.
 *
 * **The tutor knows the learner because the app tells it, every turn.** The
 * Worker keeps nothing (§30d); `tutorProfile` below is what rides with each
 * message — where they are on the route, the trouble bank, the words held
 * best, the last wrong answers the runner recorded (Run.js `misses`), and the
 * notes the tutor itself asked to keep from earlier conversations. A reply may
 * add one line to those notes (`remember`), and that is the whole of the
 * memory: on the phone, in the profile, capped, like every other piece of
 * learner state.
 *
 * The Russian in a reply is `Linked` (§30b — a word is two presses from its
 * entry) and read aloud when the tutor marked any as worth hearing (`ru`);
 * with no recording for a generated sentence it is the device voice (§27).
 */

import React, { useEffect, useRef, useState } from "react";
import { View, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSession } from "../session";
import { useTheme, radius, space } from "../theme";
import { Screen, Btn, Muted, Text, TextInput } from "../ui";
import { Linked } from "../words";
import { L, STAGES, drillPool, routePosition } from "../data";
import { tutor as askTutor, config } from "../lib/feedback";
import { speakLine, stop } from "../audio";
import { useRecognizer, LANG, LANG_EN } from "../speech";
import { HoldButton, Blocked } from "../activities/Say";
import { failureText, talkLevelFor } from "./Talk";
import { troubleWords, strength, familiarity, cardFor } from "@core/scheduler";

/* How many notes the tutor may leave in the profile; the oldest goes when a
   new one arrives. Twenty short lines is a person's worth of context. */
export const NOTES_KEPT = 20;
/* Words told to the tutor as held well: familiarity at or above this. */
const STRONG_AT = 60;
const LIST_N = 30;

/* What the tutor is handed about this learner. Built from the state the app
   already keeps — nothing here is a new record. Exported for the tests. */
export function tutorProfile(st) {
  const pos = routePosition(st);
  const seen = st.seen || {};
  const strong = Object.keys(seen)
    .map((w) => ({ w, f: familiarity(cardFor(seen[w])) }))
    .filter((x) => x.f !== null && x.f >= STRONG_AT)
    .sort((a, b) => b.f - a.f).slice(0, LIST_N).map((x) => x.w);
  return {
    chapter: Math.min(pos.stage, STAGES.length - 1) + 1,
    lesson: Number.isFinite(pos.lesson) ? pos.lesson + 1 : null,
    level: talkLevelFor(st),
    trouble: troubleWords(seen).concat(st.pinned || []).filter((w, k, a) => a.indexOf(w) === k).slice(0, LIST_N),
    strong,
    misses: (st.misses || []).slice(0, 12).map((m) => ({ kind: m.kind, prompt: m.prompt, answer: m.answer, said: m.said })),
    notes: (st.tutorNotes || []).slice(0, NOTES_KEPT),
  };
}

/* The words the learner has met, strongest first, for the tutor to prefer —
   the same list Talk sends. */
const studiedFor = (st) => {
  const s = (i) => strength((st.seen || {})[L[i].b]);
  return drillPool(st).slice().sort((a, b) => s(b) - s(a)).map((i) => L[i].b).slice(0, 300);
};

/* One note into the profile: newest first, no repeats, capped. */
export const remember = (notes, line) => {
  const s = String(line || "").trim();
  if (!s) return notes || [];
  const rest = (notes || []).filter((n) => n.toLowerCase() !== s.toLowerCase());
  return [s].concat(rest).slice(0, NOTES_KEPT);
};

const CYR = /[Ѐ-ӿ]/;

/* A turn as one string, for the history the Worker is sent. */
export const turnText = (x) => (x.who === "learner" ? String(x.text || "")
  : [x.ru, x.note].filter(Boolean).join(" "));

/* The tutor's turn, in its parts: the Russian word-linked with a speaker, its
   English under it in the quiet face (off with the same switch as Talk's,
   `talkEn`), and the coaching note in English below, which no switch hides —
   a correction or an answer to an English question is the turn's substance.
   The first cut drew one mixed `text` through one component and reached the
   owner's phone as an empty bubble with a speaker in it (2026-09-26); each
   part is drawn the way Talk already draws it. */
function TutorBubble({ turn, en }) {
  const t = useTheme();
  return (
    <View testID="tutor-turn" style={{ alignSelf: "flex-start", maxWidth: "90%", marginBottom: 10 }}>
      <View style={{ backgroundColor: t.surface, borderColor: t.line, borderWidth: 1,
                     borderRadius: radius.lg, borderBottomLeftRadius: 4, padding: 12 }}>
        {turn.ru ? (
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <View style={{ flex: 1 }}><Linked text={turn.ru} size={17} testID="tutor-ru" /></View>
            <Replay text={turn.ru} />
          </View>
        ) : null}
        {turn.ru && en && turn.en ? (
          <Muted testID="tutor-en" style={{ marginTop: 6 }}>{turn.en}</Muted>
        ) : null}
        {turn.note ? (
          <Text testID="tutor-note"
                style={{ color: t.ink, fontSize: 15, lineHeight: 21, marginTop: turn.ru ? 10 : 0 }}>
            {turn.note}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/* Hear the Russian of a turn again. Not `Speaker`: that is the collection's
   button and labels its recordings (§27); a tutor's sentence has none. */
function Replay({ text }) {
  const t = useTheme();
  return (
    <Pressable testID="tutor-replay" accessibilityRole="button" accessibilityLabel="Hear the Russian"
               onPress={() => speakLine(text)} hitSlop={8}
               style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, borderWidth: 1,
                 borderColor: t.line, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 })}>
      <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={t.ink2}
           strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M11 5L6 9H2v6h4l5 4V5z" />
        <Path d="M15.5 8.5a5 5 0 0 1 0 7" />
      </Svg>
    </Pressable>
  );
}

function LearnerBubble({ turn }) {
  const t = useTheme();
  return (
    <View testID="learner-turn" style={{ alignSelf: "flex-end", maxWidth: "90%", marginBottom: 10 }}>
      <View style={{ backgroundColor: t.brandBg, borderColor: t.brand, borderWidth: 1,
                     borderRadius: radius.lg, borderBottomRightRadius: 4, padding: 12 }}>
        {CYR.test(turn.text) ? <Linked text={turn.text} size={16} />
          : <Text style={{ color: t.ink, fontSize: 16, lineHeight: 22 }}>{turn.text}</Text>}
      </View>
    </View>
  );
}

/* The microphone's language, one small toggle beside it: a request is as
   likely to be "what should I study next" as «я хочу чай». */
function LangToggle({ lang, onPress }) {
  const t = useTheme();
  const en = lang === LANG_EN;
  return (
    <Pressable testID="tutor-lang" accessibilityRole="button"
               accessibilityLabel={en ? "Microphone hears English" : "Microphone hears Russian"}
               onPress={onPress} hitSlop={8}
               style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, borderWidth: 1,
                 borderColor: t.line, backgroundColor: t.surface, alignItems: "center",
                 justifyContent: "center", opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ color: t.ink2, fontSize: 12, fontWeight: "700" }}>{en ? "EN" : "RU"}</Text>
    </Pressable>
  );
}

const SEND = "M4 12h14M12 5l7 7-7 7";

export default function Tutor({ navigation }) {
  const { st, update, ready } = useSession();
  const t = useTheme();
  // learner: { who, text }; tutor: { who, ru, en, note }
  const [turns, setTurns] = useState([]);
  const en = st.talkEn !== false;
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState(null);
  const [draft, setDraft] = useState("");
  const [lang, setLang] = useState(LANG);
  const scrollRef = useRef(null);
  const alive = useRef(true);
  const configured = !!config("/v1/tutor");
  useEffect(() => () => { alive.current = false; stop(); }, []);

  /* One turn: the profile, the studied words, the exchange so far and what
     was just said. The tutor's note, if any, goes into the profile as it
     arrives — a fact about the learner is worth keeping even if this
     conversation is abandoned a moment later. */
  const ask = async (history, text) => {
    setFailure(null);
    setPending(true);
    const reply = await askTutor({
      profile: tutorProfile(st), studied: studiedFor(st),
      // A tutor turn goes back as the words it said, Russian then note, so the
      // model reads its own past turns the way the learner did.
      history: history.map((x) => ({ who: x.who, text: turnText(x) })), text,
    });
    if (!alive.current) return;
    setPending(false);
    if (!reply || reply.ok !== true) { setFailure(failureText(reply)); return; }
    const turn = { who: "tutor", ru: reply.ru || "", en: reply.en || "", note: reply.note || "" };
    // The Worker refuses a turn with nothing in it; this is the app refusing too.
    if (!turn.ru && !turn.note) { setFailure(failureText({ ok: false, reason: "parse", errors: ["empty turn"] })); return; }
    setTurns((prev) => prev.concat([turn]));
    if (turn.ru) speakLine(turn.ru);
    if (reply.remember) {
      update((prev) => ({ ...prev, tutorNotes: remember(prev.tutorNotes, reply.remember) }));
    }
  };

  /* The tutor opens, from the profile alone — once the profile is here. The
     shell mounts a screen only after the session is ready, so this is belt
     and braces; but a first turn sent from the store's defaults would greet a
     learner with nothing in their profile, and the test that seeds one is
     how that was found. */
  const opened = useRef(false);
  useEffect(() => {
    if (!ready || !configured || opened.current) return;
    opened.current = true;
    ask([], "");
  }, [ready]);   // eslint-disable-line react-hooks/exhaustive-deps

  const send = (text) => {
    const s = String(text || "").trim();
    if (!s || pending) return;
    setDraft("");
    const history = turns.concat([{ who: "learner", text: s }]);
    setTurns(history);
    ask(turns, s);
  };

  const rec = useRecognizer({
    enabled: configured && !pending,
    onFinal: (transcript) => send(transcript),
  });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollToEnd({ animated: true });
  }, [turns.length, pending]);

  const restart = () => {
    const go = () => { setTurns([]); setFailure(null); ask([], ""); };
    if (turns.some((x) => x.who === "learner")) {
      Alert.alert("Start over?", "This conversation is wiped.",
                  [{ text: "Keep going", style: "cancel" }, { text: "Restart", style: "destructive", onPress: go }]);
    } else go();
  };

  const last = [...turns].reverse().find((x) => x.who === "learner");

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, padding: space.pad }}>
        {!configured ? (
          <Muted testID="tutor-unconfigured" style={{ marginBottom: 12 }}>
            The tutor is not available in this build.
          </Muted>
        ) : null}
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}
                    keyboardShouldPersistTaps="handled">
          {turns.map((x, k) => (x.who === "tutor" ? <TutorBubble key={k} turn={x} en={en} /> : <LearnerBubble key={k} turn={x} />))}
          {pending ? <ActivityIndicator testID="tutor-pending" color={t.ink3} style={{ alignSelf: "flex-start", marginTop: 6 }} /> : null}
          {failure ? (
            <View style={{ alignItems: "center", gap: 8, marginTop: 8 }}>
              <Muted testID="tutor-failure">{failure.text}</Muted>
              {failure.detail ? (
                <Muted size={11} numberOfLines={3} style={{ textAlign: "center", opacity: 0.85 }}>{failure.detail}</Muted>
              ) : null}
              {failure.retry ? (
                <Btn label="Try again" onPress={() => {
                  if (!turns.length || !last || turns[turns.length - 1] !== last) ask([], "");
                  else ask(turns.slice(0, -1), last.text);
                }} />
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {rec.block ? (
          <Blocked block={rec.block} onGetModel={rec.getModel} onSkip={rec.clearBlock} skipLabel="Type instead" />
        ) : (
          <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: t.lineSoft }}>
            {/* Typed or spoken, side by side: a question about grammar is typed
                in English; an answer to a drill is said in Russian. */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TextInput
                testID="tutor-input"
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={() => send(draft)}
                placeholder="Ask the tutor"
                editable={configured && !pending}
                returnKeyType="send"
                blurOnSubmit={false}
                style={{ flex: 1 }}
              />
              <Pressable testID="tutor-send" accessibilityRole="button" accessibilityLabel="Send"
                         onPress={() => send(draft)} hitSlop={6}
                         style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22,
                           backgroundColor: draft.trim() && !pending ? t.brand : t.surface2,
                           alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}>
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"
                     stroke={draft.trim() && !pending ? t.brandOn : t.ink3}
                     strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d={SEND} /></Svg>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 10 }}>
              <View style={{ width: 44 }} />
              <HoldButton testID="tutor-hold" phase={rec.phase} size={60}
                          onIn={() => rec.hold({ lang })} onOut={rec.release} />
              <LangToggle lang={lang} onPress={() => setLang(lang === LANG ? LANG_EN : LANG)} />
            </View>
            <Text style={{ color: t.ink, fontSize: 15, minHeight: 20, textAlign: "center", marginTop: 4 }}>
              {rec.phase === "listening" ? rec.live : rec.note || ""}
            </Text>
            {turns.length > 1 ? (
              <Btn kind="link" label="Start over" testID="tutor-restart" onPress={restart} />
            ) : null}
          </View>
        )}
      </View>
    </Screen>
  );
}
