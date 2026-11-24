/* The two header buttons that ask the AI (the owner, 2026-10-08: "a button on
 * just about every exercise and maybe every screen… they can submit a question
 * and receive AI response"; then "one is for getting feedback on the specific
 * question and the other needs to be for how to use and interact with the
 * interface"; then of the "?": "if you can't make it better or more useful,
 * just delete it").
 *
 * - The sparkle (`AskButton`) asks about the Russian on screen. What rides
 *   along is about.js's one reading of the screen — the question card as
 *   drawn, what the learner put, the word or video open — so "why this
 *   ending?" is answered for the sentence in front of them.
 * - The "?" (help.js) asks how to use the app, `mode: "app"`, and sends the
 *   map of the app (`APP_GUIDE`) with this screen's own lines; the Worker
 *   answers from that alone, so it cannot describe a button that is not there
 *   (backend/src/ask.js).
 *
 * Both draw one thread (`AskThread`). It belongs to what was on screen when
 * it was asked: open the sheet on another question and it starts empty.
 * Nothing is kept and nothing is graded. A failed request keeps the
 * learner's words in the box. */

import React, { useRef, useState } from "react";
import { View, Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme, radius, type as T } from "./theme";
import { Sheet, Text, TextInput, Muted, Btn, Note, ChatTurn, TypingTurn } from "./ui";
import { GUIDE_ID, castById } from "@core/cast";
import { useSession } from "./session";
import { routePosition } from "./data";
import { ask, config, isCap, capNotice } from "./lib/feedback";
import { talkLevelFor } from "./screens/Talk";
import { screenAbout } from "./about";
import { groundQuestion, unknownIn } from "./groundask";
import { GuidePop } from "./guide";
import { useConverse } from "./converse";
import { LangToggle, ConverseToggle } from "./mic";
import { HoldButton, Blocked } from "./activities/Say";
import { HeaderButton } from "./headermenu";

export const aiOffered = () => !!config("/v1/ask");

/* The screen's identity for a thread: the route and the question on it. */
const threadKey = (a) => JSON.stringify([a.screen, a.params, a.question && a.question.prompt, a.question && a.question.step]);

/* The context sent: the question card when there is one, else what the
   screen is showing (a word entry, a video, a grammar topic). */
function aboutForAsk(a) {
  const q = a.question || {};
  return {
    kind: q.kind, ask: q.ask, prompt: q.prompt, sub: q.sub, answer: q.answer, said: q.said,
    options: q.options, word: q.word || a.params.word,
    title: a.video || a.title || a.unit, topic: a.params.topic || a.params.caseId,
    // The rest of a card or an entry — meanings and example sentences — so a
    // question about "the third example" is about the one on screen.
    card: q.card,
    // The running text a screen shows — a rule card, a conversation's lines, a
    // word list, a grammar page — where it has one (about.js noteText, linesText).
    text: q.text,
  };
}

function failureLine(r) {
  if (isCap(r)) { const n = capNotice(r); return `${n.text} · ${n.detail}`; }
  if (r && (r.reason === "offline" || r.reason === "timeout")) return "No connection";
  return "No answer this time";
}

/* One conversation with the model, tied to the screen it was opened on.
   `guide(about)` gives the "?" its map; the sparkle sends none. */
export function useAskThread({ mode = "russian", guide } = {}) {
  const { st } = useSession();
  const [thread, setThread] = useState([]);     // { q, a }
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(null);
  const key = useRef(null);
  const about = useRef(null);
  const threadRef = useRef(thread);
  threadRef.current = thread;

  const open = () => {
    const a = screenAbout();
    const k = mode === "app" ? JSON.stringify([a.screen]) : threadKey(a);
    if (k !== key.current) { key.current = k; setThread([]); setFailed(null); }
    about.current = a;
    return a;
  };

  /* The question leaves the box the moment it is sent and sits in the thread
     with Teddy typing under it; a reply that never comes takes it out of the
     thread and puts the words back in the box, so they can be sent again
     (the owner, 2026-11-10: "the text just pauses and stays there").
     `sendText(question, { converse })` is a spoken question (converse.js):
     the words were never in the box, so a failure puts them there; the
     answer comes back to the caller to be read aloud. */
  const sendText = async (question, { converse = false } = {}) => {
    question = String(question || "").trim();
    if (!question || busy) return null;
    setBusy(true); setFailed(null); setText("");
    const history = threadRef.current.map(({ q, a }) => ({ q, a }));
    setThread((h) => [...h, { q: question, a: null }]);
    const a = about.current || screenAbout();
    let r, unchecked = [];
    if (mode === "app") {
      r = await ask({ mode, question, screen: a.title || a.screen, guide: guide ? guide(a) : "", history });
    } else {
      /* Grounded in the app's own dictionary, and the answer's Russian checked
         against it (groundask.js): a made-up form is asked about once more,
         and anything still unrecognised is said under the answer. */
      const about = aboutForAsk(a);
      const grounded = groundQuestion(question, about);
      const body = { question, screen: a.screen, about, level: talkLevelFor(st),
                     chapter: routePosition(st).stage + 1, history, converse,
                     dictionary: grounded.dictionary, notWords: grounded.notWords };
      r = await ask(body);
      if (r && r.ok === true && typeof r.answer === "string") {
        unchecked = unknownIn(r.answer, question, grounded);
        if (unchecked.length) {
          const again = await ask({ ...body, invalid: unchecked, previous: r.answer });
          if (again && again.ok === true && typeof again.answer === "string") {
            r = again;
            unchecked = unknownIn(again.answer, question, grounded);
          }
        }
      }
    }
    setBusy(false);
    if (r && r.ok === true && typeof r.answer === "string") {
      setThread((h) => h.map((x) => (x.q === question && x.a === null ? { q: question, a: r.answer, unchecked } : x)));
      return r.answer;
    }
    setThread((h) => h.filter((x) => x.a !== null));
    setText(question);
    setFailed(failureLine(r));
    return null;
  };
  const send = () => sendText(text);

  return { thread, text, setText, busy, failed, open, send, sendText };
}

/* The turns, newest last, drawn as a text conversation like the tutor's
   (§30cd; the owner, 2026-10-15: "It should be for all the AI
   interactions"): the learner's question on the right with their own face,
   Teddy's answer on the left with his. */
export function AskTurns({ thread, busy, prefix = "ask" }) {
  const t = useTheme();
  const { account } = useSession();
  if (!thread.length && !busy) return null;
  return (
    <View style={{ paddingBottom: 4 }}>
      {thread.map((h, k) => (
        <View key={k} testID={`${prefix}-turn-${k}`}>
          <ChatTurn testID={`${prefix}-question-${k}`} side="right" avatar={account ? account.avatar : null}>
            <Text style={{ color: t.ink, fontSize: T.body, lineHeight: 22 }}>{h.q}</Text>
          </ChatTurn>
          {h.a === null ? (
            <TypingTurn testID={`${prefix}-busy`} avatar={castById[GUIDE_ID].avatar} />
          ) : (
            <ChatTurn testID={`${prefix}-reply-${k}`} side="left" avatar={castById[GUIDE_ID].avatar}
                      below={h.unchecked && h.unchecked.length ? (
                        <Muted testID={`${prefix}-unchecked-${k}`} size={T.small}>
                          {`Not in the dictionary: ${h.unchecked.map((w) => `«${w}»`).join(", ")}`}
                        </Muted>
                      ) : null}>
              <Note text={h.a} size={T.body} testID={`${prefix}-answer-${k}`} />
            </ChatTurn>
          )}
        </View>
      ))}
    </View>
  );
}

/* The box and its button, for a sheet's footer, so the keyboard lifts it.
   `voice` (converse.js useConverse) adds the row under it: conversation mode,
   hold to speak, and the language the microphone hears (the owner,
   2026-11-19). */
export function AskInput({ th, placeholder, prefix = "ask", autoFocus, voice }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: 10, gap: 8 }}>
      {th.failed ? <Muted testID={`${prefix}-failed`} style={{ color: t.bad }}>{th.failed}</Muted> : null}
      {voice ? (
        voice.rec.block ? (
          <Blocked block={voice.rec.block} onGetModel={voice.rec.getModel} onSkip={voice.rec.clearBlock} skipLabel="Type instead" />
        ) : (
          <View style={{ alignItems: "center", gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14 }}>
              <ConverseToggle testID={`${prefix}-converse`} on={voice.going} onPress={voice.toggle} />
              {voice.going ? (
                <Pressable testID={`${prefix}-loop`} accessibilityRole="button" accessibilityLabel="Stop the conversation"
                           onPress={voice.toggle} hitSlop={8}
                           style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 28, alignItems: "center",
                             justifyContent: "center", borderWidth: 1, borderColor: t.brand,
                             backgroundColor: voice.rec.phase === "listening" ? t.brand : t.brandBg, opacity: pressed ? 0.7 : 1 })}>
                  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"
                       stroke={voice.rec.phase === "listening" ? t.brandOn : t.brandInk} strokeWidth={2}
                       strokeLinecap="round" strokeLinejoin="round"><Path d="M7 7h10v10H7z" /></Svg>
                </Pressable>
              ) : (
                <HoldButton testID={`${prefix}-hold`} phase={voice.rec.phase} size={56}
                            onIn={voice.hold} onOut={voice.release} />
              )}
              {voice.going ? <View style={{ width: 44 }} />
                : <LangToggle testID={`${prefix}-lang`} lang={voice.lang} onPress={voice.flipLang} />}
            </View>
            <Text testID={`${prefix}-live`} numberOfLines={1}
                  style={{ color: t.ink2, fontSize: 13, minHeight: 18, textAlign: "center" }}>{voice.status}</Text>
          </View>
        )
      ) : null}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
        {/* Enter sends (the owner, 2026-11-10); the box still wraps a long
            question. `submitBehavior` is what lets a multiline field submit
            on the return key instead of taking a newline. */}
        <TextInput testID={`${prefix}-input`} value={th.text} onChangeText={th.setText} multiline
                   autoFocus={autoFocus} returnKeyType="send" submitBehavior="submit"
                   onSubmitEditing={th.send}
                   placeholder={th.thread.length ? "Ask more" : placeholder}
                   placeholderTextColor={t.ink3} textAlignVertical="top"
                   style={{ flex: 1, minHeight: 44, maxHeight: 120, color: t.ink, fontSize: T.body,
                            backgroundColor: t.surface, borderWidth: 1, borderColor: t.line,
                            borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 }} />
        <Btn testID={`${prefix}-send`} label="Ask" onPress={th.send} disabled={th.busy || !th.text.trim()}
             style={{ minWidth: 72 }} />
      </View>
    </View>
  );
}

/* The sparkle, in the header of every screen (the owner, 2026-11-19: "the top
   menu items… should be the same for every slide"). From 2026-10-08 to then
   an exercise carried it in its own row beside the speaker and the bulb
   (`RunTools`), and the header changed shape from screen to screen. */
export function AskButton() {
  const t = useTheme();
  const th = useAskThread();
  const [open, setOpen] = useState(false);
  /* Spoken questions and the hands-free exchange (converse.js): a turn is
     sent as a question of this screen with `converse` set, so the model may
     answer with a question of its own about what is on it. */
  const voice = useConverse({
    enabled: open,
    onTurn: (text) => th.sendText(text, { converse: true }),
  });
  /* Faint, not gone, in a build with no Worker: the toolbar is the same on
     every screen and in every build (headermenu.js). */
  const off = !aiOffered();
  return (
    <>
      <HeaderButton testID="ask-button" label="Ask the AI about the Russian here" off={off}
                    onPress={() => { if (off) return; th.open(); setOpen(true); }}>
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={t.brand}
             strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8z" />
          <Path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
        </Svg>
      </HeaderButton>
      {open ? (
        /* Teddy asks (the owner, 2026-10-08: "an avatar of teddy asking 'how
           can I help' and looking cute") — he is the voice of the app's help,
           and the tutor already speaks as him (§30bg). */
        /* Tall: a conversation, not a glance. It opened at the height of its
           first line and the owner read it as "subtle on the bottom fifth of
           the screen" (2026-10-13). */
        <Sheet testID="ask-sheet" onClose={() => { if (voice.going) voice.toggle(); setOpen(false); }} tall
               header={(
                 <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
                   <GuidePop pose="wave" size={64} />
                   <Text testID="ask-hello" style={{ color: t.ink, fontSize: T.head, fontWeight: "700" }}>
                     How can I help?
                   </Text>
                 </View>
               )}
               footer={<AskInput th={th} placeholder="Why is it «книгу» here?" voice={voice} />}>
          <AskTurns thread={th.thread} busy={th.busy} />
        </Sheet>
      ) : null}
    </>
  );
}

