/* Word endings — how the end of a word is actually said (2026-09-28).
 *
 * The owner: *"demos of how word endings are pronounced… One button will
 * pronounce the termination. The other area will have maybe 3 examples of
 * each termination that can be played as audio snippets."*
 *
 * Content in core/endings.js; the order is how often each ending turns up in
 * the app's sentences (data.js `endingsByFrequency`), which is why the
 * unstressed vowels lead — they are at the end of most words a learner hears.
 *
 * Each entry reads top to bottom as the learner needs it: the ending as it is
 * written, what it sounds like with a button to hear it, one sentence of why,
 * and three real words to hear it in. No cards: a card round every entry would
 * be thirty-one boxes (§25), and a hairline between them is enough to say
 * where one stops.
 *
 * The ending's own button is the phone's voice, because an ending on its own
 * has never been recorded by anyone — and it says a respelling («ово» for
 * -ого), since reading the letters as written is exactly the mistake the entry
 * is there to correct. The examples play a recording where the word has one.
 */

import React, { useEffect, useState } from "react";
import { View, InteractionManager, Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme, radius, type as T } from "../theme";
import { Screen, Title, Text, Muted, Note, Loading, useRussianVoice } from "../ui";
import { FormSpeaker } from "../rules";
import { say } from "../audio";
import { endingsByFrequency } from "../data";

/* The ending's button: what it sounds like, respelled, and a speaker. A pill
   rather than a round speaker, because what it says is the lesson — "sounds
   like -ово" is the thing to read before pressing. */
function EndingSound({ e }) {
  const t = useTheme();
  const voice = useRussianVoice();
  return (
    <Pressable testID={`ending-say-${e.id}`}
               onPress={voice ? () => say(e.say, { device: true, stress: true }) : undefined}
               accessibilityRole="button"
               accessibilityLabel={voice ? `Hear the ending, ${e.sounds} (device voice)` : undefined}
               hitSlop={6}
               style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6,
                 minHeight: 36, paddingHorizontal: 12, borderRadius: radius.lg,
                 borderWidth: 1, borderColor: t.line, backgroundColor: t.surface,
                 opacity: !voice ? 0.4 : pressed ? 0.6 : 1 })}>
      <Text style={{ color: t.ink2, fontSize: T.small }}>sounds</Text>
      <Text style={{ color: t.ink, fontSize: T.body, fontWeight: "700" }}>{e.sounds}</Text>
      <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={t.ink3}
           strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M11 5 6 9H3v6h3l5 4z" />
        <Path d="M15.5 8.5a5 5 0 0 1 0 7" />
      </Svg>
    </Pressable>
  );
}

function Entry({ e, first }) {
  const t = useTheme();
  return (
    <View testID={`ending-${e.id}`}
          style={{ paddingVertical: 18, borderTopWidth: first ? 0 : 1, borderTopColor: t.lineSoft }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Text style={{ flex: 1, minWidth: 120, color: t.brandInk, fontSize: T.title, fontWeight: "700" }}>
          {e.end}
        </Text>
        <EndingSound e={e} />
      </View>
      <Note text={e.rule} color={t.ink2} style={{ marginTop: 8 }} />
      {e.note ? <Muted style={{ marginTop: 4, fontStyle: "italic" }}>{e.note}</Muted> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {e.examples.map((x) => (
          <FormSpeaker key={x} form={x} device={false} testID={`ending-ex-${e.id}-${x}`}
                       style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: radius.lg,
                                backgroundColor: t.surface2 }}>
            <Text style={{ color: t.ink, fontSize: T.body }}>{x}</Text>
          </FormSpeaker>
        ))}
      </View>
    </View>
  );
}

export default function Endings() {
  /* Counting the endings parses the sentence pool, a few hundred milliseconds
     on a phone the first time. It waits for the screen's own arrival to
     finish rather than stalling the transition, and is kept after that. */
  const [list, setList] = useState(null);
  useEffect(() => {
    let alive = true;
    const job = InteractionManager.runAfterInteractions(() => {
      const ranked = endingsByFrequency();
      if (alive) setList(ranked);
    });
    return () => { alive = false; if (job && job.cancel) job.cancel(); };
  }, []);

  return (
    <Screen>
      <Title>Word endings</Title>
      {list ? list.map((e, k) => <Entry key={e.id} e={e} first={k === 0} />) : <Loading />}
    </Screen>
  );
}
