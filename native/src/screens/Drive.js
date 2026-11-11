/* Drive mode (core/drive.js): hands-free audio lessons, chosen like podcast
 * episodes (the owner, 2026-10-15: *"'episodes' which are blocks of
 * associated words… earlier blocks simpler and later blocks more complex…
 * select it like a podcast or playlist"*).
 *
 *   - **The episodes** are the course itself, chapter by chapter, cut into
 *     runs of its named word groups (`buildEpisodes`): the list is the
 *     chapters, each with its episodes and, once some of its words have been
 *     studied, those words as a playlist of their own (the owner, 2026-11-10:
 *     *"synch it with the chapters… organized by words learned in specific
 *     chapters"*). Each group: its name, its words prompted with a pause to
 *     say the Russian, recalled, the group once more, a sentence that uses it.
 *     Nothing is locked: a podcast can be played in any order.
 *   - **Two playlists of your own** stay above them (the owner: *"you can
 *     still maintain those options though like studied words and troubled
 *     words"*): the groups you have studied, weakest first, and your trouble
 *     words in their groups.
 *   - Press play, lock the phone; the next episode follows if the option is on.
 *
 * **Spoken commands and big keys** (the owner, 2026-11-10). The phone listens
 * for English during every pause — the only moment nothing is playing, since
 * a microphone open under a speaker hears the speaker (§30h′) — and acts on
 * the first partial that is a command (core/drive.js COMMANDS): repeat (the
 * item over and over), continue (back to the lesson, repeat off), back, next,
 * pause, play, again (once more, then on), conjugate / forms (the word's
 * tables, one cell at a time, `focusScript`), or a tense or a case to drill
 * just that. The same controls are keys big enough for a phone in a car
 * mount. The recogniser needs the screen on: Android gives no microphone to
 * an app in the background, so a locked phone keeps the lock screen's
 * play/pause and nothing else.
 *
 * **Sleep** stops the drive after a chosen number of minutes, checked between
 * segments, so it works with the screen locked.
 *
 * What it plays is what has a bought clip (§30bq: one voice); the English is
 * the phone's English voice. Nothing is graded (§30z).
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Pressable, AppState } from "react-native";
import Svg, { Path, Line } from "react-native-svg";
import { useSession } from "../session";
import { useTheme, type as T, radius } from "../theme";
import { Screen, Text, Muted, Btn, CogButton, Sheet, Choice, SectionLabel, List,
         ToggleRow, Row, RowText, Thumb, Lift, Bubble, MicNote } from "../ui";
import { L, IX, SPEECH, STAGES, rankOf } from "../data";
import { troubleWords } from "../studycards";
import { say, speakLine, stop, whenIdle, hasRealAudio, startCarrier, pauseCarrier,
         resumeCarrier, stopCarrier, waitMs } from "../audio";
import { useRecognizer, LANG_EN } from "../speech";
import { driveScript, driveLength, drivePrefs, buildEpisodes, focusScript, focusTables,
         focusTableName, parseCommand, COMMANDS, FOCUS, COMMAND_WORDS, SLEEP_MINUTES,
         DRIVE_OPTIONS, REVIEW_GROUPS } from "@core/drive";
import { cardFor, familiarity } from "@core/scheduler";
import { firstSense, fold, today } from "@core/util";

const SILENCE = require("../../assets/silence.mp3");
const SENTENCES_PER_GROUP = 2;
const CYRILLIC = /[А-Яа-яЁё́-]+/g;
/* A word still being said when a pause ends gets this long to finish. */
const TAIL_MS = 700;
/* Between one listen and the next while paused: the end of one attempt and
   the start of the next must not be the same moment to the audio session. */
const RELISTEN_MS = 400;
const HEARD_MS = 2500;

const wordOf = (i) => (L[i] ? L[i].w || L[i].b : "");
const itemOf = (i) => ({ ru: wordOf(i), en: firstSense(L[i]), kind: "word", b: L[i].b, i });

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

/* Your own playlists: the course's groups narrowed to your words. `studied`
   is the weakest few groups; `trouble` every trouble word in its group;
   `learned:N` what you have studied of chapter N, in the course's order. */
export function ownPlaylist(st, which) {
  const seen = st.seen || {};
  const trouble = which === "trouble" ? new Set(troubleWords(st)) : null;
  const chapter = /^learned:(\d+)$/.test(which) ? Number(which.slice(8)) : null;
  const keep = (it) => (trouble ? trouble.has(it.b) : !!seen[it.b]);
  const groups = courseGroups()
    .filter((g) => chapter === null || g.chapter === chapter)
    .map((g) => {
      const items = g.items.filter(keep);
      return { ...g, items, idxs: g.idxs.filter((i) => keep({ b: L[i].b })),
               score: items.reduce((s, it) => s + scoreOf(st, it.b), 0) / Math.max(1, items.length) };
    })
    .filter((g) => g.items.length);
  if (trouble || chapter !== null) return groups;
  return groups.filter((g) => g.items.length >= 2).sort((a, b) => a.score - b.score).slice(0, REVIEW_GROUPS);
}

/* What a playlist id plays: an episode number, "studied", "trouble" or
   "learned:N". */
export function playlistOf(st, id) {
  if (id === "studied" || id === "trouble" || /^learned:\d+$/.test(String(id))) {
    const groups = ownPlaylist(st, id);
    const title = id === "trouble" ? "Trouble words" : id === "studied" ? "Your words"
      : `Chapter ${id.slice(8)} · your words`;
    return { id, title, groups };
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
        <ToggleRow title="Voice commands" value={o.voice} onValueChange={set("voice")} testID="drive-opt-voice" />
        <ToggleRow title="Play the next episode" value={o.next} onValueChange={set("next")} testID="drive-opt-next" />
        <ToggleRow title="Russian twice when new" value={o.twice} onValueChange={set("twice")} testID="drive-opt-twice" />
        <ToggleRow title="Sentences" value={o.sentences} onValueChange={set("sentences")} testID="drive-opt-sentences" />
        <ToggleRow title="Say each group's name" value={o.names} onValueChange={set("names")} testID="drive-opt-names" />
      </List>
    </Sheet>
  );
}

/* About how long: the script without its sentences (finding those scans the
   pools, which is not worth doing for every row) plus a sentence's worth a group. */
const SENTENCE_MS = 9000;
const minutesOf = (groups, prefs) => {
  const ms = driveLength(driveScript(groups, { ...prefs, sentences: false }))
    + (prefs.sentences ? groups.length * SENTENCES_PER_GROUP * SENTENCE_MS : 0);
  return Math.max(1, Math.round(ms / 60000));
};

/* The playlist: your own two, then each chapter's episodes. */
export function DriveList({ navigation }) {
  const { st, ready, update } = useSession();
  const prefs = drivePrefs(st.drivePrefs);
  const [cog, setCog] = useState(false);
  const eps = useMemo(() => episodes(), []);
  const own = useMemo(() => (ready ? {
    studied: ownPlaylist(st, "studied"), trouble: ownPlaylist(st, "trouble"),
    learned: STAGES.map((s, k) => ownPlaylist(st, `learned:${k + 1}`)),
  } : { studied: [], trouble: [], learned: STAGES.map(() => []) }),
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
  const countOf = (groups) => groups.reduce((s, g) => s + g.items.length, 0);
  const plural = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;

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
                   sub={own.trouble.length ? plural(countOf(own.trouble), "word") : "None right now"} />
        </Row>
      </List>

      {STAGES.map((s, k) => {
        const mine = eps.filter((e) => e.chapter === k + 1);
        const learned = own.learned[k];
        if (!mine.length) return null;
        return (
          <View key={s.n} testID={`drive-chapter-${k + 1}`}>
            <SectionLabel gap>{`Chapter ${k + 1}${s.title ? ` · ${s.title}` : ""}`}</SectionLabel>
            <List>
              {mine.map((e) => (
                <Row key={e.id} testID={`drive-episode-${e.id}`} onPress={() => open(e.id)}>
                  <Thumb n={e.id} done={!!done[e.id]} tone={e.id === upNext ? "brand" : undefined} />
                  <RowText title={e.title}
                           sub={`${e.parts > 1 ? `Part ${e.part} of ${e.parts} · ` : ""}${e.words} words · ${lengths[e.id - 1]} min`} />
                </Row>
              ))}
              {learned.length ? (
                <Row testID={`drive-learned-${k + 1}`} onPress={() => open(`learned:${k + 1}`)}>
                  <Thumb id="drive" tone="info" />
                  <RowText title="Words you've learned" sub={`${plural(countOf(learned), "word")} · ${plural(learned.length, "group")}`} />
                </Row>
              ) : null}
            </List>
          </View>
        );
      })}
      {cog ? <DriveOptions prefs={prefs} onChange={(next) => update((p) => ({ ...p, drivePrefs: next }))}
                           onClose={() => setCog(false)} /> : null}
    </Screen>
  );
}

/* A key big enough for a car mount: the label large, a lip to press into,
   lit in the brand tint while its state is on. */
function Key({ label, on, onPress, testID, style, size = "normal", children, hint }) {
  const t = useTheme();
  const big = size === "big";
  return (
    <Lift testID={testID} onPress={onPress} label={hint} state={on === undefined ? undefined : { selected: !!on }}
          edge={on ? t.brandDim : t.surface3} fill={on ? t.brandBg : t.surface2}
          border={on ? t.brand : t.line} r={radius.lg} bw={1} style={[{ flex: 1 }, style]}>
      <View style={{ minHeight: big ? 96 : 68, alignItems: "center", justifyContent: "center",
                     paddingHorizontal: 8, gap: 4 }}>
        {children}
        {label ? (
          <Text selectable={false} style={{ color: on ? t.brandInk : t.ink, fontSize: big ? T.title : T.head,
                                            fontWeight: "700", textAlign: "center" }}>{label}</Text>
        ) : null}
      </View>
    </Lift>
  );
}

const Glyph = ({ d, size = 30, color }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}><Path d={d} /></Svg>
);

/* The microphone, lit while it is listening, crossed when voice is off. */
function Mic({ state, onPress }) {
  const t = useTheme();
  const on = state !== "off";
  const live = state === "listening";
  const color = live ? t.brand : on ? t.ink2 : t.ink3;
  return (
    <Pressable testID="drive-voice" accessibilityRole="button" onPress={onPress}
               accessibilityLabel={on ? "Voice commands on" : "Voice commands off"}
               accessibilityState={{ selected: on }} hitSlop={8}
               style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
                        borderWidth: 1, borderColor: live ? t.brand : t.line,
                        backgroundColor: live ? t.brandBg : t.surface }}>
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}
           strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
        <Path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" />
        {!on ? <Line x1="3" y1="3" x2="21" y2="21" /> : null}
      </Svg>
    </Pressable>
  );
}

/* The focus a word offers: a verb its tenses, anything declined its cases. */
function focusChoices(entry) {
  if (!entry) return [];
  const tables = focusTables(entry);
  if (!tables.length) return [];
  if (entry.p === "verb") {
    return tables.map((t) => {
      const name = focusTableName(t.title, entry);
      const id = /^Present/.test(t.title) ? (entry.a === "perfective" ? "future" : "present")
        : /^Past/.test(t.title) ? "past" : "imperative";
      return { id, name };
    });
  }
  const rows = new Set(tables.flatMap((t) => t.rows.map((r) => r[0])));
  return FOCUS.filter((f) => f.row && rows.has(f.row)).map((f) => ({ id: f.id, name: f.name }));
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
  const [state, setState] = useState("idle");          // idle | playing | paused | done
  const stateRef = useRef("idle");
  const go = (s) => { stateRef.current = s; setState(s); };
  const [now, setNow] = useState(null);                // { item, group, at, of }
  const [focus, setFocus] = useState(null);            // { only, choices } while the word's tables play
  const focusRef = useRef(null);                       // { script, only }
  const [looping, setLooping] = useState(false);
  const loop = useRef(false);
  const onceMore = useRef(false);
  const [heard, setHeard] = useState(null);
  const [sleep, setSleep] = useState(null);            // the minute the drive stops at, ms
  const sleepRef = useRef(null);
  const [sleepPick, setSleepPick] = useState(false);
  const [why, setWhy] = useState(null);                // why it ended: "sleep"
  const run = useRef(0);
  const at = useRef(0);                                // the current mark in the active script
  const markAt = useRef(0);                            // the current mark in the main script
  const chain = useRef(false);                         // the next episode should start on its own
  const live = useRef({});
  live.current = { script, groups };
  const voice = useRef(prefs.voice);
  voice.current = prefs.voice;
  const voiceDown = useRef(false);                     // this sitting's recogniser refused: no more tries
  const heardText = useRef("");
  const pausedListen = useRef(false);
  const recRef = useRef(null);
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; run.current++; stop(); stopCarrier(); }, []);

  const active = () => (focusRef.current ? focusRef.current.script : live.current.script);
  const marksOf = (sc) => sc.map((s, k) => (s.t === "mark" ? k : -1)).filter((k) => k >= 0);

  const show = (k) => {
    const sc = active();
    const s = sc[k];
    const ms = marksOf(sc);
    const gs = live.current.groups;
    const group = s.focus ? (focusRef.current ? focusRef.current.entry.w || focusRef.current.entry.b : "")
      : gs[s.group] ? gs[s.group].name : "";
    setNow({ item: s.item, group, at: ms.indexOf(k), of: ms.length });
  };

  const finish = () => {
    if (typeof id === "number") update((p) => ({ ...p, driveDone: { ...(p.driveDone || {}), [id]: today() } }));
    const next = typeof id === "number" && prefs.next ? id + 1 : null;
    focusRef.current = null; setFocus(null); setLoop(false);
    if (next && episodes().some((e) => e.id === next)) {
      chain.current = true;
      markAt.current = 0; at.current = 0;
      setNow(null);
      setId(next);                                     // the effect below plays it
      return;
    }
    go("done");
    stopCarrier();
  };

  /* The sleep timer ran out: everything stops, and the screen says why. */
  const sleepOver = () => {
    run.current++; stop(); stopCarrier();
    sleepRef.current = null; setSleep(null);
    setWhy("sleep");
    go("done");
  };

  /* Android gives no microphone to an app in the background, so a locked
     phone or another app in front means no ear: an attempt there would only
     fail, and an engine that throws is taken as refusing for the sitting. */
  const appActive = useRef(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => { appActive.current = s === "active"; });
    return () => { if (sub && sub.remove) sub.remove(); };
  }, []);

  /* Listening inside a pause. Opened as the pause opens, put down as it ends;
     a word still arriving at the end gets TAIL_MS to finish. */
  const listening = () => voice.current && !voiceDown.current && appActive.current && stateRef.current === "playing";
  const gapWithEar = async (ms, gone) => {
    const ear = listening();
    if (ear) { heardText.current = ""; recRef.current.listen({ lang: LANG_EN }); }
    await waitMs(ms, gone);
    if (!ear) return;
    if (heardText.current && !gone()) await waitMs(TAIL_MS, gone);
    // Superseded, the ear is somebody else's now: a command restarted the
    // drive, and the new run may already be listening in a pause of its own.
    if (gone()) return;
    recRef.current.cancel();
  };

  const play = async (from) => {
    const mine = ++run.current;
    const gone = () => run.current !== mine;
    go("playing");
    let k = from;
    for (;;) {
      if (gone()) return;
      if (sleepRef.current && Date.now() >= sleepRef.current) { sleepOver(); return; }
      const sc = active();
      if (k >= sc.length) {
        // The end of what is playing: round again, back to the lesson, or done.
        if (loop.current || onceMore.current) { onceMore.current = false; k = at.current; continue; }
        if (focusRef.current) { leaveFocus(); k = markAt.current; continue; }
        finish(); return;
      }
      const s = sc[k];
      if (s.t === "mark") {
        // A new item is reached: a repeat or an "again" replays the one just finished instead.
        if (k !== at.current && (loop.current || onceMore.current)) { onceMore.current = false; k = at.current; continue; }
        at.current = k;
        if (!focusRef.current) markAt.current = k;
        show(k);
      } else if (s.t === "gap") await gapWithEar(s.ms, gone);
      else if (s.t === "en") await speakLine(s.text, { lang: "en" });
      else if (s.t === "ru") { await say(s.text, { repeat: false, speed: prefs.speed }); await whenIdle(); }
      k++;
    }
  };

  // The next episode, once its script is built.
  useEffect(() => {
    if (chain.current && script.length) { chain.current = false; play(0); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script]);

  const halt = () => { run.current++; stop(); if (recRef.current) recRef.current.cancel(); };

  /* While paused by a press or by voice, the microphone stays open so
     "continue" can resume it; not from the lock screen, whose pause means the
     screen is off and no microphone would open. */
  const listenPaused = () => {
    if (!alive.current || !voice.current || voiceDown.current || !appActive.current
        || stateRef.current !== "paused" || !recRef.current) return;
    pausedListen.current = true;
    heardText.current = "";
    recRef.current.listen({ lang: LANG_EN });
  };
  const pause = (fromLock) => {
    halt();
    if (!fromLock) pauseCarrier();
    go("paused");
    if (!fromLock) setTimeout(listenPaused, RELISTEN_MS);
  };
  /* A tap on a key while the ear is open for the pause: the key wins, and
     the ear reopens afterwards if the drive is still paused. */
  const tap = (fn) => () => { if (recRef.current) recRef.current.cancel(); pausedListen.current = false; fn();
                              if (stateRef.current === "paused") setTimeout(listenPaused, RELISTEN_MS); };
  const start = async () => {
    if (stateRef.current === "paused") {
      pausedListen.current = false;
      if (recRef.current) recRef.current.cancel();
      resumeCarrier(); play(at.current); return;
    }
    setWhy(null);
    // The lock screen's own play/pause, while the phone is in a pocket.
    await startCarrier(SILENCE, "Drive", (playing) => {
      if (playing) play(at.current);
      else pause(true);
    });
    play(0);
  };
  const jump = (dir) => {
    const ms = marksOf(active());
    const k = ms.indexOf(at.current);
    const to = ms[Math.max(0, Math.min(ms.length - 1, k + dir))];
    if (to === undefined) return;
    halt();
    at.current = to;
    if (!focusRef.current) markAt.current = to;
    onceMore.current = false;
    if (stateRef.current === "playing") play(to);
    else { show(to); if (stateRef.current === "paused") setTimeout(listenPaused, RELISTEN_MS); }
  };
  const again = () => {
    markAt.current = 0; at.current = 0; focusRef.current = null; setFocus(null); setLoop(false);
    setNow(null); setWhy(null); start();
  };

  /* "again": the current item once more, then on. Playing, it replays at the
     item's end; paused, it plays now. */
  const onceAgain = () => {
    if (stateRef.current === "paused") { halt(); resumeCarrier(); play(at.current); return; }
    onceMore.current = true;
  };
  const setLoop = (on) => { loop.current = on; setLooping(on); };

  /* The word on screen, as the lexicon holds it. A sentence is no word. */
  const wordNow = () => {
    if (focusRef.current) return focusRef.current.entry;
    const s = active()[at.current];
    return s && s.item && typeof s.item.i === "number" ? L[s.item.i] : null;
  };
  const leaveFocus = () => { focusRef.current = null; setFocus(null); at.current = markAt.current; };

  /* The word's tables as a drive: "conjugate", "forms", or one tense or case.
     A word with nothing of the kind asked for is said so, and the lesson
     resumes where it was. */
  const enterFocus = async (kind, only) => {
    const entry = wordNow();
    const notVerb = kind === "conjugate" && entry && entry.p !== "verb";
    const tables = entry && !notVerb ? focusTables(entry, only) : [];
    if (!entry || !tables.length) {
      halt();
      const line = !entry ? "Not a word"
        : notVerb ? "Not a verb"
        : only ? `No ${FOCUS.find((f) => f.id === only).name.toLowerCase()} for this word`
        : "No forms for this word";
      setHeard(line);
      await speakLine(line, { lang: "en" });
      if (stateRef.current === "playing") play(at.current); else if (stateRef.current === "paused") listenPaused();
      return;
    }
    halt();
    setLoop(false);
    const sc = focusScript(entry, { prefs, only });
    focusRef.current = { script: sc, only: only || null, entry };
    setFocus({ only: only || null, choices: focusChoices(entry) });
    at.current = 0;
    if (stateRef.current === "paused") resumeCarrier();
    play(0);
  };

  /* "continue": out of the word's tables, repeat off, and on from where it was. */
  const carryOn = () => {
    setLoop(false);
    onceMore.current = false;
    if (focusRef.current) {
      halt();
      leaveFocus();
      if (stateRef.current === "paused") resumeCarrier();
      play(markAt.current);
      return;
    }
    if (stateRef.current === "paused") start();
  };

  /* A command heard. The ear is put down first (the command is what it was
     for); whatever is still paused afterwards opens it again. */
  const obey = (c) => {
    const word = c.cmd === "focus" ? FOCUS.find((f) => f.id === c.id).name : COMMANDS.find((x) => x.id === c.cmd).say[0];
    setHeard(word[0].toUpperCase() + word.slice(1));
    if (recRef.current) recRef.current.cancel();
    pausedListen.current = false;
    switch (c.cmd) {
      case "repeat": setLoop(true); if (stateRef.current === "paused") { resumeCarrier(); play(at.current); } break;
      case "continue": carryOn(); break;
      case "back": jump(-1); break;
      case "next": jump(1); break;
      case "pause": if (stateRef.current === "playing") pause(false); break;
      case "play": if (stateRef.current === "paused") start(); break;
      case "again": onceAgain(); break;
      case "conjugate": enterFocus("conjugate"); break;
      case "forms": enterFocus("forms"); break;
      case "focus": enterFocus("focus", c.id); break;
      default: break;
    }
    if (stateRef.current === "paused") setTimeout(listenPaused, RELISTEN_MS);
  };

  /* What the item on screen means, so its own English said into the pause is
     not taken for an order (core/drive.js parseCommand). */
  const meaning = () => { const s = active()[at.current]; return s && s.item ? s.item.en : ""; };
  const onText = (text) => {
    heardText.current = text;
    const c = parseCommand(text, meaning());
    if (c) obey(c);
    return c;
  };
  const rec = useRecognizer({
    bias: COMMAND_WORDS,
    onLive: onText,
    onFinal: (text) => {
      // Paused and nothing commanded: keep the ear open.
      if (!onText(text) && pausedListen.current) setTimeout(listenPaused, RELISTEN_MS);
    },
    onQuiet: () => { if (pausedListen.current) setTimeout(listenPaused, RELISTEN_MS); },
    onError: () => { pausedListen.current = false; },
  });
  recRef.current = rec;
  /* The recogniser refusing — no English model, no microphone — ends voice
     for this sitting; the note says which and offers the model. */
  useEffect(() => { if (rec.block) voiceDown.current = true; }, [rec.block]);
  useEffect(() => {
    if (!heard) return undefined;
    const timer = setTimeout(() => setHeard(null), HEARD_MS);
    return () => clearTimeout(timer);
  }, [heard]);

  const toggleVoice = () => {
    const next = !prefs.voice;
    voice.current = next;
    if (!next && recRef.current) { recRef.current.cancel(); pausedListen.current = false; }
    update((p) => ({ ...p, drivePrefs: { ...drivePrefs(p.drivePrefs), voice: next } }));
    if (next && stateRef.current === "paused") listenPaused();
  };

  const setSleepMinutes = (min) => {
    setSleepPick(false);
    const end = min ? Date.now() + min * 60000 : null;
    sleepRef.current = end; setSleep(end);
  };

  if (!list) return <Screen><Muted testID="drive-empty">Nothing to play here yet.</Muted></Screen>;
  const minutes = Math.max(1, Math.round(driveLength(script) / 60000));
  const playing = state === "playing";
  const heading = typeof id === "number" ? `Episode ${id} · ${list.title}` : list.title;
  const micState = !prefs.voice || voiceDown.current || rec.block ? "off" : rec.phase === "listening" ? "listening" : "on";
  const sleepLeft = sleep ? Math.max(1, Math.ceil((sleep - Date.now()) / 60000)) : null;
  const blockNote = rec.block ? {
    text: rec.block.why === "model" ? "Voice needs English installed for offline recognition" : rec.block.text,
    action: rec.block.why === "model" && rec.block.canGet ? { label: "Get English", run: rec.getModel } : null,
  } : null;

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, padding: 20, justifyContent: "space-between" }}>
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text testID="drive-title" style={{ color: t.ink, fontSize: T.head, fontWeight: "700", flex: 1 }}>{heading}</Text>
            <Mic state={micState} onPress={toggleVoice} />
          </View>
          <Muted testID="drive-length">
            {now ? `${now.at + 1} of ${now.of}` : `${groups.length} ${groups.length === 1 ? "group" : "groups"} · about ${minutes} min`}
          </Muted>
          {blockNote ? <MicNote testID="drive-voice-note" note={blockNote} /> : null}
        </View>

        <View style={{ alignItems: "center", gap: 12 }}>
          {!groups.length ? (
            <Muted testID="drive-empty">Nothing to play here yet.</Muted>
          ) : state === "done" ? (
            <>
              <Text testID="drive-done" style={{ color: t.ink, fontSize: T.title, fontWeight: "700" }}>Done</Text>
              {why === "sleep" ? <Muted testID="drive-slept">Sleep timer</Muted> : null}
            </>
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
          {/* What the ear heard, for a moment. */}
          <Muted testID="drive-heard" style={{ minHeight: 20, color: t.brand }}>{heard || " "}</Muted>
        </View>

        {!groups.length ? null : state === "done" ? (
          <View style={{ alignItems: "center" }}>
            <Btn testID="drive-again" kind="pri" label="Again" onPress={again} />
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", gap: 10, alignItems: "stretch" }}>
              <Key testID="drive-back" hint="Previous" onPress={() => jump(-1)}>
                <Glyph d="M6 5h2v14H6zM20 5v14L9 12z" color={t.ink2} />
              </Key>
              <Key testID="drive-play" hint={playing ? "Pause" : "Play"} size="big" on={playing}
                   onPress={playing ? () => pause(false) : start} style={{ flex: 1.6 }}>
                <Glyph d={playing ? "M6 5h4v14H6zM14 5h4v14h-4z" : "M8 5v14l11-7z"} size={44}
                       color={playing ? t.brandInk : t.ink} />
              </Key>
              <Key testID="drive-next" hint="Next" onPress={() => jump(1)}>
                <Glyph d="M16 5h2v14h-2zM4 5v14l11-7z" color={t.ink2} />
              </Key>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Key testID="drive-repeat" label="Repeat" on={looping} onPress={tap(() => setLoop(!looping))} />
              <Key testID="drive-once" label="Again" onPress={tap(onceAgain)} />
              <Key testID="drive-sleep" label={sleepLeft ? `Sleep ${sleepLeft}m` : "Sleep"} on={!!sleep}
                   onPress={() => setSleepPick(true)} />
            </View>
            {focus ? (
              <>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Key testID="drive-continue" label="Continue" on onPress={tap(carryOn)} />
                </View>
                <View testID="drive-focus-choices" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {focus.choices.map((c) => (
                    <Key key={c.id} testID={`drive-focus-${c.id}`} label={c.name} on={focus.only === c.id}
                         onPress={tap(() => enterFocus("focus", c.id))} style={{ flexBasis: "30%", flexGrow: 1 }} />
                  ))}
                </View>
              </>
            ) : (
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Key testID="drive-conjugate" label="Conjugate" onPress={tap(() => enterFocus("conjugate"))} />
                <Key testID="drive-forms" label="Forms" onPress={tap(() => enterFocus("forms"))} />
              </View>
            )}
          </View>
        )}
      </View>
      {sleepPick ? (
        <Bubble testID="drive-sleep-pick" title="Sleep" onClose={() => setSleepPick(false)}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {SLEEP_MINUTES.map((m) => (
              <Key key={m} testID={`drive-sleep-${m}`} label={`${m} min`} on={!!sleep && sleepLeft === m}
                   onPress={() => setSleepMinutes(m)} style={{ flexBasis: "30%", flexGrow: 1 }} />
            ))}
            <Key testID="drive-sleep-off" label="Off" on={!sleep} onPress={() => setSleepMinutes(0)}
                 style={{ flexBasis: "30%", flexGrow: 1 }} />
          </View>
        </Bubble>
      ) : null}
    </Screen>
  );
}
