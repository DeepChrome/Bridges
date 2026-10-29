/* A word's score, and the four scores behind it.
 *
 * The owner, 2026-10-29: *"when someone clicks the score, they get a blown up
 * detail of their mastery, where they're good and where they need to work."*
 * The ring on a flashcard, an entry or a word row is the word's card
 * (core/scheduler.js familiarity); a press on it opens this bubble, which
 * reads the word's four skill slots (core/skills.js) — Russian → English,
 * English → Russian, Cases & forms, In a sentence — each with its own ring and
 * a word for it, or "Not asked yet" where nothing has exercised it. The slots
 * are what the drills and the session builder read when they choose what to
 * ask, so what the bubble shows is what the app is working on.
 */

import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { useTheme, type as T } from "./theme";
import { Bubble, Familiarity, Text, Muted } from "./ui";
import { useSession } from "./session";
import { L, idxOfWord, rankOf } from "./data";
import { SKILLS } from "@core/skills";
import { skillScores, familiarityLabel, cardFor, familiarity } from "@core/scheduler";

/* One row a skill: its ring (or a dash), its name, and where it stands. */
function SkillRow({ skill, score, reps, last }) {
  const t = useTheme();
  return (
    <View testID={`skill-${skill.id}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8,
                   borderBottomWidth: last ? 0 : 1, borderBottomColor: t.lineSoft }}>
      <View style={{ width: 34, alignItems: "center" }}>
        {score === null
          ? <Text style={{ color: t.ink3, fontSize: 16 }}>—</Text>
          : <Familiarity score={score} size={34} testID={`skill-${skill.id}-score`} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.ink, fontSize: T.body, fontWeight: "600" }}>{skill.name}</Text>
        <Muted size={13} testID={`skill-${skill.id}-label`}>
          {score === null ? "Not asked yet" : `${familiarityLabel(score)} · ${reps} ${reps === 1 ? "answer" : "answers"}`}
        </Muted>
      </View>
    </View>
  );
}

/* The bubble: the word, its overall score, the four skills under it. */
function SkillBreakdown({ word, onClose }) {
  const t = useTheme();
  const session = useSession();
  const seen = (session && session.st && session.st.seen) || {};
  const entry = seen[word] || null;
  const rank = rankOf(word);
  const scores = skillScores(entry, rank);
  const overall = familiarity(cardFor(entry), rank);
  const i = idxOfWord(word);
  const shown = i >= 0 ? L[i].w : word;
  return (
    <Bubble title={shown} onClose={onClose} testID="skill-breakdown">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 }}>
        {overall === null ? null : <Familiarity score={overall} size={44} testID="skill-overall" />}
        <Text style={{ color: t.ink2, fontSize: T.body }}>
          {overall === null ? "Not studied yet" : familiarityLabel(overall)}
        </Text>
      </View>
      {SKILLS.map((s, k) => (
        <SkillRow key={s.id} skill={s} score={scores[s.id]} last={k === SKILLS.length - 1}
                  reps={entry && entry[s.id] ? entry[s.id].reps || 0 : 0} />
      ))}
    </Bubble>
  );
}

/* The ring as a control: the word's score, and a press opens the breakdown.
   Draws nothing for a word with no score (a new card says "New" instead). */
export function ScoreRing({ word, score, size = 34, testID = "familiarity" }) {
  const [open, setOpen] = useState(false);
  if (score === null || score === undefined) return null;
  return (
    <>
      <Pressable testID={`${testID}-open`} accessibilityRole="button" hitSlop={6}
                 accessibilityLabel={`Familiarity ${score} of 100, see the breakdown`}
                 onPress={() => setOpen(true)}>
        <Familiarity score={score} size={size} testID={testID} />
      </Pressable>
      {open ? <SkillBreakdown word={word} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
