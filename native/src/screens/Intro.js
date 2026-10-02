/* The first-run tour (ROADMAP P8.6): what the app believes, and three things
 * a new learner would not guess.
 *
 * Shown once, between naming the profile and choosing where to start; again
 * from Settings. Four cards, each one idea, each with the real control drawn
 * rather than described: how a lesson leads to a video (the owner, 2026-10-02:
 * "the original orientation should mention our vision… where each lesson
 * prepares them for a video with native speakers"), a word that is a link,
 * what the microphone is for, and the five tabs. Skippable at any point.
 *
 * The demo sits on a raised panel — the one place in the app a shadow is
 * drawn, because here the picture *is* the page and should sit forward of it
 * (the owner, same day: "use shadows to draw attention as needed").
 */

import React, { useState } from "react";
import { View, Animated } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme, radius, type as T } from "../theme";
import { Screen, Btn, Muted, Text } from "../ui";
import { Linked } from "../words";
import { TABS, TabGlyph } from "../tabicons";
import { useSwap } from "../motion";
import { Guide } from "../guide";

const PAGES = [
  {
    key: "vision",
    title: "Every lesson leads to a real video",
    body: "Learn the words, drill them, then hear them from native speakers.",
    demo: "vision",
  },
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

/* The sentence on the word card is the real control, not a picture of one:
   `Linked` opens the same sheet as everywhere else, and a second tap the full
   entry — at first run the entry comes as a sheet too, since there is no
   navigator yet (words.js). The owner, 2026-09-19: "make sure the tutorial
   actually is able to demo what it's showing." */
export const TOUR_SENTENCE = "Я читаю книгу.";

/* The three steps of a lesson as the app sees them: words, a drill, the
   video. Drawn with the app's own glyphs, joined by arrows. */
const STEPS = [
  { id: "words", label: "Words",
    d: "M4 6h16M4 12h10M4 18h7" },
  { id: "drill", label: "Drill",
    d: "M9 12l2 2 4-4M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4z" },
  { id: "video", label: "Video",
    d: "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM10 9l5 3-5 3z" },
];

function Step({ step, last }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <View style={{ alignItems: "center", width: 64 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: t.brand,
                       alignItems: "center", justifyContent: "center" }}>
          <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={t.brandOn}
               strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d={step.d} />
          </Svg>
        </View>
        <Muted size={12} style={{ marginTop: 6 }}>{step.label}</Muted>
      </View>
      {!last ? (
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={t.ink3} strokeWidth={2}
             strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 20 }}>
          <Path d="M5 12h14M13 6l6 6-6 6" />
        </Svg>
      ) : null}
    </View>
  );
}

function Demo({ kind }) {
  const t = useTheme();
  if (kind === "vision") {
    return (
      <View testID="tour-vision" style={{ alignItems: "center" }}>
        <Guide pose="point" size={84} />
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 14 }}>
          {STEPS.map((s, k) => <Step key={s.id} step={s} last={k === STEPS.length - 1} />)}
        </View>
      </View>
    );
  }
  if (kind === "word") {
    return <Linked testID="tour-sentence" text={TOUR_SENTENCE} size={30} />;
  }
  if (kind === "tabs") {
    return (
      <View testID="tour-tabs" style={{ flexDirection: "row", gap: 14, alignItems: "flex-start" }}>
        {TABS.map((tab) => (
          <View key={tab.id} style={{ alignItems: "center", gap: 6, width: 52 }}>
            <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: t.brandBg,
                           alignItems: "center", justifyContent: "center" }}>
              <TabGlyph d={tab.d} color={t.brandInk} size={24} />
            </View>
            <Muted size={12}>{tab.id}</Muted>
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: t.brand,
                   alignItems: "center", justifyContent: "center" }}>
      <Svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke={t.brandOn} strokeWidth={2}
           strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
        <Path d="M19 11a7 7 0 0 1-14 0M12 18v3" />
      </Svg>
    </View>
  );
}

/* The demo's panel: raised a little off the page, since on this screen it
   is the subject. The only shadow the app draws (theme.js useShadow is null). */
const panelShadow = {
  shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  elevation: 4,
};

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
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 22 }}>
        {PAGES.map((p, k) => (
          <View key={p.key} style={{ flex: 1, height: 4, borderRadius: 2,
                                     backgroundColor: k <= at ? t.brand : t.surface3 }} />
        ))}
      </View>
      <Animated.View style={swap}>
        <View testID={`intro-${page.key}`}
              style={[{ alignItems: "center", justifyContent: "center", minHeight: 220,
                        paddingVertical: 28, paddingHorizontal: 20, borderRadius: radius.xl,
                        backgroundColor: t.surface, borderWidth: 1, borderColor: t.lineSoft },
                      panelShadow]}>
          <Demo kind={page.demo} />
        </View>
        <Text style={{ color: t.ink, fontSize: T.title, fontWeight: "700", marginTop: 26,
                       textAlign: "center" }}>
          {page.title}
        </Text>
        <Text style={{ color: t.ink2, fontSize: T.body, lineHeight: 24, marginTop: 10,
                       textAlign: "center", paddingHorizontal: 8 }}>
          {page.body}
        </Text>
      </Animated.View>
      <View style={{ marginTop: "auto", paddingTop: 20, gap: 8 }}>
        <Btn block kind="pri" label={last ? "Start" : "Next"} onPress={() => (last ? onDone() : setAt(at + 1))} />
        {!last ? <Btn block kind="ghost" label="Skip" onPress={onDone} /> : null}
      </View>
    </Screen>
  );
}

/* The same tour from Settings, as a screen with a back arrow. */
export default function TourScreen({ navigation }) {
  return <Intro onDone={() => navigation.goBack()} />;
}
