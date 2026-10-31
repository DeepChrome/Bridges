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
import { View, Pressable, ActivityIndicator } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme, radius, type as T } from "./theme";
import { Sheet, Text, TextInput, Muted, Btn, Note, IconButton, ChatTurn, CHAT_FACE } from "./ui";
import { GUIDE_ID, castById } from "@core/cast";
import { useSession } from "./session";
import { routePosition } from "./data";
import { ask, config, isCap, capNotice } from "./lib/feedback";
import { talkLevelFor } from "./screens/Talk";
import { screenAbout } from "./about";
import { navRef } from "./words";
import { GuidePop } from "./guide";

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

  const open = () => {
    const a = screenAbout();
    const k = mode === "app" ? JSON.stringify([a.screen]) : threadKey(a);
    if (k !== key.current) { key.current = k; setThread([]); setFailed(null); }
    about.current = a;
    return a;
  };

  const send = async () => {
    const question = text.trim();
    if (!question || busy) return;
    setBusy(true); setFailed(null);
    const a = about.current || screenAbout();
    const r = await ask(mode === "app"
      ? { mode, question, screen: a.title || a.screen, guide: guide ? guide(a) : "", history: thread }
      : { question, screen: a.screen, about: aboutForAsk(a), level: talkLevelFor(st),
          chapter: routePosition(st).stage + 1, history: thread });
    setBusy(false);
    if (r && r.ok === true && typeof r.answer === "string") {
      setThread((h) => [...h, { q: question, a: r.answer }]);
      setText("");
    } else {
      setFailed(failureLine(r));
    }
  };

  return { thread, text, setText, busy, failed, open, send };
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
          <ChatTurn testID={`${prefix}-reply-${k}`} side="left" avatar={castById[GUIDE_ID].avatar}>
            <Note text={h.a} size={T.body} testID={`${prefix}-answer-${k}`} />
          </ChatTurn>
        </View>
      ))}
      {busy ? <ActivityIndicator testID={`${prefix}-busy`} color={t.brand} style={{ alignSelf: "flex-start", marginLeft: CHAT_FACE + 8 }} /> : null}
    </View>
  );
}

/* The box and its button, for a sheet's footer, so the keyboard lifts it. */
export function AskInput({ th, placeholder, prefix = "ask", autoFocus }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: 10, gap: 8 }}>
      {th.failed ? <Muted testID={`${prefix}-failed`} style={{ color: t.bad }}>{th.failed}</Muted> : null}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
        <TextInput testID={`${prefix}-input`} value={th.text} onChangeText={th.setText} multiline
                   autoFocus={autoFocus}
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

/* Exercise screens carry the sparkle and the flag in the exercise, beside the
   speaker and the bulb (the owner, 2026-10-08: "the AI button should be lower
   so it looks like it's referenceable in the exercise… throw the flag down
   there for reporting too"), so the header leaves them out there. Every other
   screen keeps them in the header. `RunTools` is the pair. */
export const INLINE_TOOLS = new Set(["Vocab", "Quiz", "GrammarRun", "CaseRun", "Recap", "VideoQuiz",
  "Scenes", "TestOut", "Final", "Placement", "CustomQuiz", "SoundDrill", "BuildDrill", "Shadow", "Drill",
  "WordDrill", "Cards", "ListCards"]);

/* Header size, or a disc like the bulb's: `disc` true for 40 px, or the
   size itself (an exercise's row is larger — Run.js TOOL_SIZE). */
const discSize = (disc) => (disc === true ? 40 : typeof disc === "number" ? disc : 0);
// The disc is ui.js's IconButton; a header glyph has no box.
const iconBox = () => ({ marginRight: 6, width: 30, height: 30, alignItems: "center", justifyContent: "center" });

/* The glyph in a disc (an exercise's row) or bare (a header). */
function Disc({ disc, onPress, testID, label, children }) {
  const t = useTheme();
  if (disc) {
    return (
      <IconButton onPress={onPress} testID={testID} label={label} size={discSize(disc)}>{children}</IconButton>
    );
  }
  return (
    <Pressable onPress={onPress} hitSlop={8} testID={testID} accessibilityRole="button" accessibilityLabel={label}
               style={iconBox(t, false)}>
      {children}
    </Pressable>
  );
}

export function AskButton({ disc }) {
  const t = useTheme();
  const th = useAskThread();
  const [open, setOpen] = useState(false);
  if (!aiOffered()) return null;
  const size = disc ? Math.round(discSize(disc) / 2) : 22;
  return (
    <>
      <Disc disc={disc} onPress={() => { th.open(); setOpen(true); }} testID="ask-button"
            label="Ask the AI about the Russian here">
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={t.brand}
             strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8z" />
          <Path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
        </Svg>
      </Disc>
      {open ? (
        /* Teddy asks (the owner, 2026-10-08: "an avatar of teddy asking 'how
           can I help' and looking cute") — he is the voice of the app's help,
           and the tutor already speaks as him (§30bg). */
        /* Tall: a conversation, not a glance. It opened at the height of its
           first line and the owner read it as "subtle on the bottom fifth of
           the screen" (2026-10-13). */
        <Sheet testID="ask-sheet" onClose={() => setOpen(false)} tall
               header={(
                 <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
                   <GuidePop pose="wave" size={64} />
                   <Text testID="ask-hello" style={{ color: t.ink, fontSize: T.head, fontWeight: "700" }}>
                     How can I help?
                   </Text>
                 </View>
               )}
               footer={<AskInput th={th} placeholder="Why is it «книгу» here?" autoFocus />}>
          <AskTurns thread={th.thread} busy={th.busy} />
        </Sheet>
      ) : null}
    </>
  );
}

/* The beta's report flag (the owner, 2026-10-05: "a feedback option for this
   Beta… feedback on specific questions"). It captures what is on screen at
   the moment it is pressed — the route, its title, and the question about.js
   holds — and opens the report with that attached. */
export function ReportButton({ disc }) {
  const t = useTheme();
  const open = () => {
    const about = screenAbout();
    if (navRef.isReady && navRef.isReady()) navRef.navigate("Feedback", { about, from: about.screen });
  };
  const size = disc ? Math.round(discSize(disc) * 0.48) : 21;
  const glyph = (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={t.ink2}
         strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 21V4M5 4h11l-2 4 2 4H5" />
    </Svg>
  );
  if (disc) {
    return <IconButton testID="report-button" onPress={open} label="Report a problem" size={discSize(disc)}>{glyph}</IconButton>;
  }
  return (
    <Pressable testID="report-button" onPress={open} hitSlop={8}
               accessibilityRole="button" accessibilityLabel="Report a problem"
               style={{ marginRight: 12, width: 30, height: 30, alignItems: "center", justifyContent: "center" }}>
      {glyph}
    </Pressable>
  );
}

/* The two in an exercise's own row, at that row's size. */
export function RunTools({ size = 40 }) {
  return (
    <>
      <AskButton disc={size} />
      <ReportButton disc={size} />
    </>
  );
}
