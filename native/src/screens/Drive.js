/* Drive mode (core/drive.js): a hands-free audio lesson in clusters of related
 * words. Press play, lock the phone, and it runs: a group announced, its words
 * prompted in English with a pause to say the Russian, the Russian twice, each
 * word asked again a little later, the group once more, a sentence that uses it.
 *
 * What it plays is what has a bought clip (§30bq: one voice). The English is
 * the phone's English voice. The cog holds the options (§30aw's place for
 * them): what to play, which way round, how long a pause, how long a drive.
 *
 * Nothing is graded. A word said in a car is practice, not a claim (§30z).
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSession } from "../session";
import { useTheme, type as T } from "../theme";
import { Screen, Text, Muted, IconButton, Btn, CogButton, Sheet, Choice, SectionLabel, List,
         ToggleRow } from "../ui";
import { L, IX, UN, SPEECH, STAGES, personalWords, reachedUnits, rankOf } from "../data";
import { say, speakLine, stop, whenIdle, hasRealAudio, startCarrier, pauseCarrier,
         resumeCarrier, stopCarrier, waitMs } from "../audio";
import { driveScript, driveLength, pickGroups, drivePrefs, DRIVE_OPTIONS } from "@core/drive";
import { cardFor, familiarity } from "@core/scheduler";
import { firstSense, fold } from "@core/util";

const SILENCE = require("../../assets/silence.mp3");
const SENTENCES_PER_GROUP = 2;
const CYRILLIC = /[А-Яа-яЁё́-]+/g;

const wordOf = (i) => (L[i] ? L[i].w || L[i].b : "");

/* The sentences of a unit's pool that use one of these words, shortest first,
   each with a recording. */
function sentencesFor(unit, idxs) {
  const want = new Set(idxs);
  const out = [];
  for (const r of (SPEECH.speak[unit.id] || []).concat(SPEECH.listen[unit.id] || [])) {
    const row = SPEECH.rows[r];
    if (!row || !row[1] || out.some((s) => s.ru === row[0]) || !hasRealAudio(row[0])) continue;
    const toks = String(row[0]).match(CYRILLIC) || [];
    if (!toks.some((tok) => (IX[fold(tok)] || []).some((i) => want.has(i)))) continue;
    out.push({ ru: row[0], en: row[1], kind: "sentence" });
  }
  return out.sort((a, b) => a.ru.length - b.ru.length).slice(0, SENTENCES_PER_GROUP);
}

/* Every usable group for the chosen source, in course order. */
export function driveGroups(st, prefs) {
  const o = drivePrefs(prefs);
  const seen = st.seen || {};
  let units, keep;
  if (o.source === "chapter") {
    const s = STAGES[Math.max(0, Math.min(STAGES.length - 1, o.chapter || 0))];
    units = [s.core].concat(s.branches);
    keep = () => true;
  } else if (o.source === "review") {
    units = UN;
    keep = (i) => !!seen[L[i].b];
  } else {
    units = reachedUnits(st);
    const met = new Set(personalWords(st));
    keep = (i) => met.has(i);
  }
  const out = [];
  for (const u of units) {
    for (const [name, , ws] of (u.gr || [])) {
      const idxs = ws.filter((i) => L[i] && keep(i) && hasRealAudio(wordOf(i)) && firstSense(L[i]));
      if (!idxs.length) continue;
      const scores = idxs.map((i) => (seen[L[i].b] ? familiarity(cardFor(seen[L[i].b]), rankOf(L[i].b)) || 0 : 0));
      out.push({
        name,
        items: idxs.map((i) => ({ ru: wordOf(i), en: firstSense(L[i]), kind: "word" })),
        sentences: sentencesFor(u, idxs),
        score: scores.reduce((a, b) => a + b, 0) / scores.length,
      });
    }
  }
  return out;
}

function DriveOptions({ prefs, onChange, onClose }) {
  const o = drivePrefs(prefs);
  const set = (k) => (v) => onChange({ ...o, [k]: v });
  const chapters = STAGES.map((s, k) => ({ id: k, name: String(k + 1) }));
  const rows = [
    ["What to play", "source", DRIVE_OPTIONS.source],
    ["Prompt", "direction", DRIVE_OPTIONS.direction],
    ["Pause to answer", "pause", DRIVE_OPTIONS.pause],
    ["Length", "length", DRIVE_OPTIONS.length],
    ["Russian speed", "speed", DRIVE_OPTIONS.speed],
  ];
  return (
    <Sheet onClose={onClose} testID="drive-options" title="Drive options" maxHeight="88%"
           footer={<Btn block kind="pri" testID="drive-apply" label="Done" style={{ marginTop: 8 }} onPress={onClose} />}>
      {rows.map(([label, key, options], k) => (
        <View key={key}>
          <SectionLabel gap={k > 0}>{label}</SectionLabel>
          <Choice testID={`drive-opt-${key}`} options={options} value={o[key]} onPick={set(key)} />
          {key === "source" && o.source === "chapter" ? (
            <Choice testID="drive-opt-chapter" options={chapters} value={o.chapter} onPick={set("chapter")}
                    style={{ marginTop: 8 }} />
          ) : null}
        </View>
      ))}
      <SectionLabel gap>Also</SectionLabel>
      <List>
        <ToggleRow title="Russian twice when new" value={o.twice} onValueChange={set("twice")} testID="drive-opt-twice" />
        <ToggleRow title="Sentences" value={o.sentences} onValueChange={set("sentences")} testID="drive-opt-sentences" />
        <ToggleRow title="Say each group's name" value={o.names} onValueChange={set("names")} testID="drive-opt-names" />
      </List>
    </Sheet>
  );
}

export default function Drive() {
  const t = useTheme();
  const { st, ready, update } = useSession();
  const prefs = drivePrefs(st.drivePrefs);
  const prefsKey = JSON.stringify(prefs);
  const groups = useMemo(() => (ready ? pickGroups(driveGroups(st, prefs), prefs) : []),
    // Built once a sitting and when the options change: the words met do not
    // change while driving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, prefsKey]);
  const script = useMemo(() => driveScript(groups, prefs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, prefsKey]);
  const marks = useMemo(() => script.map((s, k) => (s.t === "mark" ? k : -1)).filter((k) => k >= 0), [script]);
  const [state, setState] = useState("idle");          // idle | playing | paused | done
  const [now, setNow] = useState(null);                // { item, group, at }
  const [cog, setCog] = useState(false);
  const run = useRef(0);
  const markAt = useRef(0);

  useEffect(() => () => { run.current++; stop(); stopCarrier(); }, []);

  const show = (k) => {
    const s = script[k];
    setNow({ item: s.item, group: groups[s.group] ? groups[s.group].name : "", at: marks.indexOf(k) });
  };

  const play = async (from) => {
    const mine = ++run.current;
    const gone = () => run.current !== mine;
    setState("playing");
    for (let k = from; k < script.length; k++) {
      if (gone()) return;
      const s = script[k];
      if (s.t === "mark") { markAt.current = k; show(k); }
      else if (s.t === "gap") await waitMs(s.ms, gone);
      else if (s.t === "en") await speakLine(s.text, { lang: "en" });
      else if (s.t === "ru") { await say(s.text, { repeat: false, speed: prefs.speed }); await whenIdle(); }
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
    else show(to);
  };
  const again = () => { markAt.current = 0; setNow(null); start(); };
  // A new set of options is a new drive: stop, and start from the top.
  const setPrefs = (next) => {
    run.current++; stop(); stopCarrier();
    markAt.current = 0; setNow(null); setState("idle");
    update((p) => ({ ...p, drivePrefs: next }));
  };

  const minutes = Math.max(1, Math.round(driveLength(script) / 60000));
  const playing = state === "playing";

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, padding: 24, justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Muted testID="drive-length" style={{ flex: 1 }}>
            {!groups.length ? "" : now ? `${now.at + 1} of ${marks.length}`
              : `${groups.length} groups · about ${minutes} min`}
          </Muted>
          <CogButton testID="drive-cog" label="Drive options" onPress={() => setCog(true)} />
        </View>

        <View style={{ alignItems: "center", gap: 14 }}>
          {!groups.length ? (
            <Muted testID="drive-empty">Nothing to play here yet.</Muted>
          ) : state === "done" ? (
            <Text testID="drive-done" style={{ color: t.ink, fontSize: T.title, fontWeight: "700" }}>Done</Text>
          ) : now ? (
            <>
              {now.group ? <Text testID="drive-group" style={{ color: t.brand, fontSize: T.body, fontWeight: "700" }}>{now.group}</Text> : null}
              <Text testID="drive-en" style={{ color: t.ink2, fontSize: T.title, textAlign: "center" }}>
                {now.item.en}
              </Text>
              <Text testID="drive-ru" style={{ color: t.ink, fontSize: T.hero, fontWeight: "700", textAlign: "center" }}>
                {now.item.ru}
              </Text>
            </>
          ) : (
            <View testID="drive-groups" style={{ alignItems: "center", gap: 6 }}>
              {groups.map((g, k) => (
                <Text key={`${k}-${g.name}`} style={{ color: t.ink2, fontSize: T.body }}>{g.name}</Text>
              ))}
            </View>
          )}
        </View>

        <View style={{ alignItems: "center", gap: 18 }}>
          {!groups.length ? null : state === "done" ? (
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
      {cog ? <DriveOptions prefs={prefs} onChange={setPrefs} onClose={() => setCog(false)} /> : null}
    </Screen>
  );
}
