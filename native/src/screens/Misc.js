/* Immerse (the video library) and the video player. */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Image, Pressable, Linking } from "react-native";
import Svg, { Path } from "react-native-svg";
import { YouTube } from "../youtube";
import { useSession } from "../session";
import { useTheme, radius } from "../theme";
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

/* The player's own controls, under it (the owner, 2026-10-01: "skip back 5
   seconds, forward 5, play/pause (same button)… simple speed controls so the
   person doesn't have to interact with the video itself"). The speeds are the
   IFrame API's own steps; the label is the rate the player reports back. */
export const VIDEO_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SKIP_MS = 5000;

function CtlButton({ testID, label, onPress, children, wide }) {
  const t = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label}
               onPress={onPress} hitSlop={4}
               style={({ pressed }) => ({ minWidth: wide ? 52 : 44, height: 44, borderRadius: radius.md,
                 alignItems: "center", justifyContent: "center", paddingHorizontal: 8,
                 backgroundColor: wide ? t.brand : t.surface2, opacity: pressed ? 0.6 : 1 })}>
      {children}
    </Pressable>
  );
}

export function VideoControls({ player, playing, rate, onRate }) {
  const t = useTheme();
  const k = Math.max(0, VIDEO_SPEEDS.indexOf(rate));
  const step = (d) => {
    const next = VIDEO_SPEEDS[Math.min(VIDEO_SPEEDS.length - 1, Math.max(0, k + d))];
    if (next === rate) return;
    onRate(next);
    if (player.current) player.current.rate(next);
  };
  const skip = (ms) => { if (player.current) player.current.skip(ms, 0, 0); };
  const icon = (d, color = t.ink) => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2}
         strokeLinecap="round" strokeLinejoin="round"><Path d={d} /></Svg>
  );
  return (
    <View testID="video-controls" style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 8 }}>
      <CtlButton testID="video-back5" label="Back 5 seconds" onPress={() => skip(-SKIP_MS)}>
        <Text style={{ color: t.ink, fontSize: 13, fontWeight: "700" }}>−5s</Text>
      </CtlButton>
      <CtlButton testID="video-toggle" label={playing ? "Pause" : "Play"} wide
                 onPress={() => { if (player.current) player.current.toggle(); }}>
        {playing
          ? icon("M9 5v14M15 5v14", t.brandOn)
          : <Svg width={20} height={20} viewBox="0 0 24 24"><Path d="M7 5l12 7-12 7z" fill={t.brandOn} /></Svg>}
      </CtlButton>
      <CtlButton testID="video-fwd5" label="Forward 5 seconds" onPress={() => skip(SKIP_MS)}>
        <Text style={{ color: t.ink, fontSize: 13, fontWeight: "700" }}>+5s</Text>
      </CtlButton>
      <View style={{ flex: 1 }} />
      <CtlButton testID="video-slower" label="Slower" onPress={() => step(-1)}>
        {icon("M6 12h12")}
      </CtlButton>
      <Text testID="video-rate" accessibilityLabel={`Speed ${rate} times`}
            style={{ color: t.ink, fontSize: 15, fontWeight: "700", minWidth: 44, textAlign: "center" }}>
        {`${rate}×`}
      </Text>
      <CtlButton testID="video-faster" label="Faster" onPress={() => step(1)}>
        {icon("M12 6v12M6 12h12")}
      </CtlButton>
    </View>
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
                   onPress={() => navigation.navigate("Video", { videoId: v.id })}>
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
     2026-10-01: "continue exactly where you're at"). Asked for, not
     automatic: the button says where, and pressing it plays from there. */
  const resumeAt = useMemo(() => (v && !focus && at === null ? videoPosition(v.id) : 0), [v && v.id]);
  const [playing, setPlaying] = useState(!!focus || at !== null);
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
  /* The transcript panel (transcript.js): loaded on first open, and the
     player reports its position only while the panel is showing. */
  const [showScript, setShowScript] = useState(false);
  // English under the transcript: the learner's last choice, kept with the library's.
  const [showEn, setShowEn] = useState(() => !!libraryState().en);
  const [pos, setPos] = useState(0);
  /* The position is reported whenever the video plays — it is where the
     learner will come back to — but only redraws the screen while the
     transcript needs it; four renders a second of everything below the player
     would buy nothing. */
  const scriptOn = useRef(false);
  scriptOn.current = showScript;
  const onTime = (ms) => {
    if (v) setVideoPosition(v.id, ms, v.dur ? v.dur * 1000 : 0);
    if (scriptOn.current) setPos(ms);
  };
  useEffect(() => {
    if (player.current) player.current.watch(playing);
    return () => { if (player.current) player.current.watch(false); };
  }, [playing]);
  if (!v) return null;
  const script = showScript ? transcriptOf(v.id) : null;
  const seekTo = (ms) => {
    setPlaying(true);
    setPos(ms);
    if (player.current) player.current.seek(ms, 0);
    else pending.current = [ms, 0];
  };

  const unit = v.unit ? unitById(v.unit) : null;
  const words = Object.keys(v.words || {});
  const watched = videoWatched(st, v);
  // The video's own sentences, when it is a unit's goal (build_video_lines.py).
  const lines = unit && unit.v && unit.v.id === v.id ? videoLines(unit) : [];
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

  /* Tapping the same word again walks to its next occurrence, so a word said five
     times is five listening chances rather than the same one replayed. */
  const openWord = (word) => {
    const occ = v.words[word];
    if (!occ || !occ.length) return;
    const k = focus && focus.word === word ? (focus.k + 1) % occ.length : 0;
    setFocus({ word, k, n: occ.length, ...occ[k] });
    setPlaying(true);
    jump(occ[k].t);
  };

  const markWatched = () => {
    update((prev) => {
      let next = { ...prev, watched: { ...(prev.watched || {}), [v.id]: today() } };
      // A unit's episode also counts for the unit's lessons, as before.
      if (unit && unit.v && unit.v.id === v.id) {
        next = markComponent(next, unit, route.params.index || 0, "video");
      }
      return next;
    });
    navigation.goBack();
  };

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Title sub={[v.ch, minutes(v.dur), unit ? unit.name : null, watched ? "watched" : null].filter(Boolean).join(" · ")}>
            {short(v.title)}
          </Title>
        </View>
        <Heart on={isFave(st, v.id)} testID={`fave-${v.id}`} size={44}
               onPress={() => update((p) => toggleFave(p, v.id))} />
      </View>
      {playing ? (
        <>
          <View style={{ aspectRatio: 16 / 9, borderRadius: radius.md,
                         overflow: "hidden", backgroundColor: "#000" }}>
            <YouTube
              ref={player}
              videoId={v.id}
              onTime={onTime}
              onState={setRunning}
              onRate={setRate}
              onReady={() => {
                if (pending.current != null) {
                  player.current && player.current.seek(pending.current[0], pending.current[1]);
                  pending.current = null;
                }
                if (player.current) player.current.watch(true);
              }}
            />
          </View>
          <VideoControls player={player} playing={running} rate={rate} onRate={setRate} />
        </>
      ) : (
        <Btn kind="pri" testID="video-play"
             label={resumeAt ? `Resume from ${clock(resumeAt)}` : "Play here"}
             onPress={() => setPlaying(true)} />
      )}
      <Btn testID="transcript-toggle" style={{ marginTop: 10 }}
           label={showScript ? "Hide transcript" : "Transcript"} onPress={() => setShowScript(!showScript)} />
      {showScript ? (
        script && script.length
          ? <Transcript lines={script} position={pos} onSeek={seekTo}
                        en={transcriptEnOf(v.id)} showEn={showEn}
                        onToggleEn={() => { setShowEn(!showEn); setLibraryState({ en: !showEn }); }}
                        onWord={(w) => { if (player.current) player.current.pause(); if (wordsCtx) wordsCtx.open(w); }} />
          : <Muted style={{ marginTop: 8 }}>No transcript for this one.</Muted>
      ) : null}

      {/* The tapped word sits under the player, not under the list.
          The list runs to VIDEO_WORDS (20) rows of 56 px, so about eleven
          hundred pixels stood between the player and this card: tapping a word
          set the focus and seeked the video, both off screen, and read as the
          tap having done nothing at all (the interface review, P11.9).

          Moved rather than scrolled to. The card is *about* the player's
          position and its two actions belong beside the thing playing; a
          scroll-to would also slide the word list out from under the finger,
          which fights the repeat gesture — tapping the same word again walks to
          its next occurrence. */}
      {focus ? (
        <Card testID="video-focus" style={{ marginTop: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <Pill tone="brand">{clock(focus.t)}</Pill>
            <View style={{ flex: 1 }} />
            <Muted>{focus.n > 1 ? `${focus.k + 1} of ${focus.n}` : "once"}</Muted>
          </View>
          <Text style={{ color: t.ink2, fontSize: 15, lineHeight: 22 }}>{focus.s}</Text>
          <Btn label="Play it again" style={{ marginTop: 12 }}
               onPress={() => { setPlaying(true); jump(focus.t); }} />
          {/* One tap takes the word into review and keeps where it was heard, so
              the flashcard can send you back to this second (ROADMAP P10.4).
              What serious learners do by hand across three tools. */}
          {mined[focus.word] ? (
            <Muted testID="mined" style={{ textAlign: "center", marginTop: 10 }}>
              Added to review
            </Muted>
          ) : (
            <Btn kind="pri" testID="mine" label="Add to review" style={{ marginTop: 8 }}
                 onPress={() => mine(focus)} />
          )}
        </Card>
      ) : null}

      {/* The words to have in hand before pressing play (§30bf): underlined
          for the dictionary, the learner's score beside each, an arrow to the
          moment it is said, and the whole list as flashcards. */}
      <PrepList words={words} seen={st.seen || {}} unit={unit}
                focusWord={focus ? focus.word : null} onJump={openWord}
                lines={lines}
                onMoment={(l) => { setFocus(null); setPlaying(true); jump(Math.max(0, l.t - LINE_LEAD_MS), 0); }}
                onCards={(list) => navigation.navigate("ListCards",
                  { round: "list", words: list.concat(lines.map((l) => l.ru)), title: "Before the video",
                    after: "Continue to video" })} />

      {v.chapters && v.chapters.length ? (
        <>
          <SectionLabel style={{ marginTop: 18 }}>Chapters</SectionLabel>
          <List>
            {v.chapters.map((c, k) => (
              <Row key={k}
                   onPress={() => { setPlaying(true); jump(c.t * 1000, 0); }}>
                <Pill>{clock(c.t * 1000)}</Pill>
                <Text style={{ flex: 1, color: t.ink, fontSize: 15 }} numberOfLines={2}>
                  {c.title}
                </Text>
              </Row>
            ))}
          </List>
        </>
      ) : null}

      {/* Once watched, the fact sits by the title (the thumbnail in the library
          shows it too); a primary button reading "Watched" that went back was a
          third way of saying the same thing. */}
      {watched ? (
        <Btn kind="ghost" style={{ marginTop: 20 }} label="Back" onPress={() => navigation.goBack()} />
      ) : (
        <Btn kind="pri" style={{ marginTop: 20 }} label="Mark as watched" onPress={markWatched} />
      )}
    </Screen>
  );
}
