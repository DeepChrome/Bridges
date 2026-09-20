/* The first-run tour (ROADMAP P8.6): three things a new learner would not guess.
 *
 * Shown once, between naming the profile and choosing where to start; again from
 * Settings ("Show the tour"). Three cards, each one idea, each with the real
 * control drawn rather than described: a word that is a link, a speaker that
 * says which voice it is, and what the microphone is for. Skippable at any point.
 */

import React, { useState } from "react";
import { View, Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme, radius } from "../theme";
import { Screen, Btn, Muted, Speaker, Text } from "../ui";
import { Linked } from "../words";
import { hasRussianVoice } from "../audio";

const PAGES = [
  {
    key: "words",
    title: "Every Russian word is a door",
    body: "Tap a word. Tap it again for the whole entry.",
    demo: "word",
  },
  {
    key: "voices",
    title: "Real voices, and the phone's",
    body: "Blue is a real recording; grey is the phone's own voice. Press twice for slower.",
    demo: "speaker",
  },
  {
    key: "mic",
    title: "Speaking stays on your phone",
    body: "Some questions ask you to say a sentence. The microphone is asked for then, and what you say never leaves the phone.",
    demo: "mic",
  },
];

/* The sentence on the first card is the real control, not a picture of one:
   `Linked` opens the same sheet as everywhere else, and a second tap the full
   entry — at first run the entry comes as a sheet too, since there is no
   navigator yet (words.js). The owner, 2026-09-19: "make sure the tutorial
   actually is able to demo what it's showing." */
export const TOUR_SENTENCE = "Я читаю книгу.";

function Demo({ kind }) {
  const t = useTheme();
  if (kind === "word") {
    return <Linked testID="tour-sentence" text={TOUR_SENTENCE} size={28} />;
  }
  if (kind === "speaker") {
    // On a phone with no Russian voice the grey speaker is dead, and the card
    // must not describe a button that does nothing.
    const voice = hasRussianVoice();
    return (
      <View style={{ flexDirection: "row", gap: 18, alignItems: "center" }}>
        <View style={{ alignItems: "center", gap: 6 }}>
          <Speaker text="книга" size={48} />
          <Muted>recording</Muted>
        </View>
        <View style={{ alignItems: "center", gap: 6 }}>
          <Speaker text="несуществующее слово для тура" size={48} />
          <Muted>{voice ? "device voice" : "no Russian voice on this phone"}</Muted>
        </View>
      </View>
    );
  }
  return (
    <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: t.brandBg,
                   borderWidth: 1, borderColor: t.brand, alignItems: "center", justifyContent: "center" }}>
      <Svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke={t.brandInk} strokeWidth={2}
           strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
        <Path d="M19 11a7 7 0 0 1-14 0M12 18v3" />
      </Svg>
    </View>
  );
}

export function Intro({ onDone }) {
  const t = useTheme();
  const [at, setAt] = useState(0);
  const page = PAGES[at];
  const last = at === PAGES.length - 1;
  return (
    <Screen fill>
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 26 }}>
        {PAGES.map((p, k) => (
          <View key={p.key} style={{ flex: 1, height: 4, borderRadius: 2,
                                     backgroundColor: k <= at ? t.brand : t.surface3 }} />
        ))}
      </View>
      <View testID={`intro-${page.key}`} style={{ alignItems: "center", paddingVertical: 24 }}>
        <Demo kind={page.demo} />
      </View>
      <Text style={{ color: t.ink, fontSize: 22, fontWeight: "700", marginTop: 14 }}>{page.title}</Text>
      <Text style={{ color: t.ink2, fontSize: 16, lineHeight: 24, marginTop: 10 }}>{page.body}</Text>
      <View style={{ marginTop: "auto", paddingTop: 20, gap: 8 }}>
        <Btn kind="pri" label={last ? "Start" : "Next"} onPress={() => (last ? onDone() : setAt(at + 1))} />
        {!last ? <Btn kind="ghost" label="Skip" onPress={onDone} /> : null}
      </View>
    </Screen>
  );
}

/* The same tour from Settings, as a screen with a back arrow. */
export default function TourScreen({ navigation }) {
  return <Intro onDone={() => navigation.goBack()} />;
}
