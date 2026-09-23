/* Say something in Russian, read it back in English.
 *
 * The owner, 2026-09-22: *"add a feature where you can just speak in Russian to
 * it and it will live translate to english"*.
 *
 * **Two answers, and the app owes the first one whatever happens.** The phone
 * hears the Russian on-device (§30c — audio never leaves it), so the transcript
 * is always there, and every word in it is a `Linked` word: tap one and the
 * dictionary the app already carries says what it is and what form it is in,
 * with no network at all. That is the word-by-word reading, and it is the half
 * this app is actually good at.
 *
 * The **sentence** is the Worker's (§30d). «Мне не до этого» is four words the
 * dictionary knows and one thing it cannot say, which is the whole argument for
 * asking a model. When there is no connection, or no Worker in this build, the
 * screen says so once and the Russian and its glosses stay.
 *
 * **It translates; it does not mark.** Say and Talk are the exercises and they
 * grade. This is a tool: nothing is scored, nothing enters the scheduler,
 * nothing is praised. A learner reaching for it in the middle of a conversation
 * wants an answer, not a lesson — and a tool that teaches at you is one nobody
 * opens twice.
 */

import React, { useState } from "react";
import { View, ScrollView } from "react-native";
import { useTheme, radius } from "../theme";
import { Screen, Card, Btn, Muted, Speaker, Text } from "../ui";
import { Linked } from "../words";
import { useRecognizer } from "../speech";
import { HoldButton, Blocked } from "../activities/Say";
import { translate as askWorker, config } from "../lib/feedback";

/* How many exchanges stay on screen. They are not kept anywhere: leaving the
   screen forgets them, because a translation is a thing you needed once and a
   list of them is a log nobody asked the app to keep. */
export const KEEP = 12;

export default function Translate({ navigation }) {
  const t = useTheme();
  const [rows, setRows] = useState([]);       // newest first: { ru, en, note, state }
  const offered = !!config("/v1/translate");

  const rec = useRecognizer({
    enabled: true,
    onFinal: async (transcript) => {
      const ru = (transcript || "").trim();
      if (!ru) return;
      const id = Date.now() + ":" + ru;
      const put = (patch) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      setRows((prev) => [{ id, ru, en: "", note: "", state: offered ? "asking" : "offline" },
                         ...prev].slice(0, KEEP));
      if (!offered) return;
      const res = await askWorker({ ru });
      /* A failure is said on the row it belongs to and nowhere else — the
         Russian above it is still right, and still tappable. */
      if (res && res.ok) put({ en: res.en || "", note: res.note || "", state: "done" });
      else put({ state: "failed" });
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

  return (
    <Screen title="Translate" scroll={false}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
        {rows.length === 0 ? (
          /* One line, and it is an instruction for a control that has no other
             way of saying what it wants (rule 20.7): a microphone the learner
             must *hold* rather than tap is not something a picture discloses. */
          <Muted testID="translate-empty" style={{ textAlign: "center", marginTop: 24 }}>
            Hold the microphone and speak Russian.
          </Muted>
        ) : null}
        {rows.map((r) => (
          <Card key={r.id} testID="translate-row" style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <View style={{ flex: 1 }}>
                {/* Every word tappable, which works with no network and is the
                    reason a learner is better off here than in a translator. */}
                <Linked text={r.ru} />
              </View>
              <Speaker text={r.ru} size={36} />
            </View>
            {r.state === "asking" ? (
              <Muted testID="translate-asking" style={{ marginTop: 6 }}>Translating…</Muted>
            ) : r.state === "failed" ? (
              <Muted testID="translate-failed" style={{ marginTop: 6 }}>No translation right now.</Muted>
            ) : r.state === "offline" ? (
              <Muted testID="translate-offline" style={{ marginTop: 6 }}>Tap a word for its meaning.</Muted>
            ) : (
              <>
                <Text testID="translate-en"
                      style={{ color: t.ink, fontSize: 17, marginTop: 6 }}>
                  {r.en}
                </Text>
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

      {/* The microphone sits at the foot, where the thumb is, and stays put as
          the answers pile up above it (§30ak: the thing to touch goes low). */}
      <View style={{ alignItems: "center", paddingTop: 10, borderTopWidth: 1,
                     borderTopColor: t.lineSoft, borderRadius: radius.md }}>
        <HoldButton phase={rec.phase} onIn={rec.hold} onOut={rec.release} />
        <Text testID="translate-live"
              style={{ color: t.ink, fontSize: 17, marginTop: 10, minHeight: 24 }}>
          {rec.phase === "listening" ? rec.live : rec.live || rec.note || ""}
        </Text>
      </View>
    </Screen>
  );
}
