/* The drills for one word, behind the Drills button on the back of its
 * flashcard (the owner, 2026-10-31: *"a little drills button on the back of the
 * card… a submenu of drills for that word… all drill options for that word…
 * targeted familiarity"*).
 *
 * What a word can be asked is the word's business, not the screen's:
 * core/questions.js `wordDrills(i)` reads it off the word — a noun has Cases,
 * a verb Conjugation and (with a partner) Aspect pair, a word with movable
 * stress Stress, a long word Say it — and every word has Meaning and, with a
 * sentence to put it in, In a sentence. The sheet lists exactly those, one
 * row each, and a row opens the run (`WordDrill` route, flows/Drills.js
 * WordDrillFlow). The tile's hue is Practice's own: taking Russian in,
 * putting it out, the rules (§30ah).
 */

import React, { useMemo, useState } from "react";
import { useSession } from "./session";
import { Sheet, List, Row, Thumb, RowText, Familiarity, ActionChip } from "./ui";
import { Q } from "./questions";
import { L, exactIdx, idxOfWord, rankOf } from "./data";
import { skillScores } from "@core/scheduler";

/* The hue by what the drill asks of you, the families Practice's rows carry:
   `info` takes Russian in, `brand` puts it out, `good` is the rules. */
const TONE = { meaning: "info", sentence: "info", say: "brand" };
const toneOf = (id) => TONE[id] || "good";

/* The lemma a card's word is: its own entry first (state keys on the bare
   string, rule 20.4, and «всё» and «все» share a fold), else the form's owner;
   -1 for a sentence card or a deck card the course does not know. */
export const wordIndex = (word) => {
  const e = exactIdx(word);
  return e >= 0 ? e : idxOfWord(word);
};

function WordDrillsSheet({ word, onClose, onPick }) {
  const { st } = useSession();
  const i = wordIndex(word);
  const typed = st.typedDrills !== false;
  // Built when the sheet opens, a few milliseconds: the counts are what one
  // run would hold, so a row never promises a drill it cannot fill.
  const drills = useMemo(() => (i >= 0 ? Q.wordDrills(i, { typed }) : []), [i, typed]);
  /* The word's score on the skill each drill feeds (core/skills.js), the same
     numbers the ring's breakdown shows — so the row that will move "English →
     Russian 40" wears the 40. Meaning feeds two; it wears the weaker, which is
     the one the run is for. Nothing where nothing has asked yet. */
  const scores = i >= 0 ? skillScores((st.seen || {})[L[i].b], rankOf(L[i].b)) : {};
  const scoreOf = (d) => {
    const have = d.skills.map((s) => scores[s]).filter((v) => typeof v === "number");
    return have.length ? Math.min(...have) : null;
  };
  return (
    <Sheet testID="word-drills" title={i >= 0 ? L[i].w : word} onClose={onClose}>
      <List>
        {drills.map((d) => (
          <Row key={d.id} testID={`word-drill-${d.id}`} onPress={() => onPick(d.id)}>
            <Thumb id={d.icon} tone={toneOf(d.id)} />
            {/* How long the run is; a word said is one word, not a count. */}
            <RowText title={d.name} sub={d.id === "say" ? undefined : `${d.n} ${d.n === 1 ? "question" : "questions"}`} />
            {scoreOf(d) === null ? null
              : <Familiarity score={scoreOf(d)} size={30} testID={`word-drill-${d.id}-score`} />}
          </Row>
        ))}
      </List>
    </Sheet>
  );
}

/* The button and its sheet. The sheet's open state lives here, in a child of
   the card, because a Modal owned by the screen that also owns the card's
   state does not redraw in the test renderer (§30be). `onPick(drill)` is the
   caller's — Study navigates, so the route name sits in Study.js where
   routes.test.js can read it. Draws nothing for a card with no word behind it. */
export function WordDrillsButton({ word, onPick, testID = "word-drills-open" }) {
  const [open, setOpen] = useState(false);
  if (wordIndex(word) < 0) return null;
  return (
    <>
      <ActionChip label="Drills" testID={testID} onPress={() => setOpen(true)} />
      {open ? (
        <WordDrillsSheet word={word} onClose={() => setOpen(false)}
                         onPick={(drill) => { setOpen(false); onPick(drill); }} />
      ) : null}
    </>
  );
}
