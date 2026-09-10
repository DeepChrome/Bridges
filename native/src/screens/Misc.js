/* Immerse (the video library), the video player, and the profile gate. */

import React, { useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Image } from "react-native";
import { YouTube } from "../youtube";
import { useSession } from "../session";
import { useTheme, radius } from "../theme";
import { Screen, List, Row, Card, Btn, Pill, Thumb, Muted, Title, Avatar, AV, AV_IDS, SearchField, SectionLabel } from "../ui";
import {
  UN, STATS, unitState, markComponent, L, videos, videoById, videoWatched, unitById,
  idxOfWord,
} from "../data";
import { fold, today, firstSense } from "@core/util";
import { Intro } from "./Intro";

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

/* The library in its resting order: the units' own episodes along the path, then
   everything else easiest first. A search replaces the order with relevance:
   every word of the query must be found in the video's keywords or title, or —
   typed in Cyrillic — be a study word the video says. */
export function libraryOrder(videos) {
  const unitPos = {};
  UN.forEach((u, k) => { unitPos[u.id] = k; });
  return videos.slice().sort((a, b) => {
    const ua = a.unit ? unitPos[a.unit] : Infinity;
    const ub = b.unit ? unitPos[b.unit] : Infinity;
    if (ua !== ub) return ua - ub;
    return (b.ease || 0) - (a.ease || 0);
  });
}

/* A CEFR code typed as a search term ("b1", "B1+", "a2") filters on the video's
   code: "b1" takes B1 and B1+, "b1+" only B1+. The codes are never displayed. */
const CEFR_TERM = /^[abc][12]\+?$/;
const cefrMatches = (term, code) => {
  if (!code) return false;
  const c = code.toLowerCase();
  return term.endsWith("+") ? c === term : c === term || c === term + "+";
};

export function searchVideos(videos, query) {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return libraryOrder(videos);
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

export function Immerse({ navigation }) {
  const { st } = useSession();
  const t = useTheme();
  const [query, setQuery] = useState("");
  const all = videos();
  const seen = all.filter((v) => videoWatched(st, v)).length;
  const shown = useMemo(() => searchVideos(all, query), [query]);

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6,
                     marginBottom: 12 }}>
        <Text style={{ color: t.ink, fontSize: 20, fontWeight: "700" }}>{seen}</Text>
        <Muted size={14}>{`of ${all.length} watched`}</Muted>
      </View>
      <SearchField testID="video-search" value={query} onChangeText={setQuery}
                   placeholder="Search: travel, grammar, B1, слово…" label="Search videos"
                   style={{ marginBottom: 12 }} />
      {shown.length ? (
        <List>
          {shown.map((v, k) => {
            const watched = videoWatched(st, v);
            const unit = v.unit ? unitById(v.unit) : null;
            return (
              <Row key={v.id} last={k === shown.length - 1}
                   onPress={() => navigation.navigate("Video", { videoId: v.id })}>
                <VideoThumb id={v.id} done={watched} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={2}
                        style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>
                    {short(v.title)}
                  </Text>
                  <Muted>
                    {[v.ch, minutes(v.dur), unit ? unit.name : null, v.level]
                      .filter(Boolean).join(" · ")}
                  </Muted>
                </View>
              </Row>
            );
          })}
        </List>
      ) : (
        <Muted style={{ textAlign: "center", marginTop: 30 }}>
          {`Nothing matches “${query.trim()}”`}
        </Muted>
      )}
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
  const params = route.params || {};
  const v = videoFor(params);
  const [focus, setFocus] = useState(() => (v ? focusAt(v, params) : null));
  const [playing, setPlaying] = useState(!!focus);
  const player = useRef(null);
  // A moment asked for before the player exists is held for onReady.
  const pending = useRef(focus ? [Math.max(0, focus.t - LEAD_MS), HOLD_MS] : null);
  if (!v) return null;

  const unit = v.unit ? unitById(v.unit) : null;
  const words = Object.keys(v.words || {});
  const watched = videoWatched(st, v);
  const mined = st.mined || {};

  /* Mining a word: into the review set, with the video and the second it was
     said, so nothing about where it came from is lost. Keyed on the Russian
     string like every other piece of learner state (rule 20.4). */
  const mine = (f) => update((prev) => ({
    ...prev,
    pinned: (prev.pinned || []).includes(f.word) ? prev.pinned
      : (prev.pinned || []).concat([f.word]),
    mined: { ...(prev.mined || {}), [f.word]: { v: v.id, t: f.t, s: f.s } },
  }));

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
      <Title sub={[v.ch, minutes(v.dur), unit ? unit.name : null, watched ? "watched" : null].filter(Boolean).join(" · ")}>
        {short(v.title)}
      </Title>
      {playing ? (
        <View style={{ aspectRatio: 16 / 9, borderRadius: radius.md,
                       overflow: "hidden", backgroundColor: "#000" }}>
          <YouTube
            ref={player}
            videoId={v.id}
            onReady={() => {
              if (pending.current != null) {
                player.current && player.current.seek(pending.current[0], pending.current[1]);
                pending.current = null;
              }
            }}
          />
        </View>
      ) : (
        <Btn kind="pri" label="Play here" onPress={() => setPlaying(true)} />
      )}

      <SectionLabel style={{ marginTop: 18 }}>Listen for</SectionLabel>
      {/* One word a line with its meaning beside it, not a wrap of bare chips
          (the owner, 2026-09-10): the list is read before watching, and a word
          without its English says nothing to listen for. */}
      {words.length ? (
        <List>
          {words.map((word, k) => {
            const occ = v.words[word];
            const active = focus && focus.word === word;
            const entry = L[idxOfWord(word)];
            return (
              <Row key={word} testID={`heard-${word}`} last={k === words.length - 1}
                   onPress={() => openWord(word)}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: "600",
                                 color: active ? t.brandInk : t.ink }}>
                    {entry ? entry.w : word}
                  </Text>
                  {entry && firstSense(entry) ? (
                    <Muted numberOfLines={1}>{firstSense(entry)}</Muted>
                  ) : null}
                </View>
                <Muted size={12}>{occ.length > 1 ? `${occ.length}×` : ""}</Muted>
              </Row>
            );
          })}
        </List>
      ) : (
        <Muted>No study words are spoken in this one.</Muted>
      )}

      {focus ? (
        <Card style={{ marginTop: 14 }}>
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
              In your review, from here
            </Muted>
          ) : (
            <Btn kind="pri" testID="mine" label="Add to review" style={{ marginTop: 8 }}
                 onPress={() => mine(focus)} />
          )}
        </Card>
      ) : null}

      {v.chapters && v.chapters.length ? (
        <>
          <SectionLabel style={{ marginTop: 18 }}>Chapters</SectionLabel>
          <List>
            {v.chapters.map((c, k) => (
              <Row key={k} last={k === v.chapters.length - 1}
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

/* --------------------------------------------------------------- gate */

export function Gate({ onPlacement }) {
  const { accounts, createProfile, selectProfile } = useSession();
  const t = useTheme();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(AV_IDS[0]);
  const [creating, setCreating] = useState(!accounts.list.length);
  const [offer, setOffer] = useState(null);
  const [toured, setToured] = useState(false);

  /* The profile is created by the *choice* below, not by Continue.
     Creating it earlier sets the active account, which is exactly the condition the
     shell uses to leave the gate — so the app would swap to the tabs and unmount
     this screen before the question could be asked. Holding the name and avatar
     here until the learner answers keeps the gate in charge of its own flow. */
  const start = async (wanted) => {
    await createProfile(offer.name, offer.avatar);
    onPlacement(wanted);
  };

  // The tour sits between the name and the first choice: the first profile on
  // this phone sees it once; a second profile skips it.
  if (offer && !toured && accounts.list.length === 0) {
    return <Intro onDone={() => setToured(true)} />;
  }

  if (offer) {
    return (
      <Screen>
        <Title sub="A short test can skip what you already know.">
          Where should we start?
        </Title>
        <List>
          <Row onPress={() => start(true)}>
            <Avatar id={offer.avatar} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>
                Take the placement test
              </Text>
              <Muted>50 questions · about 10 minutes</Muted>
            </View>
          </Row>
          <Row last onPress={() => start(false)}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>
                Start from the beginning
              </Text>
              <Muted>You can test out of a section later</Muted>
            </View>
          </Row>
        </List>
      </Screen>
    );
  }

  if (!creating) {
    return (
      <Screen>
        <Title>Who's studying?</Title>
        <List>
          {accounts.list.map((a, k) => (
            <Row key={a.id} last={k === accounts.list.length - 1}
                 onPress={() => selectProfile(a.id)}>
              <Avatar id={a.avatar} size={44} />

              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>
                  {a.name}
                </Text>
                <Muted>{a.placed ? `Placed at chapter ${a.placed + 1}` : "Tap to continue"}</Muted>
              </View>
            </Row>
          ))}
        </List>
        <Btn style={{ marginTop: 14 }} label="New profile"
             onPress={() => setCreating(true)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title sub="Pick a character and a name.">Welcome to Bridges</Title>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10,
                     marginBottom: 14 }}>
        {AV_IDS.map((id) => (
          <Pressable
            key={id}
            accessibilityLabel={AV[id].name}
            onPress={() => setAvatar(id)}
            style={{ width: 62, height: 62, borderRadius: 31, borderWidth: 2, padding: 2,
                     borderColor: id === avatar ? t.brand : "transparent",
                     alignItems: "center", justifyContent: "center" }}
          >
            <Avatar id={id} size={54} />
          </Pressable>
        ))}
      </View>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        placeholderTextColor={t.ink3}
        style={{ backgroundColor: t.surface, borderColor: t.line, borderWidth: 1,
                 borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13,
                 fontSize: 17, color: t.ink }}
      />
      <Btn kind="pri" style={{ marginTop: 14 }} label="Continue"
           onPress={() => setOffer({ name: name.trim(), avatar })} />
    </Screen>
  );
}
