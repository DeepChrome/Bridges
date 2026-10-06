/* Immerse (the video library) and the video player. */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Image, Pressable, Linking, BackHandler, Switch, useWindowDimensions, Platform } from "react-native";
import Svg, { Path } from "react-native-svg";
import * as ScreenOrientation from "expo-screen-orientation";
import { setStatusBarHidden } from "expo-status-bar";
import { YouTube } from "../youtube";
import { useSession } from "../session";
import { useTheme, radius, space } from "../theme";
import { Screen, List, Row, Card, Btn, Pill, Thumb, Muted, Title, SearchField, SectionLabel, Sheet,
         Dropdown, Text } from "../ui";
import {
  UN, STATS, unitState, markComponent, videos, videoById, videoWatched, unitById,
  CHANNELS, videoLines, transcriptOf, transcriptEnOf,
} from "../data";
import { Transcript } from "../transcript";
import { useWords } from "../words";
import { libraryState, setLibraryState, watchHistory, openedVideo, setVideoPosition,
         videoPosition } from "../immerse";
import { releaseAudio } from "../audio";
import { PrepList } from "../prep";
import { fold, today } from "@core/util";
import { newCard } from "@core/scheduler";

/* ------------------------------------------------------------- immerse */

export const short = (title) => title.split(" | ")[0].trim();
const minutes = (dur) => (dur ? `${Math.round(dur / 60)} min` : "");

/* The video's own thumbnail from YouTube (the owner, 2026-09-07), with a tick
   once watched. The image is YouTube's, fetched from YouTube; nothing is stored. */
export const thumbUrl = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
function VideoThumb({ id, done }) {
  const t = useTheme();
  return (
    <View style={{ width: 72, height: 44, borderRadius: 8, overflow: "hidden",
                   backgroundColor: t.surface2, borderWidth: done ? 2 : 0, borderColor: t.good }}>
      <Image testID={`thumb-${id}`} source={{ uri: thumbUrl(id) }}
             style={{ width: "100%", height: "100%" }} resizeMode="cover"
             accessibilityIgnoresInvertColors />
      {done ? (
        <View style={{ position: "absolute", right: 3, bottom: 3, width: 16, height: 16,
                       borderRadius: 8, backgroundColor: t.good, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: t.goodOn, fontSize: 10, fontWeight: "800" }}>✓</Text>
        </View>
      ) : null}
    </View>
  );
}

/* The library's orders (the owner, 2026-09-23: "default organize the immerse
   in a logical sequence that more or less mirrors a logical learning
   progression… but maybe have a sort by option at the top").

   `level` is the resting order and the progression: the units' own episodes
   along the path — they are keyed to chapters, so that *is* the route — then
   everything else by its CEFR code, easiest first within a code, the unrated
   last. The other three are plain sorts a learner may want on a given day. */
export const VIDEO_SORTS = [
  { id: "level", name: "By level" }, { id: "easiest", name: "Easiest" },
  { id: "newest", name: "Newest" }, { id: "shortest", name: "Shortest" },
];
const CEFR_RANK = { A1: 0, A2: 1, B1: 2, "B1+": 3, B2: 4, C1: 5, C2: 6 };
const cefrRank = (v) => (v.cefr in CEFR_RANK ? CEFR_RANK[v.cefr] : 9);

export function libraryOrder(videos, sort = "level") {
  const unitPos = {};
  UN.forEach((u, k) => { unitPos[u.id] = k; });
  const byEase = (a, b) => (b.ease || 0) - (a.ease || 0);
  const cmp = sort === "easiest" ? byEase
    : sort === "newest" ? (a, b) => String(b.up || "").localeCompare(String(a.up || "")) || byEase(a, b)
    : sort === "shortest" ? (a, b) => (a.dur || Infinity) - (b.dur || Infinity) || byEase(a, b)
    : (a, b) => {
      const ua = a.unit ? unitPos[a.unit] : Infinity;
      const ub = b.unit ? unitPos[b.unit] : Infinity;
      if (ua !== ub) return ua - ub;
      return cefrRank(a) - cefrRank(b) || byEase(a, b);
    };
  return videos.slice().sort(cmp);
}

/* A CEFR code typed as a search term ("b1", "B1+", "a2") filters on the video's
   code: "b1" takes B1 and B1+, "b1+" only B1+. The codes are never displayed. */
const CEFR_TERM = /^[abc][12]\+?$/;
const cefrMatches = (term, code) => {
  if (!code) return false;
  const c = code.toLowerCase();
  return term.endsWith("+") ? c === term : c === term || c === term + "+";
};

export function searchVideos(videos, query, sort) {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return libraryOrder(videos, sort);
  const scored = [];
  for (const v of videos) {
    const hay = ((v.kw || "") + " " + v.title + " " + (v.ch || "")).toLowerCase();
    let score = 0, ok = true;
    for (const term of terms) {
      if (CEFR_TERM.test(term)) {
        if (cefrMatches(term, v.cefr)) { score += 2; continue; }
        ok = false; break;
      }
      const cyr = /[а-яё]/.test(term);
      const said = cyr && Object.keys(v.words || {}).some((w) => fold(w).startsWith(term));
      const inTitle = v.title.toLowerCase().includes(term);
      if (said) score += 3;
      else if (inTitle) score += 2;
      else if (hay.includes(term)) score += 1;
      else { ok = false; break; }
    }
    if (ok) scored.push({ v, score });
  }
  scored.sort((a, b) => b.score - a.score || (b.v.ease || 0) - (a.v.ease || 0));
  return scored.map((x) => x.v);
}

/* The views of the library: everything, what is left, what is done, and what
   the learner marked (2026-09-23). A filter rather than a sort — a watched
   episode in its place on the path is still where it was, and "what have I
   not watched yet" is the question a learner opening the tab is asking (the
   owner, 2026-09-19). */
export const VIDEO_FILTERS = [
  { id: "all", name: "All" }, { id: "unwatched", name: "Unwatched" },
  { id: "watched", name: "Watched" }, { id: "faves", name: "Favorites" },
];

/* The channels the library actually holds, in the order the rows will read
   (the owner, 2026-09-28: *"filter by channel where it also prepopulates all
   the different channels in the database"*). Read off the videos rather than
   off `data/curated/channels.json`: the curated file is the credit list, and
   a channel harvested but not yet credited — or credited and not yet
   harvested — would put a filter on the screen that matches nothing. The
   count rides along, because "Easy Russian 147" says more than a name. */
export function channelsOf(list) {
  const n = new Map();
  for (const v of list) if (v.ch) n.set(v.ch, (n.get(v.ch) || 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
               .map(([name, count]) => ({ name, count }));
}

/* The "every channel" choice. A named sentinel rather than null, because the
   drop-down matches its options by id and an id has to be a value. */
export const ALL_CHANNELS = "all";

export const isFave = (st, id) => !!((st.faves || {})[id]);
/* Toggle a favourite: id -> the day it was marked. Keyed on the video id, which
   is YouTube's and survives a rebuild of the library. */
export const toggleFave = (prev, id) => {
  const faves = { ...(prev.faves || {}) };
  if (faves[id]) delete faves[id]; else faves[id] = today();
  return { ...prev, faves };
};

/* A heart, filled when marked. Its own control inside a row that is also a
   control, so it names itself for a reader. */
function Heart({ on, onPress, testID, size = 36 }) {
  const t = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="button"
               accessibilityLabel={on ? "Remove from favorites" : "Add to favorites"}
               accessibilityState={{ selected: !!on }}
               onPress={onPress} hitSlop={8}
               style={({ pressed }) => ({ width: size, height: size, alignItems: "center",
                                          justifyContent: "center", opacity: pressed ? 0.6 : 1 })}>
      <Svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24"
           fill={on ? t.bad : "none"} stroke={on ? t.bad : t.ink3} strokeWidth={2}
           strokeLinecap="round" strokeLinejoin="round">
        <Path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
      </Svg>
    </Pressable>
  );
}

/* Whose videos these are (the owner, 2026-09-23: "indicate that the works
   featured are not my own and provide links to any patreons… give more
   visibility to these people doing the hard work"). Shown once, the first time
   the library opens, and again from the foot of the list. The rows are data
   (`CHANNELS`, from data/curated/channels.json), never a list typed here. */
export function CreatorsNote({ onClose }) {
  const t = useTheme();
  return (
    <Sheet testID="creators-note" onClose={onClose}
           footer={<Btn block kind="pri" label="Got it" style={{ marginTop: 14 }} onPress={onClose} />}>
      <Text style={{ color: t.ink, fontSize: 20, fontWeight: "700" }}>
        Every video here is its creator's, not ours.
      </Text>
      <Muted style={{ marginTop: 6, marginBottom: 14 }}>Made by these channels. Support them.</Muted>
      <List>
        {CHANNELS.map((c) => (
          /* The name on its own line and the links under it. Side by side,
             three buttons took the width and the name was squeezed until it
             broke mid-word ("Compreh / ensible") or, for the longest row,
             vanished into a tall empty box (the 2026-09-30 walkthrough). */
          <Row key={c.name} testID={`creator-${c.name}`}>
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={{ color: t.ink, fontSize: 16, fontWeight: "600" }}>{c.name}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {c.patreon ? <Btn kind="plain" label="Patreon"
                                  onPress={() => Linking.openURL(c.patreon)} /> : null}
                {c.site ? <Btn kind="ghost" label="Site"
                               onPress={() => Linking.openURL(c.site)} /> : null}
                {c.url ? <Btn kind="ghost" label="YouTube"
                              onPress={() => Linking.openURL(c.url)} /> : null}
              </View>
            </View>
          </Row>
        ))}
      </List>
    </Sheet>
  );
}

/* The player's own controls (the owner, 2026-10-01: "skip back 5 seconds,
   forward 5, play/pause (same button)… simple speed controls so the person
   doesn't have to interact with the video itself"). The speeds are the IFrame
   API's own steps; the label is the rate the player reports back. */
export const VIDEO_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SKIP_MS = 5000;

/* What a press on the transport does. */
export function videoActions(player, rate, onRate) {
  const k = Math.max(0, VIDEO_SPEEDS.indexOf(rate));
  return {
    step: (d) => {
      const next = VIDEO_SPEEDS[Math.min(VIDEO_SPEEDS.length - 1, Math.max(0, k + d))];
      if (next === rate) return;
      onRate(next);
      if (player.current) player.current.rate(next);
    },
    skip: (ms) => { if (player.current) player.current.skip(ms, 0, 0); },
    toggle: () => { if (player.current) player.current.toggle(); },
  };
}

/* The transport over the picture, maximised or not (the owner, 2026-10-05:
   "use the overlay… even if it's not maximized (with the scroller too)"). A
   row of buttons under the player covered the subtitles and took a band of the
   screen; this sits in the corners instead.

   Two layers, by how often they are wanted:
   - always there: back and forward five seconds, bottom left, and a thin
     translucent bar along the foot of the picture — "The 5 second
     forward/back can always stay visible in the corner".
   - on a touch, for `OVERLAY_HIDE_MS`: play/pause in the middle, speed bottom
     right, the cog and maximise top right, and the bar's handle — "I only want
     the cursor/settings/speed to pop up for a short period of time when the
     user touches the screen (like one second)". While paused they stay, or
     there would be no way to see how to start it again.

   White on a dark veil, whatever the theme: they sit on the video, not on the
   app. The position arrives through `onTick` rather than a prop, so four
   reports a second redraw this and nothing else on the screen. */
const OVERLAY_HIDE_MS = 1500;
const SCRUB_PAD = 10;          // the bar's inset from the picture's sides
function OverlayButton({ testID, label, onPress, children, size = 40 }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label}
               onPress={onPress} hitSlop={6}
               style={({ pressed }) => ({ minWidth: size, height: size, borderRadius: size / 2, paddingHorizontal: 8,
                 alignItems: "center", justifyContent: "center",
                 backgroundColor: pressed ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.42)" })}>
      {children}
    </Pressable>
  );
}

/* The thin bar: where the video is, and a place to drag to somewhere else.
   The seek happens on release, once — a seek per move would make the player
   chase the finger and stutter. */
function Scrubber({ pos, len, active, onSeek, onTouch }) {
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState(null);
  const frac = (x) => Math.min(1, Math.max(0, x / Math.max(1, width)));
  const shown = drag !== null ? drag : (len > 0 ? Math.min(1, pos / len) : 0);
  const thick = active || drag !== null;
  return (
    <View testID="overlay-scrub" accessibilityRole="adjustable" accessibilityLabel="Position in the video"
          accessibilityValue={{ min: 0, max: Math.round(len / 1000), now: Math.round(pos / 1000) }}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => len > 0}
          onResponderTerminationRequest={() => false}
          onResponderGrant={(e) => { onTouch(); setDrag(frac(e.nativeEvent.locationX)); }}
          onResponderMove={(e) => { onTouch(); setDrag(frac(e.nativeEvent.locationX)); }}
          onResponderRelease={(e) => {
            const f = frac(e.nativeEvent.locationX);
            setDrag(null);
            onSeek(Math.round(f * len));
          }}
          onResponderTerminate={() => setDrag(null)}
          /* The line sits on the picture's very edge: YouTube draws its
             subtitles just above the bottom, and a line through the middle of
             this touch strip ran through them (the emulator, 2026-10-05). */
          style={{ position: "absolute", left: SCRUB_PAD, right: SCRUB_PAD, bottom: 0, height: 22,
                   justifyContent: "flex-end", paddingBottom: 2 }}>
      <View pointerEvents="none"
            style={{ height: thick ? 4 : 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.22)" }}>
        <View style={{ width: `${shown * 100}%`, height: "100%", borderRadius: 2,
                       backgroundColor: "rgba(255,255,255,0.6)" }} />
      </View>
      {thick ? (
        <View pointerEvents="none"
              style={{ position: "absolute", bottom: 0, left: shown * width - 5, width: 10, height: 10, borderRadius: 5,
                       backgroundColor: "rgba(255,255,255,0.9)" }} />
      ) : null}
    </View>
  );
}

/* The maximise glyph, and its way back. */
const MAXIMISE = "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5";
const MINIMISE = "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5";
const COG = "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z";

export function VideoOverlay({ player, playing, rate, onRate, onTick, length = 0, full, onFull, onCog }) {
  const { step, skip, toggle } = videoActions(player, rate, onRate);
  const [shown, setShown] = useState(false);
  const [pos, setPos] = useState(0);
  const [len, setLen] = useState(length);
  const timer = useRef(null);
  useEffect(() => onTick && onTick((ms, l) => { setPos(ms); if (l > 0) setLen(l); }), [onTick]);
  const poke = () => {
    setShown(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(false), OVERLAY_HIDE_MS);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  // Paused, the controls stay; playing, they leave shortly after a touch.
  const up = shown || !playing;
  const press = (fn) => () => { fn(); poke(); };
  const white = "#fff";
  const icon = (d, size = 20) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={white} strokeWidth={2.2}
         strokeLinecap="round" strokeLinejoin="round"><Path d={d} /></Svg>
  );
  const label = (s) => <Text style={{ color: white, fontSize: 13, fontWeight: "700" }}>{s}</Text>;
  const corner = { position: "absolute", flexDirection: "row", alignItems: "center", gap: 6 };
  const edge = full ? 16 : 8;
  return (
    <View testID="video-overlay" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      {/* The picture: a tap shows the controls, or hides them when they are up. */}
      <Pressable testID="overlay-touch" accessibilityLabel="Show controls"
                 style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                 onPress={() => (shown && playing ? setShown(false) : poke())} />
      <View style={[corner, { bottom: 18, left: edge }]}>
        <OverlayButton testID="overlay-back5" label="Back 5 seconds" onPress={press(() => skip(-SKIP_MS))}>{label("−5s")}</OverlayButton>
        <OverlayButton testID="overlay-fwd5" label="Forward 5 seconds" onPress={press(() => skip(SKIP_MS))}>{label("+5s")}</OverlayButton>
      </View>
      {up ? (
        <>
          <View pointerEvents="box-none"
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                         alignItems: "center", justifyContent: "center" }}>
            <OverlayButton testID="overlay-toggle" label={playing ? "Pause" : "Play"} size={52} onPress={press(toggle)}>
              {playing ? icon("M9 5v14M15 5v14", 24)
                : <Svg width={24} height={24} viewBox="0 0 24 24"><Path d="M7 5l12 7-12 7z" fill={white} /></Svg>}
            </OverlayButton>
          </View>
          <View style={[corner, { top: edge, right: edge }]}>
            <OverlayButton testID="overlay-cog" label="Video settings" onPress={() => { onCog(); poke(); }}>{icon(COG)}</OverlayButton>
            <OverlayButton testID={full ? "overlay-exit" : "video-maximise"} label={full ? "Exit full screen" : "Full screen"}
                           onPress={() => { onFull(!full); poke(); }}>{icon(full ? MINIMISE : MAXIMISE)}</OverlayButton>
          </View>
          <View style={[corner, { bottom: 18, right: edge }]}>
            <OverlayButton testID="overlay-slower" label="Slower" onPress={press(() => step(-1))}>{icon("M6 12h12")}</OverlayButton>
            <Text testID="overlay-rate" accessibilityLabel={`Speed ${rate} times`}
                  style={{ color: white, fontSize: 13, fontWeight: "700", minWidth: 34, textAlign: "center",
                           textShadowColor: "rgba(0,0,0,0.8)", textShadowRadius: 3 }}>{`${rate}×`}</Text>
            <OverlayButton testID="overlay-faster" label="Faster" onPress={press(() => step(1))}>{icon("M12 6v12M6 12h12")}</OverlayButton>
          </View>
        </>
      ) : null}
      <Scrubber pos={pos} len={len} active={up} onTouch={poke}
                onSeek={(ms) => { setPos(ms); if (player.current) player.current.seekTo(ms); }} />
    </View>
  );
}

/* The cog's sheet (the owner, 2026-10-05: "just a little watch on YouTube
   button there and subtitle controls"). Resolution and audio-only are not
   here because the embedded player offers neither. */
export function VideoSettings({ videoId, at, captions, onCaptions, onClose }) {
  const t = useTheme();
  return (
    <Sheet testID="video-settings" onClose={onClose}
           footer={<Btn block kind="pri" label="Done" style={{ marginTop: 14 }} onPress={onClose} />}>
      <List>
        <Row>
          <Text style={{ flex: 1, color: t.ink, fontSize: 16 }}>Subtitles</Text>
          <Switch testID="video-captions" value={captions} accessibilityLabel="Subtitles"
                  onValueChange={onCaptions} trackColor={{ true: t.good, false: t.surface3 }} />
        </Row>
        <Row testID="video-youtube"
             onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${videoId}&t=${Math.floor((at || 0) / 1000)}s`)}>
          <Text style={{ flex: 1, color: t.ink, fontSize: 16 }}>Watch on YouTube</Text>
        </Row>
      </List>
    </Sheet>
  );
}

/* What a video holds, before it (the owner, 2026-10-06: "video browser ->
   summary (flashcard option and overview of the relevant vocab/sentences) ->
   video -> questions"): the words it says, in their groups with the
   learner's score on each, its own sentences, the unit's rule, and all of it
   as flashcards. Watch video opens the player, which starts on arrival. */
export function VideoSummary({ route, navigation }) {
  const { st } = useSession();
  const params = route.params || {};
  const v = videoFor(params);
  if (!v) return null;
  const unit = v.unit ? unitById(v.unit) : null;
  const words = Object.keys(v.words || {});
  const lines = unit && unit.v && unit.v.id === v.id ? videoLines(unit) : [];
  const go = () => navigation.navigate("Video",
    { videoId: v.id, unitId: params.unitId, index: params.index, viaSummary: true });
  return (
    <Screen footer={<Btn block kind="pri" testID="summary-continue" label="Watch video" onPress={go} />}>
      <Title sub={[v.ch, unit ? unit.name : null].filter(Boolean).join(" · ")}>{short(v.title)}</Title>
      <PrepList words={words} seen={st.seen || {}} unit={unit} lines={lines} label="In the video"
                onCards={(list) => navigation.navigate("ListCards",
                  { round: "list", words: list.concat(lines.map((l) => l.ru)), title: short(v.title),
                    after: "Back to the summary" })} />
    </Screen>
  );
}

/* "Today", "Yesterday", or the date: History's day headings, as YouTube's. */
function dayHeading(ms, now = Date.now()) {
  const day = (x) => { const d = new Date(x); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const gap = Math.round((day(now) - day(ms)) / 86400000);
  if (gap <= 0) return "Today";
  if (gap === 1) return "Yesterday";
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* History (the owner, 2026-10-01: "Recently viewed can be more of a button
   press rather than forced… a history similar to YouTube where the most
   recently viewed is at the top"). Every video opened, newest first, grouped
   by day; each shows how far through it the learner got, and a tap reopens
   it there (Video resumes from immerse.js's position). */
export function VideoHistory({ navigation }) {
  const t = useTheme();
  const { st } = useSession();
  // Re-read on focus: a video opened from here moves to the top on the way back.
  const [, setTick] = useState(0);
  useEffect(() => (navigation && navigation.addListener
    ? navigation.addListener("focus", () => setTick((n) => n + 1)) : undefined), [navigation]);
  const rows = watchHistory().map((r) => ({ ...r, v: videoById(r.id) })).filter((r) => r.v);
  if (!rows.length) {
    return (
      <Screen>
        <Muted testID="history-empty" style={{ textAlign: "center", marginTop: 30 }}>Nothing watched yet</Muted>
      </Screen>
    );
  }
  const days = [];
  for (const r of rows) {
    const h = dayHeading(r.opened);
    if (!days.length || days[days.length - 1].h !== h) days.push({ h, rows: [] });
    days[days.length - 1].rows.push(r);
  }
  return (
    <Screen>
      {days.map((d) => (
        <View key={d.h} style={{ marginBottom: 16 }}>
          <SectionLabel>{d.h}</SectionLabel>
          <List>
            {d.rows.map(({ v, at }) => {
              const done = v.dur ? Math.min(1, at / (v.dur * 1000)) : 0;
              const watched = videoWatched(st, v);
              return (
                <Row key={v.id} testID={`history-${v.id}`}
                     onPress={() => navigation.navigate("Video", { videoId: v.id })}>
                  <View style={{ width: 120, height: 68, borderRadius: 8, overflow: "hidden",
                                 backgroundColor: t.surface2 }}>
                    <Image source={{ uri: thumbUrl(v.id) }} resizeMode="cover"
                           style={{ width: "100%", height: "100%" }} accessibilityIgnoresInvertColors />
                    {done > 0 ? (
                      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3,
                                     backgroundColor: "rgba(0,0,0,0.35)" }}>
                        <View style={{ width: `${Math.round(done * 100)}%`, height: 3, backgroundColor: t.brand }} />
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={2} style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>
                      {short(v.title)}
                    </Text>
                    <Muted>
                      {[v.ch, watched ? "watched" : at ? `stopped at ${clock(at)}` : minutes(v.dur)]
                        .filter(Boolean).join(" · ")}
                    </Muted>
                  </View>
                </Row>
              );
            })}
          </List>
        </View>
      ))}
    </Screen>
  );
}

export function Immerse({ navigation }) {
  const { st, update } = useSession();
  const t = useTheme();
  /* Where the learner was, read once on the way in (immerse.js) and written
     as it changes, so a trip to another tab, another app or a restart comes
     back to the same search, the same filters and the same place in the list. */
  const kept = libraryState();
  const [query, setQueryRaw] = useState(kept.query || "");
  const [filter, setFilterRaw] = useState(kept.filter || "all");
  const [sort, setSortRaw] = useState(kept.sort || "level");
  const [channel, setChannelRaw] = useState(kept.channel || ALL_CHANNELS);
  const keep = (set, key) => (value) => { set(value); setLibraryState({ [key]: value }); };
  const setQuery = keep(setQueryRaw, "query");
  const setFilter = keep(setFilterRaw, "filter");
  const setSort = keep(setSortRaw, "sort");
  const setChannel = keep(setChannelRaw, "channel");
  const [credits, setCredits] = useState(false);
  const all = videos();
  const channels = useMemo(() => [{ id: ALL_CHANNELS, name: "All channels", note: all.length }]
    .concat(channelsOf(all).map((c) => ({ id: c.name, name: c.name, note: c.count }))), [all.length]);
  const shown = useMemo(() => {
    const found = searchVideos(all, query, sort);
    const byChannel = channel !== ALL_CHANNELS ? found.filter((v) => v.ch === channel) : found;
    return filter === "all" ? byChannel
      : filter === "faves" ? byChannel.filter((v) => isFave(st, v.id))
      : byChannel.filter((v) => videoWatched(st, v) === (filter === "watched"));
  }, [query, filter, sort, channel, st.watched, st.unit, st.faves]);
  /* The creators' note, once: the first time the library opens on this
     profile. Recorded as seen when it is dismissed, not when it is shown, so
     a note the learner left the screen under comes back next time. */
  const noteDue = !(st.notices || {}).immerse;
  const sawNote = () => update((p) => ({ ...p, notices: { ...(p.notices || {}), immerse: today() } }));

  /* "2 of 321 watched" sat above the search (the owner, 2026-09-28: "Remove
     the 2 of 321 watched. Leave the search bar"). The watched filter says the
     same thing when it is wanted, and a tally at the top of the library read
     as a score for not having watched enough. */
  return (
    <Screen restoreY={kept.y || 0} onScrollY={(y) => setLibraryState({ y: Math.round(y) })}>
      <SearchField testID="video-search" value={query} onChangeText={setQuery}
                   placeholder="Search: travel, grammar, B1, слово…" label="Search videos"
                   style={{ marginBottom: 12 }} />
      {/* Three small drop-downs of one shape (ui.js `Dropdown`): what to show,
          whose, and in what order. The watched filter was a row of chips beside
          two drop-downs, and the owner asked for them to match. Each reads as
          its current choice, so the row says what the list is doing. */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 8 }}>
        <Dropdown testID="video-filter" optionPrefix="filter-" title="Show" label="Show"
                  value={filter} options={VIDEO_FILTERS} onPick={setFilter} />
        <Dropdown testID="video-channel" sheetTestID="channel-sheet" optionPrefix="channel-"
                  title="Channel" label="Channel" value={channel} options={channels}
                  onPick={setChannel} style={{ flexShrink: 1 }} />
        <Dropdown testID="video-sort" sheetTestID="sort-sheet" optionPrefix="sort-"
                  title="Sort" label="Sort" value={sort} options={VIDEO_SORTS} onPick={setSort} />
        {/* History beside the filters, the same shape, opened on a press
            rather than shown above the library (the owner, 2026-10-01). A
            clock, YouTube's own mark for it: the word squeezed the channel
            filter to "All cha…" on a phone. */}
        <Pressable testID="video-history" accessibilityRole="button" accessibilityLabel="History"
                   onPress={() => navigation.navigate("VideoHistory")} hitSlop={6}
                   style={({ pressed }) => ({ minHeight: 36, minWidth: 40, paddingHorizontal: 9,
                     alignItems: "center", justifyContent: "center",
                     borderRadius: radius.lg, borderWidth: 1, borderColor: t.line,
                     backgroundColor: t.surface, opacity: pressed ? 0.6 : 1 })}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={t.ink2}
               strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <Path d="M3 3v5h5" />
            <Path d="M12 7v5l3 2" />
          </Svg>
        </Pressable>
      </View>
      {shown.length ? (
        <List>
          {shown.map((v, k) => {
            const watched = videoWatched(st, v);
            const unit = v.unit ? unitById(v.unit) : null;
            return (
              <Row key={v.id} testID={`video-${v.id}`}
                   onPress={() => navigation.navigate("VideoSummary", { videoId: v.id })}>
                <VideoThumb id={v.id} done={watched} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={2}
                        style={{ color: watched ? t.ink2 : t.ink, fontSize: 15, fontWeight: "600" }}>
                    {short(v.title)}
                  </Text>
                  <Muted>
                    {[v.ch, minutes(v.dur), unit ? unit.name : null, v.level]
                      .filter(Boolean).join(" · ")}
                  </Muted>
                </View>
                {/* Said on the row, not only on the thumbnail: a 16 px tick in a
                    corner was the only mark and the owner asked for it to be
                    obvious. Dimmed title, a pill, and the tick — three signs. */}
                {watched ? <Pill tone="good" testID={`watched-${v.id}`}>watched</Pill> : null}
                <Heart on={isFave(st, v.id)} testID={`fave-${v.id}`}
                       onPress={() => update((p) => toggleFave(p, v.id))} />
              </Row>
            );
          })}
        </List>
      ) : (
        <Muted style={{ textAlign: "center", marginTop: 30 }}>
          {query.trim() ? `Nothing matches “${query.trim()}”`
            : filter === "watched" ? "Nothing watched yet"
            : filter === "faves" ? "No favorites yet"
            : channel !== ALL_CHANNELS ? `Nothing left in ${channel}` : "Everything watched"}
        </Muted>
      )}
      {/* The creators, reachable after the first-open note is gone — a credit
          that can be seen once and never again is not a credit. */}
      <Btn kind="ghost" testID="creators-open" label="About the creators"
           style={{ marginTop: 18, alignSelf: "center" }} onPress={() => setCredits(true)} />

      {noteDue || credits ? (
        <CreatorsNote onClose={() => { setCredits(false); if (noteDue) sawNote(); }} />
      ) : null}
    </Screen>
  );
}

export const clock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/* Five seconds of lead-in, ten seconds of playback: enough to hear the run-up to
   the word rather than landing on top of it. */
const LEAD_MS = 5000;
const HOLD_MS = 10000;
// A sentence is played from just before it, and not stopped: it is heard in its place.
const LINE_LEAD_MS = 800;

/* Opened from a dictionary entry at a moment (`word`, `at`): the word is the
   focus from the start, at that occurrence. */
function focusAt(v, params) {
  const occ = params.word && v.words[params.word];
  if (!occ || !occ.length) return null;
  const k = Math.max(0, occ.findIndex((o) => o.t === params.at));
  return { word: params.word, k, n: occ.length, ...occ[k] };
}

/* What the screen shows for a route: the library entry, or for a unit's episode
   the entry with the unit's own heard words first — every word the unit teaches
   that the episode says, then what else it says. Never a word it does not say. */
export function videoFor(params) {
  const unit = params.unitId ? unitById(params.unitId) : null;
  let v = params.videoId ? videoById(params.videoId)
        : unit && unit.v ? (videoById(unit.v.id) || {
            id: unit.v.id, title: unit.v.title, ch: unit.v.ch, dur: unit.v.dur, words: {} })
        : null;
  if (!v) return null;
  const owner = v.unit ? unitById(v.unit) : unit;
  if (owner && owner.v && owner.v.id === v.id && owner.v.heard) {
    const words = { ...owner.v.heard };
    for (const w in (v.words || {})) if (!(w in words)) words[w] = v.words[w];
    v = { ...v, unit: owner.id, words };
  }
  return v;
}

export function Video({ route, navigation }) {
  const { st, update } = useSession();
  const t = useTheme();
  const wordsCtx = useWords();
  const params = route.params || {};
  const v = videoFor(params);
  const [focus, setFocus] = useState(() => (v ? focusAt(v, params) : null));
  /* Opened at a moment with no word to focus — a sentence from the video
     (prep.js VideoLines): the player starts a breath before it and plays on. */
  const at = !focus && typeof params.at === "number" ? params.at : null;
  /* Otherwise it picks up where it was stopped (immerse.js; the owner,
     2026-10-01: "continue exactly where you're at"). The video plays on
     arrival (the owner, 2026-10-06: "start automatically playing the video
     (no play video button)"); the summary before it is where one decides. */
  const resumeAt = useMemo(() => (v && !focus && at === null ? videoPosition(v.id) : 0), [v && v.id]);
  const [playing, setPlaying] = useState(true);
  // Whether the video itself is playing, and how fast, as the player reports.
  const [running, setRunning] = useState(false);
  const [rate, setRate] = useState(1);
  const player = useRef(null);
  // A moment asked for before the player exists is held for onReady.
  const pending = useRef(focus ? [Math.max(0, focus.t - LEAD_MS), HOLD_MS]
                         : at !== null ? [Math.max(0, at - LINE_LEAD_MS), 0]
                         : resumeAt ? [resumeAt, 0] : null);
  useEffect(() => { if (v) openedVideo(v.id); }, [v && v.id]);
  /* The audio on this screen belongs to the video, not to us. Whatever a lesson
     left holding the session is handed back before the player loads, or the
     WebView plays silently and has no way to say why (the owner, 2026-09-10).
     Done here rather than only on the way out of a lesson because the order of
     unmount and mount is not ours to rely on. */
  useEffect(() => { releaseAudio(); }, []);
  /* English under the transcript: on unless the learner turned it off (the
     owner, 2026-10-05: "by default it will track and show the English"),
     the choice kept with the library's. */
  const [showEn, setShowEn] = useState(() => libraryState().en !== false);
  const [pos, setPos] = useState(0);
  /* Maximised: the same player — it is never remounted, so it keeps playing
     where it was. Held upright, the video takes the top half and the
     transcript the bottom; turned sideways, the video takes the whole screen
     (the owner, 2026-10-05). The header, tab bar and status bar get out of
     the way either way, and Back leaves full screen before the video. */
  const [full, setFull] = useState(false);
  const { width: winW, height: winH } = useWindowDimensions();
  const sideways = winW > winH;
  const halfScript = full && !sideways;
  // The transcript follows the position except while the picture fills the screen.
  const scriptOn = useRef(false);
  scriptOn.current = !(full && sideways);
  // The overlay's position, outside React's tree: four a second would
  // otherwise redraw the whole page under the player.
  const ticks = useRef(new Set());
  const onTick = useCallback((f) => { ticks.current.add(f); return () => ticks.current.delete(f); }, []);
  const lastAt = useRef(0);
  const onTime = (ms, len) => {
    lastAt.current = ms;
    if (v) setVideoPosition(v.id, ms, len || (v.dur ? v.dur * 1000 : 0));
    for (const f of ticks.current) f(ms, len);
    if (scriptOn.current) setPos(ms);
  };
  /* Subtitles: YouTube's Russian captions, on unless turned off in the cog
     ("Ensure subtitles are default turned on"); kept with the library's state. */
  const [captions, setCaptions] = useState(() => libraryState().cc !== false);
  const [cog, setCog] = useState(false);
  const setCc = (on) => {
    setCaptions(on);
    setLibraryState({ cc: on });
    if (player.current) player.current.captions(on);
  };
  useEffect(() => {
    if (player.current) player.current.watch(playing);
    return () => { if (player.current) player.current.watch(false); };
  }, [playing]);
  /* The tab bar is not touched here: Video is a run (fullscreen.js), so the
     tabs are already hidden. Setting `tabBarStyle` on the parent from here
     overrode App.js's computed style for good — a key set to undefined still
     overrides — and left that tab's bar unstyled after one full-screen view. */
  useEffect(() => {
    if (full) {
      /* Free to turn: upright is the half-and-half view, sideways the picture
         alone. On Android by the sensor (SCREEN_ORIENTATION_SENSOR, 4), which
         turns whatever the phone's rotation lock says, as a video player
         should, and not upside down — `ALL` is full-sensor and on the
         emulator stood the video on its head. */
      (Platform.OS === "android"
        ? ScreenOrientation.lockPlatformAsync({ screenOrientationConstantAndroid: 4 })
        : ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.ALL)).catch(() => {});
      setStatusBarHidden(true, "fade");
      navigation.setOptions && navigation.setOptions({ headerShown: false });
    }
    const back = full ? BackHandler.addEventListener("hardwareBackPress", () => { setFull(false); return true; }) : null;
    return () => {
      if (back) back.remove();
      if (!full) return;
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      setStatusBarHidden(false, "fade");
      // Every stack registers Video with its header shown (titled, App.js).
      navigation.setOptions && navigation.setOptions({ headerShown: true });
    };
  }, [full]);
  // Full screen belongs to a playing video; if the player goes away, so does it.
  useEffect(() => { if (!playing && full) setFull(false); }, [playing, full]);
  if (!v) return null;
  const script = transcriptOf(v.id);
  const seekTo = (ms) => {
    setPlaying(true);
    setPos(ms);
    if (player.current) player.current.seek(ms, 0);
    else pending.current = [ms, 0];
  };

  const unit = v.unit ? unitById(v.unit) : null;
  const watched = videoWatched(st, v);
  const mined = st.mined || {};

  /* Mining a word: into the review set, with the video and the second it was
     said, so nothing about where it came from is lost. Keyed on the Russian
     string like every other piece of learner state (rule 20.4).

     "Add to review" has to mean the scheduler owns it. `pinned` alone did not:
     its only reader is the Study picker's Trouble set, so a mined word was
     never due, never counted by "Review · N due", and never topped a quiz up —
     the button reported something that had not happened. So the word also gets
     a card, new and due today, exactly the shape the v1 migration gives a word
     with no measured memory. An existing card is left alone: mining a word you
     are already studying must not reset its schedule. */
  const mine = (f) => update((prev) => {
    const seen = { ...(prev.seen || {}) };
    if (!seen[f.word]) {
      seen[f.word] = { recognise: newCard(Date.now()) };
    }
    return {
      ...prev,
      seen,
      pinned: (prev.pinned || []).includes(f.word) ? prev.pinned
        : (prev.pinned || []).concat([f.word]),
      mined: { ...(prev.mined || {}), [f.word]: { v: v.id, t: f.t, s: f.s } },
    };
  });

  const jump = (ms, hold = HOLD_MS) => {
    const at = Math.max(0, ms - (hold ? LEAD_MS : 0));
    if (player.current) player.current.seek(at, hold);
    else pending.current = [at, hold];      // the player is still mounting; run it on ready
  };

  /* Continue marks the video watched and goes on to its questions; with none,
     back to wherever the summary was opened from. A unit's episode also
     counts for its lessons. Opened through the summary, the questions' end
     pops past it too. */
  const finish = () => {
    update((prev) => {
      let next = { ...prev, watched: { ...(prev.watched || {}), [v.id]: today() } };
      if (unit && unit.v && unit.v.id === v.id) {
        next = markComponent(next, unit, params.index || 0, "video");
      }
      return next;
    });
    if (player.current) player.current.pause();
    const behind = params.viaSummary ? 2 : 1;
    if (v.quiz && v.quiz.length) {
      navigation.navigate("VideoQuiz",
        { videoId: v.id, unitId: params.unitId, index: params.index, depth: behind + 1 });
    } else if (navigation.pop) navigation.pop(behind);
    else navigation.goBack();
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* The player sits above the scrolling page once it plays, so the
          video stays in view while the transcript or the word list is read,
          and so maximising it is a change of style rather than a new player
          (a WebView moved to another parent reloads, and the video with it). */}
      {playing ? (
        <View testID={full ? "video-full" : "video-pinned"}
              style={full
                ? { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, elevation: 10,
                    backgroundColor: "#000" }
                : { paddingHorizontal: space.pad, paddingTop: space.pad, paddingBottom: 4, backgroundColor: t.bg }}>
          <View style={full && sideways ? { flex: 1, backgroundColor: "#000" }
                       : full ? { backgroundColor: "#000" }
                       : { aspectRatio: 16 / 9, borderRadius: radius.md, overflow: "hidden", backgroundColor: "#000" }}>
            <View style={full && !sideways ? { width: "100%", aspectRatio: 16 / 9 } : { flex: 1 }}>
              <YouTube
                ref={player}
                videoId={v.id}
                captions={captions}
                onTime={onTime}
                onState={setRunning}
                onRate={setRate}
                onReady={(len) => {
                  if (len > 0) for (const f of ticks.current) f(lastAt.current, len);
                  if (pending.current != null) {
                    player.current && player.current.seek(pending.current[0], pending.current[1]);
                    pending.current = null;
                  }
                  if (player.current) player.current.watch(true);
                }}
              />
              <VideoOverlay player={player} playing={running} rate={rate} onRate={setRate}
                            onTick={onTick} length={v.dur ? v.dur * 1000 : 0}
                            full={full} onFull={setFull} onCog={() => setCog(true)} />
            </View>
          </View>
          {halfScript ? (
            <View testID="video-half-script" style={{ flex: 1, backgroundColor: t.bg, paddingHorizontal: space.pad }}>
              {script && script.length
                ? <Transcript fill lines={script} position={pos} onSeek={seekTo}
                              en={transcriptEnOf(v.id)} showEn={showEn}
                              onToggleEn={() => { setShowEn(!showEn); setLibraryState({ en: !showEn }); }}
                              onWord={(w) => { if (player.current) player.current.pause(); if (wordsCtx) wordsCtx.open(w); }} />
                : <Muted style={{ marginTop: 12 }}>No transcript for this one.</Muted>}
            </View>
          ) : null}
        </View>
      ) : null}
      {cog ? <VideoSettings videoId={v.id} at={lastAt.current} captions={captions}
                            onCaptions={setCc} onClose={() => setCog(false)} /> : null}
    {/* The page is the player and the transcript rolling under it, and one
        way on (the owner, 2026-10-05: "video page just have the video player
        and the transcript rolling… at the bottom of the page, there will be a
        continue button"). What the video holds — its words, their scores,
        its sentences — is the next screen, VideoSummary; its questions the
        one after. */}
    <Screen scroll={false} fill footer={
      <Btn block kind="pri" testID="video-continue" label="Continue" onPress={finish} />}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Title sub={[v.ch, minutes(v.dur), unit ? unit.name : null, watched ? "watched" : null].filter(Boolean).join(" · ")}>
            {short(v.title)}
          </Title>
        </View>
        <Heart on={isFave(st, v.id)} testID={`fave-${v.id}`} size={44}
               onPress={() => update((p) => toggleFave(p, v.id))} />
      </View>
      {/* Picked up where it was stopped, with the way back to the beginning
          (the owner, 2026-10-05: "the option to start from beginning or to
          resume"). */}
      {resumeAt ? (
        <Btn kind="ghost" testID="video-restart" label="From the start" style={{ alignSelf: "flex-start" }}
             onPress={() => { if (player.current) player.current.seek(0, 0); else pending.current = [0, 0]; }} />
      ) : null}
      {/* A word opened from the dictionary's "Heard in" (`word`, `at`): the
          moment, once more, and the word into review (ROADMAP P10.4). */}
      {focus ? (
        <View testID="video-focus" style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
          <Pill tone="brand">{clock(focus.t)}</Pill>
          <Btn kind="ghost" label="Play it again" onPress={() => { setPlaying(true); jump(focus.t); }} />
          <View style={{ flex: 1 }} />
          {mined[focus.word]
            ? <Muted testID="mined">Added to review</Muted>
            : <Btn testID="mine" label="Add to review" onPress={() => mine(focus)} />}
        </View>
      ) : null}

      {/* The transcript, always (the owner: "the transcript automatically
          shows below"), following the video and with its English unless the
          learner has turned either off. */}
      {!halfScript ? (
        script && script.length
          ? <Transcript fill lines={script} position={pos} onSeek={seekTo}
                        en={transcriptEnOf(v.id)} showEn={showEn}
                        onToggleEn={() => { setShowEn(!showEn); setLibraryState({ en: !showEn }); }}
                        onWord={(w) => { if (player.current) player.current.pause(); if (wordsCtx) wordsCtx.open(w); }} />
          : <Muted style={{ marginTop: 8 }}>No transcript for this one.</Muted>
      ) : null}
    </Screen>
    </View>
  );
}
