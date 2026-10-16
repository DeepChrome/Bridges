/* Drive mode (core/drive.js): hands-free audio lessons, chosen like podcast
 * episodes (the owner, 2026-10-15: *"like 25 different 'episodes' which are
 * blocks of associated words… earlier blocks simpler and later blocks more
 * complex… select it like a podcast or playlist"*).
 *
 *   - **The episodes** are the course itself cut into 25 runs of its named
 *     word groups (`buildEpisodes`), so episode 1 is chapter 1's greetings
 *     and episode 25 is chapter 10's — they follow the chapters because they
 *     are the chapters. Each group: its name, its words prompted with a pause
 *     to say the Russian, recalled, the group once more, a sentence that uses
 *     it. Nothing is locked: a podcast can be played in any order.
 *   - **Two playlists of your own** stay above them (the owner: *"you can
 *     still maintain those options though like studied words and troubled
 *     words"*): the groups you have studied, weakest first, and your trouble
 *     words in their groups.
 *   - Press play, lock the phone; the next episode follows if the option is on.
 *
 * What it plays is what has a bought clip (§30bq: one voice); the English is
 * the phone's English voice. Nothing is graded (§30z).
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSession } from "../session";
import { useTheme, type as T } from "../theme";
import { Screen, Text, Muted, IconButton, Btn, CogButton, Sheet, Choice, SectionLabel, List,
         ToggleRow, Row, RowText, Thumb } from "../ui";
import { L, IX, SPEECH, STAGES, rankOf } from "../data";
import { troubleWords } from "../studycards";
import { say, speakLine, stop, whenIdle, hasRealAudio, startCarrier, pauseCarrier,
         resumeCarrier, stopCarrier, waitMs } from "../audio";
import { driveScript, driveLength, drivePrefs, buildEpisodes, DRIVE_OPTIONS,
         REVIEW_GROUPS } from "@core/drive";
import { cardFor, familiarity } from "@core/scheduler";
import { firstSense, fold, today } from "@core/util";

const SILENCE = require("../../assets/silence.mp3");
const SENTENCES_PER_GROUP = 2;
const CYRILLIC = /[А-Яа-яЁё́-]+/g;

const wordOf = (i) => (L[i] ? L[i].w || L[i].b : "");
const itemOf = (i) => ({ ru: wordOf(i), en: firstSense(L[i]), kind: "word", b: L[i].b });

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

/* Every group of the course with a recording for its words, in course order.
   The same for every learner, so built once. */
let COURSE = null;
export function courseGroups() {
  if (COURSE) return COURSE;
  COURSE = [];
  STAGES.forEach((s, k) => {
    for (const u of [s.core].concat(s.branches)) {
      for (const [name, , ws] of (u.gr || [])) {
        const idxs = ws.filter((i) => L[i] && hasRealAudio(wordOf(i)) && firstSense(L[i]));
        if (idxs.length) COURSE.push({ name, chapter: k + 1, unit: u, idxs, items: idxs.map(itemOf) });
      }
    }
  });
  return COURSE;
}
let EPISODES = null;
export const episodes = () => (EPISODES = EPISODES || buildEpisodes(courseGroups()));

const scoreOf = (st, b) => (st.seen && st.seen[b] ? familiarity(cardFor(st.seen[b]), rankOf(b)) || 0 : 0);

/* Your own playlists: the course's groups narrowed to your words. */
export function ownPlaylist(st, which) {
  const seen = st.seen || {};
  const trouble = which === "trouble" ? new Set(troubleWords(st)) : null;
  const keep = (it) => (trouble ? trouble.has(it.b) : !!seen[it.b]);
  const groups = courseGroups()
    .map((g) => {
      const items = g.items.filter(keep);
      return { ...g, items, idxs: g.idxs.filter((i) => keep({ b: L[i].b })),
               score: items.reduce((s, it) => s + scoreOf(st, it.b), 0) / Math.max(1, items.length) };
    })
    .filter((g) => g.items.length);
  if (trouble) return groups;                     // every trouble word, in its group
  return groups.filter((g) => g.items.length >= 2).sort((a, b) => a.score - b.score).slice(0, REVIEW_GROUPS);
}

/* What a playlist id plays: an episode number, "studied" or "trouble". */
export function playlistOf(st, id) {
  if (id === "studied" || id === "trouble") {
    const groups = ownPlaylist(st, id);
    return { id, title: id === "trouble" ? "Trouble words" : "Your words", groups };
  }
  return episodes().find((e) => e.id === id) || null;
}

const withSentences = (groups) =>
  groups.map((g) => ({ ...g, sentences: g.sentences || sentencesFor(g.unit, g.idxs) }));

function DriveOptions({ prefs, onChange, onClose }) {
  const o = drivePrefs(prefs);
  const set = (k) => (v) => onChange({ ...o, [k]: v });
  const rows = [
    ["Prompt", "direction", DRIVE_OPTIONS.direction],
    ["Pause to answer", "pause", DRIVE_OPTIONS.pause],
    ["Russian speed", "speed", DRIVE_OPTIONS.speed],
  ];
  return (
    <Sheet onClose={onClose} testID="drive-options" title="Drive options" maxHeight="88%"
           footer={<Btn block kind="pri" testID="drive-apply" label="Done" style={{ marginTop: 8 }} onPress={onClose} />}>
      {rows.map(([label, key, options], k) => (
        <View key={key}>
          <SectionLabel gap={k > 0}>{label}</SectionLabel>
          <Choice testID={`drive-opt-${key}`} options={options} value={o[key]} onPick={set(key)} />
        </View>
      ))}
      <SectionLabel gap>Also</SectionLabel>
      <List>
        <ToggleRow title="Play the next episode" value={o.next} onValueChange={set("next")} testID="drive-opt-next" />
        <ToggleRow title="Russian twice when new" value={o.twice} onValueChange={set("twice")} testID="drive-opt-twice" />
        <ToggleRow title="Sentences" value={o.sentences} onValueChange={set("sentences")} testID="drive-opt-sentences" />
        <ToggleRow title="Say each group's name" value={o.names} onValueChange={set("names")} testID="drive-opt-names" />
      </List>
    </Sheet>
  );
}

/* About how long: the script without its sentences (finding those scans the
   pools, which is not worth doing for 25 rows) plus a sentence's worth a group. */
const SENTENCE_MS = 9000;
const minutesOf = (groups, prefs) => {
  const ms = driveLength(driveScript(groups, { ...prefs, sentences: false }))
    + (prefs.sentences ? groups.length * SENTENCES_PER_GROUP * SENTENCE_MS : 0);
  return Math.max(1, Math.round(ms / 60000));
};

/* The playlist. */
export function DriveList({ navigation }) {
  const t = useTheme();
  const { st, ready, update } = useSession();
  const prefs = drivePrefs(st.drivePrefs);
  const [cog, setCog] = useState(false);
  const eps = useMemo(() => episodes(), []);
  const own = useMemo(() => (ready ? {
    studied: ownPlaylist(st, "studied"), trouble: ownPlaylist(st, "trouble"),
  } : { studied: [], trouble: [] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready]);
  const done = st.driveDone || {};
  // Up next: the first episode holding a word you have not studied yet.
  const upNext = useMemo(() => (eps.find((e) => e.groups.some((g) => g.items.some((it) => !(st.seen || {})[it.b]))) || {}).id,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready]);
  const open = (id) => navigation.navigate("DriveEpisode", { id });
  const prefsKey = JSON.stringify(prefs);
  const lengths = useMemo(() => eps.map((e) => minutesOf(e.groups, prefs)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eps, prefsKey]);

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <SectionLabel>Your playlists</SectionLabel>
        <CogButton testID="drive-cog" label="Drive options" onPress={() => setCog(true)} />
      </View>
      <List>
        <Row testID="drive-own-studied" onPress={own.studied.length ? () => open("studied") : undefined}
             disabled={!own.studied.length}>
          <Thumb id="drive" tone="info" />
          <RowText title="Your words"
                   sub={own.studied.length ? own.studied.map((g) => g.name).join(" · ") : "Study some words first"} />
        </Row>
        <Row testID="drive-own-trouble" onPress={own.trouble.length ? () => open("trouble") : undefined}
             disabled={!own.trouble.length}>
          <Thumb id="drive" tone="info" />
          <RowText title="Trouble words"
                   sub={own.trouble.length ? `${own.trouble.reduce((s, g) => s + g.items.length, 0)} words` : "None right now"} />
        </Row>
      </List>

      <SectionLabel gap>Episodes</SectionLabel>
      <List>
        {eps.map((e) => (
          <Row key={e.id} testID={`drive-episode-${e.id}`} onPress={() => open(e.id)}>
            <Thumb n={e.id} done={!!done[e.id]} tone={e.id === upNext ? "brand" : undefined} />
            <RowText title={e.title}
                     sub={`Chapter ${e.chapter} · ${e.groups.length} groups · ${lengths[e.id - 1]} min`} />
          </Row>
        ))}
      </List>
      {cog ? <DriveOptions prefs={prefs} onChange={(next) => update((p) => ({ ...p, drivePrefs: next }))}
                           onClose={() => setCog(false)} /> : null}
    </Screen>
  );
}

/* One episode, played. Chains into the next without letting the lock screen
   go, so a locked phone carries on from episode to episode. */
export function DriveEpisode({ route }) {
  const t = useTheme();
  const { st, ready, update } = useSession();
  const prefs = drivePrefs(st.drivePrefs);
  const [id, setId] = useState(route && route.params ? route.params.id : 1);
  const list = useMemo(() => (ready ? playlistOf(st, id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, id]);
  const groups = useMemo(() => (list ? withSentences(list.groups) : []), [list]);
  const script = useMemo(() => driveScript(groups, prefs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, JSON.stringify(prefs)]);
  const marks = useMemo(() => script.map((s, k) => (s.t === "mark" ? k : -1)).filter((k) => k >= 0), [script]);
  const [state, setState] = useState("idle");          // idle | playing | paused | done
  const [now, setNow] = useState(null);                // { item, group, at }
  const run = useRef(0);
  const markAt = useRef(0);
  const chain = useRef(false);                         // the next episode should start on its own
  const live = useRef({});
  live.current = { script, marks, groups };

  useEffect(() => () => { run.current++; stop(); stopCarrier(); }, []);

  const show = (k) => {
    const { script: sc, marks: ms, groups: gs } = live.current;
    const s = sc[k];
    setNow({ item: s.item, group: gs[s.group] ? gs[s.group].name : "", at: ms.indexOf(k) });
  };

  const finish = () => {
    if (typeof id === "number") update((p) => ({ ...p, driveDone: { ...(p.driveDone || {}), [id]: today() } }));
    const next = typeof id === "number" && prefs.next ? id + 1 : null;
    if (next && episodes().some((e) => e.id === next)) {
      chain.current = true;
      markAt.current = 0;
      setNow(null);
      setId(next);                                     // the effect below plays it
      return;
    }
    setState("done");
    stopCarrier();
  };

  const play = async (from) => {
    const mine = ++run.current;
    const gone = () => run.current !== mine;
    setState("playing");
    const sc = live.current.script;
    for (let k = from; k < sc.length; k++) {
      if (gone()) return;
      const s = sc[k];
      if (s.t === "mark") { markAt.current = k; show(k); }
      else if (s.t === "gap") await waitMs(s.ms, gone);
      else if (s.t === "en") await speakLine(s.text, { lang: "en" });
      else if (s.t === "ru") { await say(s.text, { repeat: false, speed: prefs.speed }); await whenIdle(); }
    }
    if (!gone()) finish();
  };

  // The next episode, once its script is built.
  useEffect(() => {
    if (chain.current && script.length) { chain.current = false; play(0); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script]);

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

  if (!list) return <Screen><Muted testID="drive-empty">Nothing to play here yet.</Muted></Screen>;
  const minutes = Math.max(1, Math.round(driveLength(script) / 60000));
  const playing = state === "playing";
  const heading = typeof id === "number" ? `Episode ${id} · ${list.title}` : list.title;

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, padding: 24, justifyContent: "space-between" }}>
        <View style={{ gap: 4 }}>
          <Text testID="drive-title" style={{ color: t.ink, fontSize: T.head, fontWeight: "700" }}>{heading}</Text>
          <Muted testID="drive-length">
            {now ? `${now.at + 1} of ${marks.length}` : `${groups.length} ${groups.length === 1 ? "group" : "groups"} · about ${minutes} min`}
          </Muted>
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
    </Screen>
  );
}
