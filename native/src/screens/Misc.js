/* Immerse, the video player, the profile gate, and honest markers for the parts of
 * the web app that are not ported yet. */

import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { WebView } from "react-native-webview";
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
        <Muted size={14}>of {withVideo.length} watched</Muted>
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

export function Video({ route, navigation }) {
  const { st, update } = useSession();
  const t = useTheme();
  const unit = UN.find((u) => u.id === route.params.unitId);
  const i = route.params.index;
  const [playing, setPlaying] = useState(false);
  if (!unit || !unit.v) return null;

  return (
    <Screen>
      <Title sub={unit.name}>{unit.v.title.split(" | ")[0]}</Title>
      {playing ? (
        <View style={{ aspectRatio: 16 / 9, borderRadius: radius.md,
                       overflow: "hidden", backgroundColor: "#000" }}>
          <WebView
            source={{ uri: `https://www.youtube-nocookie.com/embed/${unit.v.id}?playsinline=1` }}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
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
        {lessonWords(unit, i).map((x) => (
          <View key={x} style={{ borderWidth: 1, borderColor: t.line,
                                 backgroundColor: t.surface, borderRadius: 99,
                                 paddingHorizontal: 14, paddingVertical: 10 }}>
            <Text style={{ color: t.ink2, fontSize: 14 }}>{L[x].b}</Text>
          </View>
        ))}
      </View>

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

  // After creating a profile, offer the placement test before the app opens.
  if (offer) {
    return (
      <Screen>
        <Title sub="A short test can skip what you already know.">
          Where should we start?
        </Title>
        <List>
          <Row onPress={() => onPlacement(true)}>
            <Avatar id={offer.avatar} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>
                Take the placement test
              </Text>
              <Muted>50 questions · about 10 minutes</Muted>
            </View>
          </Row>
          <Row last onPress={() => onPlacement(false)}>
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
           onPress={async () => { const a = await createProfile(name.trim(), avatar); setOffer(a); }} />
    </Screen>
  );
}

/* ------------------------------------------------------------ not yet */

/* Named plainly rather than dressed up as working screens: the exercise runner is
   the largest remaining piece of the port and pretending otherwise would be a lie
   in the shape of a UI. */
export function NotPorted({ title, detail, web }) {
  const t = useTheme();
  return (
    <Screen>
      <Title sub="Not ported to native yet">{title}</Title>
      <Card>
        <Text style={{ color: t.ink2, fontSize: 15 }}>{detail}</Text>
        <Muted style={{ marginTop: 12 }}>
          {`Working today in the web build at bridges-jf.netlify.app${web || ""}`}
        </Muted>
      </Card>
    </Screen>
  );
}
