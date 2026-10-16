/* Drive mode (core/drive.js): a hands-free audio lesson from where the learner
 * is. Press play, lock the phone, and it runs: the English, a pause to say the
 * Russian aloud, the Russian twice, and each item asked again a little later.
 *
 * What it plays is what has a bought clip (§30bq: one voice) — the newest
 * words of the route and short sentences from the units reached. The English
 * is the phone's English voice, which is the one thing here that is not a
 * recording, and the screen says nothing about it because nothing is
 * presented as Russian that is not one.
 *
 * Nothing is graded. A word said in a car is practice, not a claim (§30z).
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSession } from "../session";
import { useTheme, type as T } from "../theme";
import { Screen, Text, Muted, IconButton, Btn } from "../ui";
import { L, SPEECH, personalWords, reachedUnits } from "../data";
import { say, speakLine, stop, whenIdle, hasRealAudio, startCarrier, pauseCarrier,
         resumeCarrier, stopCarrier, waitMs } from "../audio";
import { driveScript, driveItems, driveLength } from "@core/drive";
import { firstSense } from "@core/util";

const SILENCE = require("../../assets/silence.mp3");

/* The newest words met, with a clip, and short sentences from the units
   reached — the newest units first, each sentence once. */
export function driveFrom(st) {
  const words = personalWords(st).filter((i) => L[i] && hasRealAudio(L[i].w || L[i].b));
  const recent = words.slice(-14).map((i) => ({ ru: L[i].w || L[i].b, en: firstSense(L[i]), kind: "word" }))
    .filter((w) => w.en);
  const seen = new Set();
  const sentences = [];
  for (const u of reachedUnits(st).slice().reverse()) {
    for (const r of (SPEECH.speak[u.id] || [])) {
      const row = SPEECH.rows[r];
      if (!row || seen.has(row[0]) || !row[1] || !hasRealAudio(row[0])) continue;
      seen.add(row[0]);
      sentences.push({ ru: row[0], en: row[1], kind: "sentence" });
    }
    if (sentences.length >= 24) break;
  }
  return driveItems(recent, sentences);
}

export default function Drive() {
  const t = useTheme();
  const { st, ready } = useSession();
  const items = useMemo(() => (ready ? driveFrom(st) : []),
    // Built once a sitting: the words met do not change while driving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready]);
  const script = useMemo(() => driveScript(items), [items]);
  const marks = useMemo(() => script.map((s, k) => (s.t === "mark" ? k : -1)).filter((k) => k >= 0), [script]);
  const [state, setState] = useState("idle");          // idle | playing | paused | done
  const [now, setNow] = useState(null);                // { item, first, at }
  const run = useRef(0);
  const markAt = useRef(0);

  useEffect(() => () => { run.current++; stop(); stopCarrier(); }, []);

  const play = async (from) => {
    const mine = ++run.current;
    const gone = () => run.current !== mine;
    setState("playing");
    for (let k = from; k < script.length; k++) {
      if (gone()) return;
      const s = script[k];
      if (s.t === "mark") {
        markAt.current = k;
        setNow({ item: items[s.item], first: s.first, at: marks.indexOf(k) });
      } else if (s.t === "gap") {
        await waitMs(s.ms, gone);
      } else if (s.t === "en") {
        await speakLine(s.text, { lang: "en" });
      } else {
        await say(s.text, { repeat: false });
        await whenIdle();
      }
    }
    if (gone()) return;
    setState("done");
    stopCarrier();
  };

  const pause = (fromLock) => { run.current++; stop(); if (!fromLock) pauseCarrier(); setState("paused"); };
  const start = async () => {
    if (state === "paused") { resumeCarrier(); play(markAt.current); return; }
    // The lock screen's own play/pause, while the phone is in a pocket.
    await startCarrier(SILENCE, "Drive", (playing) => {
      if (playing) play(markAt.current);
      else pause(true);
    });
    play(0);
  };
  const jump = (dir) => {
    const at = marks.indexOf(markAt.current);
    const to = marks[Math.max(0, Math.min(marks.length - 1, at + dir))];
    if (to === undefined) return;
    run.current++; stop();
    markAt.current = to;
    if (state === "playing") play(to);
    else setNow({ item: items[script[to].item], first: script[to].first, at: marks.indexOf(to) });
  };
  const again = () => { markAt.current = 0; setNow(null); start(); };

  if (!items.length) {
    return <Screen><Muted testID="drive-empty">Finish a lesson first.</Muted></Screen>;
  }
  const minutes = Math.max(1, Math.round(driveLength(script) / 60000));
  const playing = state === "playing";

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, padding: 24, justifyContent: "space-between" }}>
        <Muted testID="drive-length" style={{ textAlign: "center" }}>
          {now ? `${now.at + 1} of ${marks.length}` : `${items.length} items · about ${minutes} min`}
        </Muted>

        <View style={{ alignItems: "center", gap: 14 }}>
          {state === "done" ? (
            <Text testID="drive-done" style={{ color: t.ink, fontSize: T.title, fontWeight: "700" }}>Done</Text>
          ) : now ? (
            <>
              <Text testID="drive-en" style={{ color: t.ink2, fontSize: T.title, textAlign: "center" }}>
                {now.item.en}
              </Text>
              <Text testID="drive-ru" style={{ color: t.ink, fontSize: T.hero, fontWeight: "700", textAlign: "center" }}>
                {now.item.ru}
              </Text>
            </>
          ) : null}
        </View>

        <View style={{ alignItems: "center", gap: 18 }}>
          {state === "done" ? (
            <Btn testID="drive-again" kind="pri" label="Again" onPress={again} />
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 28 }}>
              <IconButton testID="drive-back" label="Previous" size={56} onPress={() => jump(-1)}>
                <Svg width={26} height={26} viewBox="0 0 24 24" fill={t.ink2}><Path d="M6 5h2v14H6zM20 5v14L9 12z" /></Svg>
              </IconButton>
              <Pressable testID="drive-play" accessibilityRole="button"
                         accessibilityLabel={playing ? "Pause" : "Play"}
                         onPress={playing ? () => pause(false) : start}
                         style={({ pressed }) => ({ width: 96, height: 96, borderRadius: 48, backgroundColor: t.brand,
                                                    alignItems: "center", justifyContent: "center",
                                                    opacity: pressed ? 0.8 : 1 })}>
                <Svg width={40} height={40} viewBox="0 0 24 24" fill={t.brandOn}>
                  <Path d={playing ? "M6 5h4v14H6zM14 5h4v14h-4z" : "M8 5v14l11-7z"} />
                </Svg>
              </Pressable>
              <IconButton testID="drive-next" label="Next" size={56} onPress={() => jump(1)}>
                <Svg width={26} height={26} viewBox="0 0 24 24" fill={t.ink2}><Path d="M16 5h2v14h-2zM4 5v14l11-7z" /></Svg>
              </IconButton>
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}
