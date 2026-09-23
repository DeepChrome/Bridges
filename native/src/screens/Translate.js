/* The interpreter: Russian in, English out — and English in, Russian out.
 *
 * The owner, 2026-09-22: *"add a feature where you can just speak in Russian to
 * it and it will live translate to english"*; and 2026-09-23: *"conversation
 * mode so it can help a Russian speaker and an English speaker communicate
 * more easily in their native language"*. One screen does both, because they
 * are one thing: two microphones at the foot, one for each language, and every
 * utterance comes back in the other language, on screen and **read aloud** —
 * the person on the other side of the phone hears their answer rather than
 * reading it off a stranger's screen.
 *
 * **Two answers, and the app owes the first one whatever happens.** The phone
 * hears the words on-device (§30c — audio never leaves it), so the transcript
 * is always there, and the Russian in it — said or answered — is `Linked`: tap
 * a word and the dictionary the app already carries says what it is and what
 * form it is in, with no network at all. That is the word-by-word reading, and
 * it is the half this app is actually good at.
 *
 * The **sentence** is the Worker's (§30d). «Мне не до этого» is four words the
 * dictionary knows and one thing it cannot say, which is the whole argument for
 * asking a model. When there is no connection, or no Worker in this build, the
 * screen says so once and the transcript stays.
 *
 * **It translates; it does not mark.** Say and Talk are the exercises and they
 * grade. This is a tool: nothing is scored, nothing enters the scheduler,
 * nothing is praised. A learner reaching for it in the middle of a conversation
 * wants an answer, not a lesson — and a tool that teaches at you is one nobody
 * opens twice.
 */

import React, { useState, useEffect, useRef } from "react";
import { View, ScrollView, Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme, radius } from "../theme";
import { Screen, Card, Muted, Text } from "../ui";
import { Linked } from "../words";
import { useRecognizer, LANG, LANG_EN } from "../speech";
import { HoldButton, Blocked } from "../activities/Say";
import { translate as askWorker, config } from "../lib/feedback";
import { speakLine, stop } from "../audio";

/* How many exchanges stay on screen. They are not kept anywhere: leaving the
   screen forgets them, because a translation is a thing you needed once and a
   list of them is a log nobody asked the app to keep. */
export const KEEP = 12;

/* The two sides. `from` is what was said, `to` is what comes back; the
   recogniser's tag and the voice's tag are the same two languages. */
const SIDES = {
  ru: { lang: LANG, to: "en", label: "Русский" },
  en: { lang: LANG_EN, to: "ru", label: "English" },
};

/* A word-linked line when it is Russian, a plain one when it is English. */
function Line({ text, lang, size, testID }) {
  const t = useTheme();
  if (lang === "ru") {
    return (
      <View testID={testID}>
        <Linked text={text} size={size} />
      </View>
    );
  }
  return <Text testID={testID} style={{ color: t.ink, fontSize: size }}>{text}</Text>;
}

/* Hear the answer again, in whichever language it is in. Not `Speaker`: that
   one is the Russian collection's button and labels its recordings (§27), and
   a generated sentence has no recording in either language. */
function Replay({ text, lang }) {
  const t = useTheme();
  return (
    <Pressable
      testID={`translate-replay-${lang}`}
      accessibilityRole="button"
      accessibilityLabel="Hear it again"
      onPress={() => speakLine(text, { lang })}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: t.line,
        alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1,
      })}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={t.ink2}
           strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M11 5L6 9H2v6h4l5 4V5z" />
        <Path d="M15.5 8.5a5 5 0 0 1 0 7" />
      </Svg>
    </Pressable>
  );
}

export default function Translate({ navigation }) {
  const t = useTheme();
  const [rows, setRows] = useState([]);       // newest first: { id, from, src, out, note, state }
  const [side, setSide] = useState("ru");     // which microphone is held
  const offered = !!config("/v1/translate");
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; stop(); }, []);

  const rec = useRecognizer({
    enabled: true,
    onFinal: async (transcript, _ms, _alts, lang) => {
      const src = (transcript || "").trim();
      if (!src) return;
      const from = lang === LANG_EN ? "en" : "ru";
      const to = SIDES[from].to;
      const id = Date.now() + ":" + src;
      const put = (patch) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      setRows((prev) => [{ id, from, to, src, out: "", note: "", state: offered ? "asking" : "offline" },
                         ...prev].slice(0, KEEP));
      if (!offered) return;
      const res = await askWorker(from === "ru" ? { ru: src } : { en: src });
      if (!alive.current) return;
      /* A failure is said on the row it belongs to and nowhere else — the
         words above it are still right, and the Russian still tappable. */
      if (res && res.ok) {
        const out = res[to] || "";
        put({ out, note: res.note || "", state: "done" });
        /* Read aloud on arrival, in the other language: this is the half of
           the exchange the other person gets, and they are not looking at
           the screen. */
        if (out) speakLine(out, { lang: to });
      } else {
        put({ state: "failed" });
      }
    },
  });

  if (rec.block) {
    return (
      <Screen title="Translate">
        <Blocked block={rec.block} onGetModel={rec.getModel}
                 onSkip={() => navigation.goBack()} skipLabel="Go back" />
      </Screen>
    );
  }

  const hold = (s) => () => { setSide(s); rec.hold({ lang: SIDES[s].lang }); };

  return (
    <Screen title="Translate" scroll={false}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
        {rows.length === 0 ? (
          /* One line, and it is an instruction for a control that has no other
             way of saying what it wants (rule 20.7): a microphone the learner
             must *hold* rather than tap is not something a picture discloses. */
          <Muted testID="translate-empty" style={{ textAlign: "center", marginTop: 24 }}>
            Hold a microphone and speak.
          </Muted>
        ) : null}
        {rows.map((r) => (
          <Card key={r.id} testID="translate-row" style={{ marginBottom: 10 }}>
            {/* What was said, quietly; the answer is the thing. */}
            <Line text={r.src} lang={r.from} size={15} testID={`translate-src-${r.from}`} />
            {r.state === "asking" ? (
              <Muted testID="translate-asking" style={{ marginTop: 6 }}>Translating…</Muted>
            ) : r.state === "failed" ? (
              <Muted testID="translate-failed" style={{ marginTop: 6 }}>No translation right now.</Muted>
            ) : r.state === "offline" ? (
              <Muted testID="translate-offline" style={{ marginTop: 6 }}>Tap a word for its meaning.</Muted>
            ) : (
              <>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 8 }}>
                  <View style={{ flex: 1 }}>
                    {r.out ? (
                      <Line text={r.out} lang={r.to} size={20} testID={`translate-${r.to}`} />
                    ) : null}
                  </View>
                  {r.out ? <Replay text={r.out} lang={r.to} /> : null}
                </View>
                {r.note ? (
                  <Muted testID="translate-note" style={{ marginTop: 4, fontStyle: "italic" }}>
                    {r.note}
                  </Muted>
                ) : null}
              </>
            )}
          </Card>
        ))}
      </ScrollView>

      {/* Two microphones at the foot, where the thumbs are — one each side of
          the conversation — and they stay put as the answers pile up above
          them (§30ak: the thing to touch goes low). */}
      <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: t.lineSoft,
                     borderRadius: radius.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-evenly" }}>
          <HoldButton testID="hold-ru" label={SIDES.ru.label} phase={rec.phase}
                      active={side === "ru"} onIn={hold("ru")} onOut={rec.release} />
          <HoldButton testID="hold-en" label={SIDES.en.label} phase={rec.phase}
                      active={side === "en"} onIn={hold("en")} onOut={rec.release} />
        </View>
        <Text testID="translate-live"
              style={{ color: t.ink, fontSize: 17, marginTop: 10, minHeight: 24, textAlign: "center" }}>
          {rec.phase === "listening" ? rec.live : rec.live || rec.note || ""}
        </Text>
      </View>
    </Screen>
  );
}
