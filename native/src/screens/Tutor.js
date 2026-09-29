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
import { Screen, Btn, Muted, Text, TextInput, Marked, Note, CogButton, BulbButton, Sheet,
         List, Row, SectionLabel, Choice, Tick } from "../ui";
import { Linked } from "../words";
import { L, STAGES, drillPool, routePosition, rankOf } from "../data";
import { tutor as askTutor, config } from "../lib/feedback";
import { speakLine, stop } from "../audio";
import { useRecognizer, LANG, LANG_EN } from "../speech";
import { HoldButton, Blocked } from "../activities/Say";
import { failureText, talkLevelFor, TALK_LEVELS } from "./Talk";
import { troubleWords, strength, familiarity, cardFor } from "@core/scheduler";

/* How many notes the tutor may leave in the profile; the oldest goes when a
   new one arrives. Twenty short lines is a person's worth of context. */
export const NOTES_KEPT = 20;
/* Silent turns in a row before conversation mode gives up and puts the
   microphone down. Two, because one is a pause for thought and a run of them
   is an empty room. */
export const QUIET_LIMIT = 2;

/* **Conversation mode hears both languages.** The owner, 2026-09-26:
 * *"ideally it could interpret both Russian and English simultaneously…
 * new speakers won't be able to give it commands in Russian on what they
 * want to learn."* A beginner asks in English and practises in Russian,
 * often inside one sentence, and a recogniser pinned to one of them turns
 * the other into nonsense. Android follows the speaker between the two
 * (speech.js BOTH_LANGUAGES); the engine starts in Russian because that is
 * what most turns will be. Nothing downstream depends on it working — the
 * tutor reads the script it gets — so where the platform does not support
 * switching the cost is one language rather than a broken turn. */
export const HEARS_BOTH = { lang: LANG, langs: [LANG, LANG_EN] };

/* **How many turns in a row the tutor has to be lost before it offers a
 * list** (the owner, 2026-09-26: *"let's have that pop-up happen after a few
 * instances of it not knowing what the user wants"*). The model says it is
 * unsure by sending `choices`; the app decides when that has happened often
 * enough to be worth interrupting for, because a model asked to count its
 * own confusions will not. One unclear answer is a conversation; three in a
 * row is somebody who does not know what to ask for. */
export const CHOICES_AFTER = 3;
/* Words told to the tutor as held well: familiarity at or above this. */
const STRONG_AT = 60;
const LIST_N = 30;

/* What the tutor is handed about this learner. Built from the state the app
   already keeps — nothing here is a new record. Exported for the tests. */
export function tutorProfile(st) {
  const pos = routePosition(st);
  const seen = st.seen || {};
  const strong = Object.keys(seen)
    .map((w) => ({ w, f: familiarity(cardFor(seen[w]), rankOf(w)) }))
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
/* What the learner could ask for next, when the tutor does not know what
   they want. Tapping one says it for them, which is the whole point: a
   beginner cannot yet ask for a genitive drill in Russian, and asking them
   to type it in English is asking them to know what to want. The fourth is
   the app's — a way out of a list is not something to ask a model for. */
function Choices({ choices, onPick, onOther }) {
  const t = useTheme();
  return (
    <View testID="tutor-choices" style={{ alignSelf: "flex-start", maxWidth: "92%", gap: 6, marginBottom: 10 }}>
      {choices.map((c, k) => (
        <Pressable key={k} testID={`tutor-choice-${k}`} accessibilityRole="button"
                   onPress={() => onPick(c)}
                   style={({ pressed }) => ({ borderWidth: 1, borderColor: t.brand,
                     backgroundColor: t.brandBg, borderRadius: radius.md,
                     paddingVertical: 10, paddingHorizontal: 14, minHeight: 44,
                     justifyContent: "center", opacity: pressed ? 0.7 : 1 })}>
          <Text style={{ color: t.brandInk, fontSize: 15, fontWeight: "600" }}>{c}</Text>
        </Pressable>
      ))}
      <Pressable testID="tutor-choice-other" accessibilityRole="button" onPress={onOther}
                 style={({ pressed }) => ({ borderWidth: 1, borderColor: t.line,
                   backgroundColor: t.surface, borderRadius: radius.md,
                   paddingVertical: 10, paddingHorizontal: 14, minHeight: 44,
                   justifyContent: "center", opacity: pressed ? 0.7 : 1 })}>
        <Text style={{ color: t.ink2, fontSize: 15 }}>Something else</Text>
      </Pressable>
    </View>
  );
}

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
        {/* One sentence to a line (ui.js `Note`): two facts run together are
            the "large block of verbose text" the owner keeps reading. */}
        {turn.note ? (
          <Note testID="tutor-note" text={turn.note}
                style={{ marginTop: turn.ru ? 10 : 0 }} />
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

/* Conversation mode, as one icon beside the microphone — the control the
   owner described: *"think about Claude's own conversation mode with the
   little icon by itself."* Four bars of a waveform, lit when the exchange is
   running. It is the mode's only control and it is not a setting, so there is
   nowhere else to look for it. */
function ConverseToggle({ on, onPress }) {
  const t = useTheme();
  return (
    <Pressable testID="tutor-converse" accessibilityRole="button"
               accessibilityState={{ selected: !!on }}
               accessibilityLabel={on ? "Leave conversation mode" : "Conversation mode"}
               onPress={onPress} hitSlop={8}
               style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22,
                 alignItems: "center", justifyContent: "center", borderWidth: 1,
                 borderColor: on ? t.brand : t.line,
                 backgroundColor: on ? t.brandBg : t.surface,
                 opacity: pressed ? 0.6 : 1 })}>
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"
           stroke={on ? t.brandInk : t.ink2} strokeWidth={2} strokeLinecap="round">
        <Path d="M4 10v4M8.5 6v12M15.5 6v12M20 10v4" />
      </Svg>
    </Pressable>
  );
}

/* The screen's own options, behind the cog every other run screen carries
   (the owner, 2026-09-26: *"in Tutor mode there's no settings button like
   there is in other areas"*). Everything here is a fact about the tutor, not
   about the app: how hard its Russian is, whether the English shows under it,
   and starting the conversation over — which used to be a link under the
   input, where it sat beside the microphone as though it were a control you
   might want mid-sentence. `talkLevel` and `talkEn` are Talk's own keys, so
   the two tutors cannot end up pitched differently. */
function TutorOptions({ onClose, onRestart }) {
  const { st, update } = useSession();
  const t = useTheme();
  const level = talkLevelFor(st);
  const en = st.talkEn !== false;
  return (
    <Sheet onClose={onClose} testID="tutor-options"
           footer={<Btn kind="pri" label="Done" style={{ marginTop: 8 }} onPress={onClose} />}>
      <View style={{ marginBottom: 18 }}>
        <SectionLabel>Level</SectionLabel>
        <Choice testID="tutor-level" options={TALK_LEVELS} value={level}
                onPick={(id) => update((p) => ({ ...p, talkLevel: id }))} />
      </View>
      <View style={{ marginBottom: 18 }}>
        <List>
          <Row testID="tutor-en-row" onPress={() => update((p) => ({ ...p, talkEn: !en }))}>
            <Tick on={en} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 15 }}>English under the Russian</Text>
            </View>
          </Row>
        </List>
      </View>
      <Btn kind="plain" testID="tutor-restart" label="Start over" onPress={onRestart} />
    </Sheet>
  );
}

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
  const [cog, setCog] = useState(false);
  /* Conversation mode: the microphone opens itself after each of the tutor's
     turns and closes when the learner stops speaking (the owner, 2026-09-26:
     *"conversation mode where it just goes back and forth and you dont have
     to hold the mic"*).
     **It is one visible control, not a setting** — *"conversation mode doesn't
     have to be hidden in the settings. Think about Claude's own conversation
     mode with the little icon by itself. When that's on, you can just go back
     and forth with the AI."* So the icon beside the microphone is the whole
     mechanism: pressing it starts the exchange, pressing it again ends it.
     Nothing is persisted, because a microphone that opens itself the moment a
     screen is opened is not something to inherit from last week. */
  const [going, setGoing] = useState(false);
  const goingRef = useRef(false);
  const setLoop = (on) => { goingRef.current = on; setGoing(on); };
  /* Turns in a row where nobody said anything. Two and the loop stops: a
     microphone that reopens for ever because the room is empty is the one
     failure conversation mode must not have. */
  const quiets = useRef(0);
  /* Tutor turns in a row that came back not knowing what the learner wants. */
  const unsure = useRef(0);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const alive = useRef(true);
  const configured = !!config("/v1/tutor");
  useEffect(() => () => { alive.current = false; goingRef.current = false; stop(); }, []);

  /* One turn: the profile, the studied words, the exchange so far and what
     was just said. The tutor's note, if any, goes into the profile as it
     arrives — a fact about the learner is worth keeping even if this
     conversation is abandoned a moment later. */
  const ask = async (history, text) => {
    /* **Only the newest turn may open the microphone.** `ask` waits twice —
       on the Worker, then on the tutor finishing speaking — and a turn
       suspended at the second await can be resumed out of order, because
       starting a new line stops the one before it and a stopped line resolves.
       An older turn reaching its tail would then start listening underneath
       the current one: two microphones, two sends. The ticket is §23's rule
       for `playTrack` applied to a conversation — an attempt has to be able to
       learn it was superseded. */
    const mine = askSeq.current + 1;
    askSeq.current = mine;
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
    /* Sending choices is the tutor saying it does not know what is wanted.
       The run of those is counted here and the list is only carried onto the
       turn once it has happened CHOICES_AFTER times in a row. */
    const suggested = Array.isArray(reply.choices) ? reply.choices : [];
    unsure.current = suggested.length ? unsure.current + 1 : 0;
    const turn = { who: "tutor", ru: reply.ru || "", en: reply.en || "", note: reply.note || "",
                   choices: unsure.current >= CHOICES_AFTER ? suggested : [] };
    // The Worker refuses a turn with nothing in it; this is the app refusing too.
    if (!turn.ru && !turn.note) { setFailure(failureText({ ok: false, reason: "parse", errors: ["empty turn"] })); return; }
    setTurns((prev) => prev.concat([turn]));
    if (reply.remember) {
      update((prev) => ({ ...prev, tutorNotes: remember(prev.tutorNotes, reply.remember) }));
    }
    /* **Speak, then listen — never both.** The recogniser and the TTS engine
       contend for one audio session, and a microphone open under a speaker
       hears the speaker (§30h′). `speakLine` resolves when it has finished,
       which is the handshake the loop turns on. */
    if (turn.ru) { speakingRef.current = true; await speakLine(turn.ru); speakingRef.current = false; }
    if (!alive.current || askSeq.current !== mine) return;
    /* `ask` reaches the recogniser through a ref because a conversation is a
       cycle — the reply starts the listening that produces the next reply —
       and the hook is created below. */
    if (goingRef.current && recRef.current) recRef.current.listen(HEARS_BOTH);
  };
  const recRef = useRef(null);
  const askSeq = useRef(0);
  /* Whether the tutor is mid-sentence. Entering conversation mode while it is
     talking must not open the microphone under it (§30h′); the turn already
     in flight opens it when it finishes. */
  const speakingRef = useRef(false);

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
    /* Not gated on `pending`: the loop reopens the microphone from inside a
       turn that has just finished, and a stale `enabled` captured while the
       request was in flight would silently swallow that call. The hold button
       is gated at its own handler instead. */
    enabled: configured,
    onFinal: (transcript) => {
      quiets.current = 0;
      const s = String(transcript || "").trim();
      /* Heard, but nothing in it. In conversation mode that is a silent turn
         like any other rather than a dead press. */
      if (!s) { if (goingRef.current) listenAgain(); return; }
      send(s);
    },
    /* A turn where nobody spoke: listen once more, then stop and say so. */
    onQuiet: () => {
      if (!goingRef.current) return;
      quiets.current += 1;
      if (quiets.current >= QUIET_LIMIT) { setLoop(false); return; }
      listenAgain();
    },
  });
  recRef.current = rec;
  /* A beat before reopening, so the end of one attempt and the start of the
     next are not the same moment to the audio session. */
  const listenAgain = () => setTimeout(() => {
    if (alive.current && goingRef.current) rec.listen(HEARS_BOTH);
  }, 300);

  /* Starting and stopping the conversation. Stopping puts the microphone down
     at once rather than after the attempt in flight: the learner pressed stop. */
  const toggleLoop = () => {
    if (goingRef.current) { setLoop(false); rec.cancel(); return; }
    quiets.current = 0;
    setLoop(true);
    /* Start listening now unless the tutor is still working or talking, in
       which case the turn in flight opens the microphone when it is done. */
    if (!pending && !speakingRef.current) rec.listen(HEARS_BOTH);
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollToEnd({ animated: true });
  }, [turns.length, pending]);

  const restart = () => {
    const go = () => {
      setCog(false); setLoop(false); rec.cancel();
      unsure.current = 0;
      setTurns([]); setFailure(null); ask([], "");
    };
    if (turns.some((x) => x.who === "learner")) {
      Alert.alert("Start over?", "This conversation is wiped.",
                  [{ text: "Keep going", style: "cancel" }, { text: "Restart", style: "destructive", onPress: go }]);
    } else go();
  };

  const last = [...turns].reverse().find((x) => x.who === "learner");
  /* The choices of the newest turn, and only while it is the newest. */
  const tail = turns[turns.length - 1];
  const offered = tail && tail.who === "tutor" && Array.isArray(tail.choices) ? tail.choices : [];

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, padding: space.pad }}>
        {!configured ? (
          <Muted testID="tutor-unconfigured" style={{ marginBottom: 12 }}>
            The tutor is not available in this build.
          </Muted>
        ) : null}
        {/* The cog sits above the transcript, where the drills and Study put
            theirs — options belong to the screen, not to the header. */}
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginBottom: 6 }}>
          {/* The rules, one tap away mid-conversation (the owner, 2026-09-27:
              a lightbulb wherever a skill is being asked for). A conversation
              has no one word to hold up — every Russian word in it is already
              two presses from its own entry — so what the bulb offers here is
              the reference itself. */}
          <BulbButton testID="tutor-bulb" label="The rules"
                      onPress={() => navigation.navigate("Grammar")} />
          <CogButton testID="tutor-cog" label="Tutor options" onPress={() => setCog(true)} />
        </View>
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}
                    keyboardShouldPersistTaps="handled">
          {turns.map((x, k) => (x.who === "tutor" ? <TutorBubble key={k} turn={x} en={en} /> : <LearnerBubble key={k} turn={x} />))}
          {/* Only on the turn that offered them: a list from three exchanges
              ago is not a thing to still be tappable. */}
          {!pending && offered.length ? (
            <Choices choices={offered} onPick={send} onOther={() => inputRef.current && inputRef.current.focus()} />
          ) : null}
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
                ref={inputRef}
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
              {/* The whole of conversation mode: one icon, on or off. */}
              <ConverseToggle on={going} onPress={toggleLoop} />
              {/* On, the hold is replaced by what the exchange is doing —
                  listening, thinking, speaking — and pressing it also ends the
                  conversation, because the thing under your thumb should be
                  the thing you want to stop. */}
              {going ? (
                <Pressable testID="tutor-loop" accessibilityRole="button"
                           accessibilityLabel="Stop the conversation"
                           onPress={toggleLoop} hitSlop={8}
                           style={({ pressed }) => ({ width: 60, height: 60, borderRadius: 30,
                             alignItems: "center", justifyContent: "center", borderWidth: 1,
                             borderColor: t.brand,
                             backgroundColor: rec.phase === "listening" ? t.brand : t.brandBg,
                             opacity: pressed ? 0.7 : 1 })}>
                  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none"
                       stroke={rec.phase === "listening" ? t.brandOn : t.brandInk}
                       strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M7 7h10v10H7z" />
                  </Svg>
                </Pressable>
              ) : (
                <HoldButton testID="tutor-hold" phase={rec.phase} size={60}
                            onIn={() => !pending && rec.hold({ lang })} onOut={rec.release} />
              )}
              {/* The toggle picks the language for *held* speech. In
                  conversation mode both are live, so a control that chooses
                  between them would be a control that does nothing. */}
              {going ? <View style={{ width: 44 }} />
                : <LangToggle lang={lang} onPress={() => setLang(lang === LANG ? LANG_EN : LANG)} />}
            </View>
            <Text testID="tutor-live"
                  style={{ color: t.ink, fontSize: 15, minHeight: 20, textAlign: "center", marginTop: 4 }}>
              {rec.phase === "listening" ? (rec.live || "Listening…")
                : going && pending ? "Thinking…"
                : going ? "Speaking…"
                : rec.note || ""}
            </Text>
          </View>
        )}
      </View>
      {cog ? <TutorOptions onClose={() => setCog(false)} onRestart={restart} /> : null}
    </Screen>
  );
}
