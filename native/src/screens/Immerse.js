/* Immerse (the video library): the list, its history, and the creators' note. */

import React, { useEffect, useMemo, useState } from "react";
import { View, Image, Pressable, Linking } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSession } from "../session";
import { useTheme, type as T } from "../theme";
import { Screen, List, Row, Btn, Pill, Muted, SearchField, SectionLabel, Sheet, Dropdown, Text, SegmentTabs, RowText } from "../ui";
import { MEDIA } from "@core/media";
import { videos, videoById, videoWatched, unitById, CHANNELS, routePosition, rankOf, KNOWN_AT } from "../data";
import { libraryState, setLibraryState, watchHistory } from "../immerse";
import { today } from "@core/util";
import { familiarity, cardFor } from "@core/scheduler";
import { talkLevelFor } from "./Talk";
import { short, minutes, clock, isFave, toggleFave, VIDEO_SORTS, searchVideos, channelsOf, suggestVideos } from "../video";

/* ------------------------------------------------------------- immerse */

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
          <Text style={{ color: t.goodOn, fontSize: 10, fontWeight: "700" }}>✓</Text>
        </View>
      ) : null}
    </View>
  );
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

/* The "every channel" choice. A named sentinel rather than null, because the
   drop-down matches its options by id and an id has to be a value. */
export const ALL_CHANNELS = "all";

/* A heart, filled when marked. Its own control inside a row that is also a
   control, so it names itself for a reader. */
export function Heart({ on, onPress, testID, size = 36 }) {
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
                    <Text numberOfLines={2} style={{ color: t.ink, fontSize: T.body, fontWeight: "600" }}>
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

/* Russian beyond the app (core/media.js; the owner, 2026-11-23: "a whole list
   of reputable Russian movies, songs, podcasts, and other media and
   materials"): grouped, each with its English, year, level and one line on
   why, opening a search or the site itself. */
function Recommended() {
  return (
    <View testID="media-list">
      {MEDIA.map((g, k) => (
        <View key={g.id} style={{ marginTop: k ? 18 : 4 }}>
          <SectionLabel>{g.name}</SectionLabel>
          <List>
            {g.items.map((x) => (
              <Row key={x.ru} testID={`media-${g.id}-${x.ru}`} onPress={() => Linking.openURL(x.url).catch(() => {})}>
                <RowText title={x.ru} sub={[x.en, x.year, x.level].filter(Boolean).join(" · ")} />
                <Muted size={T.small} style={{ maxWidth: "42%", textAlign: "right" }}>{x.why}</Muted>
              </Row>
            ))}
          </List>
        </View>
      ))}
    </View>
  );
}
const IMMERSE_TABS = [{ id: "videos", name: "Videos" }, { id: "picks", name: "Recommended" }];

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
  const [tab, setTabRaw] = useState(kept.tab === "picks" ? "picks" : "videos");
  const setTab = keep(setTabRaw, "tab");
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
  /* The suggestions: three at a time, "Show others" the next three. Read off
     the learner's own cards — a word is known at KNOWN_AT, the drills' bar. */
  const [suggest, setSuggest] = useState(false);
  const [skip, setSkip] = useState(0);
  const picks = useMemo(() => (suggest ? suggestVideos(all, {
    known: (w) => (familiarity(cardFor((st.seen || {})[w]), rankOf(w)) || 0) >= KNOWN_AT,
    stage: routePosition(st).stage, level: talkLevelFor(st), watched: (v) => videoWatched(st, v), skip,
  }) : []), [suggest, skip, st.seen, st.watched, st.unit]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* "2 of 321 watched" sat above the search (the owner, 2026-09-28: "Remove
     the 2 of 321 watched. Leave the search bar"). The watched filter says the
     same thing when it is wanted, and a tally at the top of the library read
     as a score for not having watched enough. */
  const tabs = <SegmentTabs testID="immerse-tabs" options={IMMERSE_TABS} value={tab} onPick={setTab} />;
  if (tab === "picks") {
    return (
      <Screen>
        <View style={{ marginBottom: 12 }}>{tabs}</View>
        <Recommended />
      </Screen>
    );
  }
  return (
    <Screen restoreY={kept.y || 0} onScrollY={(y) => setLibraryState({ y: Math.round(y) })}>
      <View style={{ marginBottom: 12 }}>{tabs}</View>
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
        {/* A few videos for this learner (video.js suggestVideos; the owner,
            2026-11-19): a sparkle-free star, the same pill shape, opening a
            sheet of three with why each. */}
        <Pressable testID="video-suggest" accessibilityRole="button" accessibilityLabel="For you"
                   onPress={() => { setSkip(0); setSuggest(true); }} hitSlop={6}
                   style={({ pressed }) => ({ minHeight: 36, minWidth: 40, paddingHorizontal: 9,
                     alignItems: "center", justifyContent: "center", borderRadius: 99,
                     backgroundColor: t.brandBg, opacity: pressed ? 0.6 : 1 })}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={t.brandInk}
               strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
          </Svg>
        </Pressable>
        {/* History beside the filters, the same shape, opened on a press
            rather than shown above the library (the owner, 2026-10-01). A
            clock, YouTube's own mark for it: the word squeezed the channel
            filter to "All cha…" on a phone. */}
        <Pressable testID="video-history" accessibilityRole="button" accessibilityLabel="History"
                   onPress={() => navigation.navigate("VideoHistory")} hitSlop={6}
                   style={({ pressed }) => ({ minHeight: 36, minWidth: 40, paddingHorizontal: 9,
                     alignItems: "center", justifyContent: "center",
                     borderRadius: 99,
                     backgroundColor: t.surface2, opacity: pressed ? 0.6 : 1 })}>
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
                        style={{ color: watched ? t.ink2 : t.ink, fontSize: T.body, fontWeight: "600" }}>
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
      {suggest ? (
        <Sheet testID="suggest-sheet" title="For you" onClose={() => setSuggest(false)}
               footer={(
                 <View style={{ marginTop: 10 }}>
                   <Btn kind="pri" block label="Done" onPress={() => setSuggest(false)} />
                   <Btn kind="link" testID="suggest-more" label="Show others" style={{ alignSelf: "center", marginTop: 4 }}
                        onPress={() => setSkip(skip + 3)} />
                 </View>
               )}>
          {picks.length ? (
            <List>
              {picks.map(({ v, held, total }) => (
                <Row key={v.id} testID={`suggest-${v.id}`}
                     onPress={() => { setSuggest(false); navigation.navigate("VideoSummary", { videoId: v.id }); }}>
                  <VideoThumb id={v.id} done={false} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={2} style={{ color: t.ink, fontSize: T.body, fontWeight: "600" }}>{short(v.title)}</Text>
                    {/* Why: how much of it they already hold, and how long it is. */}
                    <Muted>{[`${held} of ${total} words known`, minutes(v.dur)].filter(Boolean).join(" · ")}</Muted>
                  </View>
                </Row>
              ))}
            </List>
          ) : <Muted testID="suggest-empty" style={{ textAlign: "center" }}>Nothing left to suggest</Muted>}
        </Sheet>
      ) : null}
    </Screen>
  );
}
