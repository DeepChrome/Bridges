/* Immerse, the video player, the profile gate, and honest markers for the parts of
 * the web app that are not ported yet. */

import React, { useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { YouTube } from "../youtube";
import { useSession } from "../session";
import { useTheme, radius } from "../theme";
import { Screen, List, Row, Card, Btn, Pill, Thumb, Muted, Title, UnitIcon, Avatar, AV, AV_IDS } from "../ui";
import { UN, lessonCount, unitState, unitUnlocked, markComponent, L, lessonWords } from "../data";

/* ------------------------------------------------------------- immerse */

export function Immerse({ navigation }) {
  const { st } = useSession();
  const t = useTheme();
  const withVideo = UN.filter((u) => u.v);
  const seen = withVideo.filter((u) => unitState(st, u.id).video).length;

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6,
                     marginBottom: 14 }}>
        <Text style={{ color: t.ink, fontSize: 20, fontWeight: "700" }}>{seen}</Text>
        <Muted size={14}>{`of ${withVideo.length} watched`}</Muted>
      </View>
      <List>
        {withVideo.map((u, k) => {
          const open = unitUnlocked(st, u);
          const watched = unitState(st, u.id).video;
          return (
            <Row key={u.id} last={k === withVideo.length - 1} disabled={!open}
                 onPress={() => navigation.navigate("Video",
                   { unitId: u.id, index: lessonCount(u) - 1 })}>
              <Thumb id={u.id} done={watched} locked={!open} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>
                  {u.v.title.split(" | ")[0]}
                </Text>
                <Muted>
                  {u.name + (u.v.dur ? ` · ${Math.round(u.v.dur / 60)} min` : "") +
                   (open ? "" : " · locked")}
                </Muted>
              </View>
              {watched ? <Pill tone="good">seen</Pill> : null}
            </Row>
          );
        })}
      </List>
      <Muted style={{ textAlign: "center", marginTop: 20 }}>
        Episodes from Easy Russian, matched to the words in each unit.
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

export function Video({ route, navigation }) {
  const { st, update } = useSession();
  const t = useTheme();
  const unit = UN.find((u) => u.id === route.params.unitId);
  const i = route.params.index;
  const [playing, setPlaying] = useState(false);
  const [focus, setFocus] = useState(null);
  const player = useRef(null);
  const pending = useRef(null);
  if (!unit || !unit.v) return null;

  const heard = unit.v.heard || {};

  const jump = (ms) => {
    const at = Math.max(0, ms - LEAD_MS);
    if (player.current) player.current.seek(at, HOLD_MS);
    else pending.current = at;      // the player is still mounting; run it on ready
  };

  /* Tapping the same word again walks to its next occurrence, so a word said five
     times is five listening chances rather than the same one replayed. */
  const openWord = (word) => {
    const occ = heard[word];
    if (!occ || !occ.length) { setFocus({ word, missing: true }); return; }
    const k = focus && focus.word === word ? (focus.k + 1) % occ.length : 0;
    setFocus({ word, k, n: occ.length, ...occ[k] });
    setPlaying(true);
    jump(occ[k].t);
  };

  return (
    <Screen>
      <Title sub={unit.name}>{unit.v.title.split(" | ")[0]}</Title>
      {playing ? (
        <View style={{ aspectRatio: 16 / 9, borderRadius: radius.md,
                       overflow: "hidden", backgroundColor: "#000" }}>
          <YouTube
            ref={player}
            videoId={unit.v.id}
            onReady={() => {
              if (pending.current != null) {
                player.current && player.current.seek(pending.current, HOLD_MS);
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
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
        {lessonWords(unit, i).map((x) => {
          const word = L[x].b;
          const occ = heard[word];
          const spoken = !!(occ && occ.length);
          const active = focus && focus.word === word;
          return (
            <Pressable
              key={x}
              onPress={() => openWord(word)}
              accessibilityRole="button"
              accessibilityLabel={spoken
                ? `${word}, heard ${occ.length} time${occ.length > 1 ? "s" : ""}`
                : `${word}, not spoken in this episode`}
              style={{ borderWidth: 1,
                       borderColor: active ? t.brand : spoken ? t.line : t.lineSoft,
                       backgroundColor: active ? t.brandBg : t.surface,
                       borderRadius: 99, paddingHorizontal: 14, paddingVertical: 10,
                       minHeight: 44, justifyContent: "center",
                       flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Text style={{ fontSize: 14,
                             color: active ? t.brandInk : spoken ? t.ink2 : t.ink3 }}>
                {word}
              </Text>
              {spoken ? (
                <Text style={{ color: t.ink3, fontSize: 11 }}>{`×${occ.length}`}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {focus ? (
        <Card style={{ marginTop: 14 }}>
          {focus.missing ? (
            <Muted>{`“${focus.word}” is not spoken in this episode.`}</Muted>
          ) : (
            <>
              <View style={{ flexDirection: "row", alignItems: "center",
                             marginBottom: 8 }}>
                <Pill tone="brand">{clock(focus.t)}</Pill>
                <View style={{ flex: 1 }} />
                <Muted>{focus.n > 1 ? `${focus.k + 1} of ${focus.n}` : "once"}</Muted>
              </View>
              <Text style={{ color: t.ink2, fontSize: 15, lineHeight: 22 }}>
                {focus.s}
              </Text>
              <Btn
                label="Play it again"
                style={{ marginTop: 12 }}
                onPress={() => { setPlaying(true); jump(focus.t); }}
              />
            </>
          )}
        </Card>
      ) : null}

      <Btn
        kind="pri"
        style={{ marginTop: 20 }}
        label={unitState(st, unit.id).video ? "Watched" : "Mark as watched"}
        onPress={() => {
          update((prev) => markComponent(prev, unit, i, "video"));
          navigation.goBack();
        }}
      />
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

  /* The profile is created by the *choice* below, not by Continue.
     Creating it earlier sets the active account, which is exactly the condition the
     shell uses to leave the gate — so the app would swap to the tabs and unmount
     this screen before the question could be asked. Holding the name and avatar
     here until the learner answers keeps the gate in charge of its own flow. */
  const start = async (wanted) => {
    await createProfile(offer.name, offer.avatar);
    onPlacement(wanted);
  };

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

