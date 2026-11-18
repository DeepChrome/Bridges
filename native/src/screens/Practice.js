/* The Practice tab: what to do with ten minutes, laid out by what it asks of
 * you (the owner, 2026-11-18: "I don't like the organization of the practice
 * screen. Take a creative stab at reorganizing it").
 *
 * It was six sections of fifteen identical rows — Quiz, Listening, Speaking,
 * Conversation, Letters & sounds, Grammar — and a learner scanning for
 * "something to do" read a settings page. Three groups now, each in the shape
 * that fits it:
 *
 *   - **Activities** — a grid of tiles, two across: the quiz, the two ways of
 *     listening, the two of speaking and the three of talking to the model.
 *     A tile is a button (ui.js Tile, pressed into its edge like every other
 *     control), its icon in the family colour §30ah gave the screen (taking
 *     Russian in: blue; putting it out: the brand), and one word under the name
 *     saying which kind it is. Eight things you *do*, seen at once.
 *   - **Grammar** — the rules and the drills, as rows: these are a list to
 *     choose from, not a set to glance at.
 *   - **Reference** — the alphabet and the word endings, things to look up.
 *
 * Nothing on this screen is locked and nothing on it carries a score (the
 * owner, 2026-09-23). No row has a caption of its own: the chapter's grammar
 * row used to print its card's title under it ("Every noun has a gender"),
 * which read as a stray sentence (the owner, 2026-11-18). */

import React, { useMemo } from "react";
import { View } from "react-native";
import { useSession } from "../session";
import { Screen, List, Row, Thumb, SectionLabel, RowText, Tile, TileGrid } from "../ui";
import { DRILL_TYPES } from "../questions";
import { currentGrammarUnit } from "../data";

/* The activity tiles, in the order the skills arrive: a quiz on what you
   know, listening, speaking, talking. `kind` is the one word under the name. */
const ACTIVITIES = [
  { id: "quiz", testID: "practice-quiz", name: "Build a quiz", kind: "Quiz", tone: "good", route: "QuizSetup" },
  { id: "listen", testID: "practice-listen", name: "At your level", kind: "Listening", tone: "info", route: "SceneList" },
  { id: "drive", testID: "practice-drive", name: "Drive mode", kind: "Listening", tone: "info", route: "Drive" },
  { id: "shadow", testID: "practice-shadow", name: "Repeat a sentence", kind: "Speaking", tone: "brand", route: "Shadow" },
  { id: "buildup", testID: "practice-buildup", name: "Word building", kind: "Speaking", tone: "brand", route: "BuildDrill" },
  { id: "translate", testID: "practice-translate", name: "Translate", kind: "Conversation", tone: "brand", route: "Translate" },
  { id: "talk", testID: "practice-talk", name: "Talk", kind: "Conversation", tone: "brand", route: "Talk" },
  { id: "tutor", testID: "practice-tutor", name: "Tutor", kind: "Conversation", tone: "brand", route: "Tutor" },
];

export function DrillList({ navigation }) {
  const { st } = useSession();
  const grammarUnit = useMemo(() => currentGrammarUnit(st),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [st.unit, st.dev]);
  return (
    <Screen>
      <SectionLabel>Activities</SectionLabel>
      <TileGrid testID="practice-activities">
        {ACTIVITIES.map((a) => (
          <Tile key={a.id} testID={a.testID} icon={a.id} tone={a.tone} title={a.name} caption={a.kind}
                onPress={() => navigation.navigate(a.route)} />
        ))}
      </TileGrid>

      <SectionLabel gap>Grammar</SectionLabel>
      <List>
        {/* The grammar point of the chapter the learner is in, with its words
            (GrammarFlow) — the unit's module, one tap from Practice. */}
        {grammarUnit ? (
          <Row testID="chapter-grammar"
               onPress={() => navigation.navigate("GrammarRun", { unitId: grammarUnit.id })}>
            <Thumb id="aim" tone="good" />
            <RowText title="This chapter's grammar" />
          </Row>
        ) : null}
        {/* The reference: the rules the drills below are drilling. Open from
            the first screen, like the alphabet, and never scored. */}
        <Row testID="open-grammar" onPress={() => navigation.navigate("Grammar")}>
          <Thumb id="rules" tone="good" />
          <RowText title="The rules" />
        </Row>
        {/* The cases, one at a time in the order they are taught, each with its
            lesson and its drill (CaseHub; 2026-10-08). */}
        <Row testID="drill-cases" onPress={() => navigation.navigate("CaseHub")}>
          <Thumb id="cases" tone="good" />
          <RowText title="Cases" />
        </Row>
        {/* Flashcards of forms (flows/FormCards.js, 2026-11-12). */}
        <Row testID="drill-formcards" onPress={() => navigation.navigate("FormCards")}>
          <Thumb id="formcards" tone="good" />
          <RowText title="Form cards" />
        </Row>
        {DRILL_TYPES.filter((d) => d.id !== "cases").map((d) => (
          /* Straight in; what a drill asks about is on its own cog (DrillOptions). */
          <Row key={d.id} testID={`drill-${d.id}`}
               onPress={() => navigation.navigate("Drill", { type: d.id })}>
            <Thumb id={d.icon} tone="good" />
            <RowText title={d.name} />
          </Row>
        ))}
      </List>

      <SectionLabel gap>Reference</SectionLabel>
      <List>
        {/* The letters and the mouth behind them (ROADMAP P10.2); open from
            the first screen, since nothing else teaches the alphabet. */}
        <Row testID="open-alphabet" onPress={() => navigation.navigate("Sounds")}>
          <Thumb id="letters" tone="info" />
          <RowText title="Alphabet" />
        </Row>
        {/* Its own row beside Alphabet, not a section inside it (§30ab). */}
        <Row testID="open-endings" onPress={() => navigation.navigate("Endings")}>
          <Thumb id="endings" tone="info" />
          <RowText title="Word endings" />
        </Row>
      </List>
    </Screen>
  );
}
