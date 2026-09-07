/* Immerse (the video library), the video player, and the profile gate. */

import React, { useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { YouTube } from "../youtube";
import { useSession } from "../session";
import { useTheme, radius } from "../theme";
import { Screen, List, Row, Card, Btn, Pill, Thumb, Muted, Title, Avatar, AV, AV_IDS } from "../ui";
import {
  UN, STATS, unitState, markComponent, L, VIDEOS, videoById, videoWatched, unitById,
} from "../data";
import { fold, today } from "@core/util";
import { Intro } from "./Intro";

/* ------------------------------------------------------------- immerse */

const short = (title) => title.split(" | ")[0].trim();
const minutes = (dur) => (dur ? `${Math.round(dur / 60)} min` : "");

/* A channel's mark where a unit's icon would be: its initials, so the rows of a
   library from several sources read at a glance. */
function ChannelMark({ name, done }) {
  const t = useTheme();
  const initials = (name || "").split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("");
  return (
    <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: "center",
                   justifyContent: "center", backgroundColor: done ? t.goodBg : t.surface2,
                   borderWidth: done ? 2 : 0, borderColor: t.good }}>
      <Text style={{ color: done ? t.good : t.ink3, fontSize: 13, fontWeight: "700",
                     letterSpacing: 0.5 }}>{initials.toUpperCase()}</Text>
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

export function searchVideos(videos, query) {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return libraryOrder(videos);
  const scored = [];
  for (const v of videos) {
    const hay = ((v.kw || "") + " " + v.title + " " + (v.ch || "")).toLowerCase();
    let score = 0, ok = true;
    for (const term of terms) {
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
  const seen = VIDEOS.filter((v) => videoWatched(st, v)).length;
  const shown = useMemo(() => searchVideos(VIDEOS, query), [query]);

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6,
                     marginBottom: 12 }}>
        <Text style={{ color: t.ink, fontSize: 20, fontWeight: "700" }}>{seen}</Text>
        <Muted size={14}>{`of ${VIDEOS.length} watched`}</Muted>
      </View>
      <TextInput
        testID="video-search"
        value={query}
        onChangeText={setQuery}
        placeholder="Search: travel, grammar, beginner, слово…"
        placeholderTextColor={t.ink3}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        accessibilityLabel="Search videos"
        style={{ backgroundColor: t.surface, borderColor: t.line, borderWidth: 1,
                 borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11,
                 fontSize: 16, color: t.ink, marginBottom: 12 }}
      />
      {shown.length ? (
        <List>
          {shown.map((v, k) => {
            const watched = videoWatched(st, v);
            const unit = v.unit ? unitById(v.unit) : null;
            return (
              <Row key={v.id} last={k === shown.length - 1}
                   onPress={() => navigation.navigate("Video", { videoId: v.id })}>
                {unit ? <Thumb id={unit.id} done={watched} />
                      : <ChannelMark name={v.ch} done={watched} />}
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
                {watched ? <Pill tone="good">seen</Pill> : null}
              </Row>
            );
          })}
        </List>
      ) : (
        <Muted style={{ textAlign: "center", marginTop: 30 }}>
          {`Nothing matches “${query.trim()}”`}
        </Muted>
      )}
      <Muted style={{ textAlign: "center", marginTop: 20 }}>
        {`Videos from ${(STATS.channels || []).filter(Boolean).join(", ")}. ` +
         "The words under each one are the ones it actually says."}
      </Muted>
    </Screen>
  );
}

const clock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/* Five seconds of lead-in, ten seconds of playback: enough to hear the run-up to
   the word rather than landing on top of it. */
const LEAD_MS = 5000;
const HOLD_MS = 10000;

/* What the screen shows for a route: the library entry, or for a unit's episode
   the entry with the unit's own heard words first — every word the unit teaches
   that the episode says, then what else it says. Never a word it does not say. */
export function videoFor(params) {
  const unit = params.unitId ? unitById(params.unitId) : null;
  let v = params.videoId ? videoById(params.videoId)
        : unit && unit.v ? (VIDEOS.find((x) => x.id === unit.v.id) || {
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
  const v = videoFor(route.params || {});
  const [playing, setPlaying] = useState(false);
  const [focus, setFocus] = useState(null);
  const player = useRef(null);
  const pending = useRef(null);
  if (!v) return null;

  const unit = v.unit ? unitById(v.unit) : null;
  const words = Object.keys(v.words || {});
  const watched = videoWatched(st, v);

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
      <Title sub={[v.ch, minutes(v.dur), unit ? unit.name : null].filter(Boolean).join(" · ")}>
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

      <Text style={{ color: t.ink3, fontSize: 11, fontWeight: "600", letterSpacing: 1,
                     textTransform: "uppercase", marginTop: 18, marginBottom: 8 }}>
        Listen for
      </Text>
      {words.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
          {words.map((word) => {
            const occ = v.words[word];
            const active = focus && focus.word === word;
            return (
              <Pressable
                key={word}
                onPress={() => openWord(word)}
                accessibilityRole="button"
                accessibilityLabel={`${word}, heard ${occ.length} time${occ.length > 1 ? "s" : ""}`}
                style={{ borderWidth: 1,
                         borderColor: active ? t.brand : t.line,
                         backgroundColor: active ? t.brandBg : t.surface,
                         borderRadius: 99, paddingHorizontal: 14, paddingVertical: 10,
                         minHeight: 44, justifyContent: "center",
                         flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Text style={{ fontSize: 14, color: active ? t.brandInk : t.ink2 }}>
                  {word}
                </Text>
                <Text style={{ color: t.ink3, fontSize: 11 }}>{`×${occ.length}`}</Text>
              </Pressable>
            );
          })}
        </View>
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
        </Card>
      ) : null}

      {v.chapters && v.chapters.length ? (
        <>
          <Text style={{ color: t.ink3, fontSize: 11, fontWeight: "600", letterSpacing: 1,
                         textTransform: "uppercase", marginTop: 18, marginBottom: 8 }}>
            Chapters
          </Text>
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

      <Btn kind="pri" style={{ marginTop: 20 }}
           label={watched ? "Watched" : "Mark as watched"} onPress={markWatched} />
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
                <Muted>{a.placed ? `Placed at stage ${a.placed}` : "Tap to continue"}</Muted>
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
