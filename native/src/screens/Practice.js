/* The Practice tab: what to do with ten minutes, as two tabs of tiles (the
 * owner, 2026-11-18: "I don't like the organization of the practice screen.
 * Take a creative stab at reorganizing it"; 2026-11-19: "The tiles look good
 * on practice. I think you can apply that to grammar too and maybe organize
 * with two tabs at the top… One for drills one for grammar").
 *
 * It was six sections of fifteen identical rows — a settings page — and a
 * learner scanning for "something to do" could not. Now:
 *
 *   - **Drills** — a grid of tiles, two across: the quiz, the two ways of
 *     listening, the two of speaking and the three of talking to the model.
 *     A tile is a button (ui.js Tile, pressed into its edge like every other
 *     control), its icon in the family colour §30ah gave the screen (taking
 *     Russian in: blue; putting it out: the brand), and one word under the
 *     name saying which kind it is.
 *   - **Grammar** — the same tiles: the chapter's point, the rules, the cases,
 *     the form cards and the four form drills (green, the rules' colour), and
 *     under them the two reference screens, the alphabet and the word
 *     endings.
 *
 * Nothing on this screen is locked and nothing on it carries a score (the
 * owner, 2026-09-23). No tile has a caption of its own beyond its kind. */

import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { useSession } from "../session";
import { Screen, SectionLabel, Tile, TileGrid, SegmentTabs } from "../ui";
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

/* The grammar tiles: the reference and its practice, then each form drill.
   Straight in; what a drill asks about is on its own cog (DrillOptions). */
const GRAMMAR = [
  { id: "rules", testID: "open-grammar", name: "The rules", kind: "Reference", route: "Grammar" },
  { id: "cases", testID: "drill-cases", name: "Cases", kind: "Lessons and drills", route: "CaseHub" },
  { id: "formcards", testID: "drill-formcards", name: "Form cards", kind: "Flashcards", route: "FormCards" },
].concat(DRILL_TYPES.filter((d) => d.id !== "cases").map((d) => (
  { id: d.icon, testID: `drill-${d.id}`, name: d.name, kind: "Drill", route: "Drill", params: { type: d.id } })));

const REFERENCE = [
  /* The letters and the mouth behind them (ROADMAP P10.2); open from the
     first screen, since nothing else teaches the alphabet. */
  { id: "letters", testID: "open-alphabet", name: "Alphabet", kind: "Reference", route: "Sounds" },
  /* Its own tile beside Alphabet, not a section inside it (§30ab). */
  { id: "endings", testID: "open-endings", name: "Word endings", kind: "Reference", route: "Endings" },
];

const TABS = [{ id: "drills", name: "Drills" }, { id: "grammar", name: "Grammar" }];

export function Practice({ navigation }) {
  const { st } = useSession();
  const [tab, setTab] = useState("drills");
  const grammarUnit = useMemo(() => currentGrammarUnit(st),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [st.unit, st.dev]);
  const tiles = (list, tone) => list.map((a) => (
    <Tile key={a.id} testID={a.testID} icon={a.id} tone={a.tone || tone} title={a.name} caption={a.kind}
          onPress={() => navigation.navigate(a.route, a.params)} />
  ));
  return (
    <Screen>
      <SegmentTabs testID="practice-tabs" options={TABS} value={tab} onPick={setTab} />
      {tab === "drills" ? (
        <TileGrid testID="practice-activities" style={{ marginTop: 16 }}>{tiles(ACTIVITIES)}</TileGrid>
      ) : (
        <>
          <TileGrid testID="practice-grammar" style={{ marginTop: 16 }}>
            {/* The grammar point of the chapter the learner is in, with its
                words (GrammarFlow) — the unit's module, one tap from Practice. */}
            {grammarUnit ? (
              <Tile testID="chapter-grammar" icon="aim" tone="good" title="This chapter's grammar" caption="Practice"
                    onPress={() => navigation.navigate("GrammarRun", { unitId: grammarUnit.id })} />
            ) : null}
            {tiles(GRAMMAR, "good")}
          </TileGrid>
          <SectionLabel gap>Reference</SectionLabel>
          <TileGrid testID="practice-reference">{tiles(REFERENCE, "info")}</TileGrid>
        </>
      )}
    </Screen>
  );
}
