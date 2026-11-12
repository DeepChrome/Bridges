/* The Practice tab's menu: every drill, listening and speaking exercise,
 * conversation and reference, in sections. */

import React, { useMemo } from "react";
import { View } from "react-native";
import { useSession } from "../session";
import { useTheme, type as T } from "../theme";
import { Screen, Muted, List, Row, Thumb, SectionLabel, Text } from "../ui";
import { DRILL_TYPES } from "../questions";
import { currentGrammarUnit, grammarNoteOf } from "../data";

/* Nothing on this screen is locked and nothing on it carries a score (the
   owner, 2026-09-23: *"For the practice exercises, nothing should be locked…
   no percentages anywhere on that page"*). The drills used to open with the
   chapter that taught their rule and Talk after chapter 2, each with an
   "Opens in chapter N" line and a best-score pill; a learner who wants to try
   the aspect drill in week one may, choosing chapters on its cog. */
export function DrillList({ navigation }) {
  const { st } = useSession();
  const t = useTheme();
  const grammarUnit = useMemo(() => currentGrammarUnit(st),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [st.unit, st.dev]);
  /* One shape for every row (the owner, 2026-10-13: "This menu is pretty damn
     ugly. Why is the top row a different color?"). The quiz used to lead as a
     brand-tinted card above the lists, which read as the one row that had
     been styled; it is a section like the others now. The tiles carry three
     hues by what the activity asks of you — taking Russian in (`info`), putting
     it out (`brand`), and the rules (`good`) — the families §30ah gave the
     screen, so the sections read as kinds rather than as a stripe. */
  const title = { color: t.ink, fontSize: T.body, fontWeight: "600" };
  return (
    <Screen>
      <SectionLabel>Quiz</SectionLabel>
      <List>
        <Row testID="practice-quiz" onPress={() => navigation.navigate("QuizSetup")}>
          <Thumb id="quiz" tone="good" />
          <View style={{ flex: 1 }}>
            <Text style={title}>Build a quiz</Text>
          </View>
        </Row>
      </List>

      {/* Listening and speaking used to be one section of five rows, and the
          owner could not find the mouth drills in it (2026-09-16): taking
          Russian in and putting it out are two different things to sit down to,
          and a learner deciding "I want to practise speaking" was reading past
          two listening rows to get there. Split, with speaking second because
          that is the order the skills arrive in. */}
      <SectionLabel gap>Listening</SectionLabel>
      <List>
        {/* Listening at the learner's level comes first, and the native-speed
            one says plainly that it is harder. The owner found the video
            passages "way too advanced" and nothing on the row warned him. */}
        <Row onPress={() => navigation.navigate("SceneList")}>
          <Thumb id="listen" tone="info" />
          <View style={{ flex: 1 }}>
            {/* The section above already says Listening — which is the feature's
                name (§30af) — so the row says what tells the two apart. Naming
                the row "Listening" too read as "LISTENING / Listening", and the
                walkthrough's tap matched the header instead of the row, which
                is how it was found. */}
            <Text style={title}>At your level</Text>
          </View>
        </Row>
        <Row testID="practice-drive" onPress={() => navigation.navigate("Drive")}>
          <Thumb id="drive" tone="info" />
          <View style={{ flex: 1 }}>
            <Text style={title}>Drive mode</Text>
          </View>
        </Row>
        {/* "Native speed" — 45 s of real video and "which word did you hear?"
            — sat here until 2026-09-23. The owner: *"'what word did you hear'
            is pretty horrible and doesn't actually teach the language."* The
            native-speed listening is Immerse, where the same videos play
            whole with the words they say and the moment each is said. */}
      </List>

      <SectionLabel gap>Speaking</SectionLabel>
      <List>
        {/* Hear it, say it back (P10.6) — the step from taking Russian in to
            putting it out, with the model still in your ear. */}
        <Row onPress={() => navigation.navigate("Shadow")}>
          <Thumb id="shadow" tone="brand" />
          <View style={{ flex: 1 }}>
            <Text style={title}>Repeat a sentence</Text>
          </View>
        </Row>
        {/* A row of its own, rather than a button inside Alphabet. It was
            reachable only from there and the owner never found it. */}
        <Row onPress={() => navigation.navigate("BuildDrill")}>
          <Thumb id="buildup" tone="brand" />
          <View style={{ flex: 1 }}>
            <Text style={title}>Word building</Text>
          </View>
        </Row>
      </List>

      {/* Speaking was seven rows of four kinds of thing (the walkthrough,
          2026-09-30): the mouth drills, three conversations with the model,
          and two references. Each kind has its own section now. */}
      <SectionLabel gap>Conversation</SectionLabel>
      <List>
        {/* Speak Russian, read it back in English (2026-09-22). With Talk and
            the tutor because it is the third way of saying something to the
            model and seeing what came of it. Open from the first screen: it
            teaches nothing and gates nothing, so there is nothing to earn. */}
        <Row onPress={() => navigation.navigate("Translate")}>
          <Thumb id="translate" tone="brand" />
          <View style={{ flex: 1 }}>
            <Text style={title}>Translate</Text>
          </View>
        </Row>
        <Row onPress={() => navigation.navigate("Talk")}>
          <Thumb id="talk" tone="brand" />
          <View style={{ flex: 1 }}>
            <Text style={title}>Talk</Text>
          </View>
        </Row>
        {/* The free conversation with a tutor who knows where you are
            (2026-09-26, screens/Tutor.js). Talk is a scene at your level in
            Russian; this is whatever you ask for, in either language. */}
        <Row testID="practice-tutor" onPress={() => navigation.navigate("Tutor")}>
          <Thumb id="tutor" tone="brand" />
          <View style={{ flex: 1 }}>
            <Text style={title}>Tutor</Text>
          </View>
        </Row>
      </List>

      <SectionLabel gap>Letters & sounds</SectionLabel>
      <List>
        {/* The letters and the mouth behind them (ROADMAP P10.2). Open from the
            first screen: nothing else in the app teaches the alphabet. Named
            for the letters rather than for "sounds", which described the vowel
            chart and hid the thirty-three characters underneath it. */}
        <Row onPress={() => navigation.navigate("Sounds")}>
          <Thumb id="letters" tone="info" />
          <View style={{ flex: 1 }}>
            <Text style={title}>Alphabet</Text>
          </View>
        </Row>
        {/* Its own row beside Alphabet, not a section inside it: things put
            inside another screen are the things that do not get found (§30ab,
            Word building). */}
        <Row testID="open-endings" onPress={() => navigation.navigate("Endings")}>
          <Thumb id="endings" tone="info" />
          <View style={{ flex: 1 }}>
            <Text style={title}>Word endings</Text>
          </View>
        </Row>
      </List>
      <SectionLabel gap>Grammar</SectionLabel>
      <List>
        {/* The reference, first in the section it explains: the rules the
            drills below are drilling. Open from the first screen, like the
            alphabet, and never scored (2026-09-27). */}
        <Row testID="open-grammar" onPress={() => navigation.navigate("Grammar")}>
          <Thumb id="rules" tone="good" />
          <View style={{ flex: 1 }}>
            <Text style={title}>The rules</Text>
          </View>
        </Row>
        {/* The grammar point of the chapter the learner is in, with its words
            (GrammarFlow) — the unit's module, one tap from Practice. */}
        {grammarUnit ? (
          <Row testID="chapter-grammar"
               onPress={() => navigation.navigate("GrammarRun", { unitId: grammarUnit.id })}>
            <Thumb id="aim" tone="good" />
            <View style={{ flex: 1 }}>
              <Text style={title}>This chapter's grammar</Text>
              <Muted numberOfLines={1}>{grammarNoteOf(grammarUnit).title}</Muted>
            </View>
          </Row>
        ) : null}
        {/* The cases, one at a time in the order they are taught, each with its
            lesson and its drill (CaseHub; 2026-10-08). The forms drill that
            was this row is inside it, as every case mixed. */}
        <Row testID="drill-cases" onPress={() => navigation.navigate("CaseHub")}>
          <Thumb id="cases" tone="good" />
          <View style={{ flex: 1 }}>
            <Text style={title}>Cases</Text>
          </View>
        </Row>
        {/* Flashcards of forms: the word and the cell asked for, the form on
            the back, graded by the learner (the owner, 2026-11-12;
            flows/FormCards.js). */}
        <Row testID="drill-formcards" onPress={() => navigation.navigate("FormCards")}>
          <Thumb id="formcards" tone="good" />
          <View style={{ flex: 1 }}>
            <Text style={title}>Form cards</Text>
          </View>
        </Row>
        {DRILL_TYPES.filter((d) => d.id !== "cases").map((d) => (
          /* Straight in. What a drill asks about is on the drill's own cog now
             (DrillOptions), not a screen in front of it — the owner, 2026-09-26:
             *"instead of a settings cog, we have this sort of ugly ass top
             menu."* `List` decides which row is last (§30i). */
          <Row key={d.id} testID={`drill-${d.id}`}
               onPress={() => navigation.navigate("Drill", { type: d.id })}>
            <Thumb id={d.icon} tone="good" />
            <View style={{ flex: 1 }}>
              <Text style={title}>
                {d.name}
              </Text>
            </View>
          </Row>
        ))}
      </List>
    </Screen>
  );
}
