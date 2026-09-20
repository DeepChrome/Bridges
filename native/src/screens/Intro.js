/* The first-run tour (ROADMAP P8.6): three things a new learner would not guess.
 *
 * Shown once, between naming the profile and choosing where to start; again from
 * Settings ("Show the tour"). Three cards, each one idea, each with the real
 * control drawn rather than described: a word that is a link, a speaker that
 * says which voice it is, and what the microphone is for. Skippable at any point.
 */

import React, { useState } from "react";
import { View, Animated } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme, radius } from "../theme";
import { Screen, Btn, Muted, Text } from "../ui";
import { Linked } from "../words";
import { TABS, TabGlyph } from "../tabicons";
import { useSwap } from "../motion";

const PAGES = [
  {
    key: "words",
    title: "Every Russian word is a door",
    body: "Tap a word. Tap it again for the whole entry.",
    demo: "word",
  },
  /* A card on the two speaker colours sat here until 2026-09-19 — the owner:
     "not clear what recording vs device voice is. I don't think it really
     needs a card." It did not: the distinction is drawn on every speaker,
     and a card explaining a control is the thing §25 says not to write. */
  {
    key: "mic",
    title: "Speaking stays on your phone",
    body: "Some questions ask you to say a sentence. The microphone is asked for then, and what you say never leaves the phone.",
    demo: "mic",
  },
  /* The five tabs before the tab bar (the owner, 2026-09-19): the same icons
     the bar draws, one word each, on a card rather than as coach marks over
     the live screen — a card can be skipped and blocks nothing. */
  {
    key: "tabs",
    title: "Five places",
    body: "The path, your cards, the drills, the videos, the dictionary.",
    demo: "tabs",
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
  if (kind === "tabs") {
    return (
      <View testID="tour-tabs" style={{ flexDirection: "row", gap: 18, alignItems: "flex-start" }}>
        {TABS.map((tab) => (
          <View key={tab.id} style={{ alignItems: "center", gap: 6, width: 56 }}>
            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: t.brandBg,
                           alignItems: "center", justifyContent: "center" }}>
              <TabGlyph d={tab.d} color={t.brandInk} size={26} />
            </View>
            <Muted size={12}>{tab.id}</Muted>
          </View>
        ))}
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
  /* The card slides in from the right as the next one replaces it; a hard cut
     read as one card whose words changed (motion.js useSwap). */
  const swap = useSwap(at);
  return (
    <Screen fill>
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 26 }}>
        {PAGES.map((p, k) => (
          <View key={p.key} style={{ flex: 1, height: 4, borderRadius: 2,
                                     backgroundColor: k <= at ? t.brand : t.surface3 }} />
        ))}
      </View>
      <Animated.View style={swap}>
        <View testID={`intro-${page.key}`} style={{ alignItems: "center", paddingVertical: 24 }}>
          <Demo kind={page.demo} />
        </View>
        <Text style={{ color: t.ink, fontSize: 22, fontWeight: "700", marginTop: 14 }}>{page.title}</Text>
        <Text style={{ color: t.ink2, fontSize: 16, lineHeight: 24, marginTop: 10 }}>{page.body}</Text>
      </Animated.View>
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
