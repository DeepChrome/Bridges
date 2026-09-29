/* The full dictionary entry — the second tap.
 *
 * Everything the summary sheet deliberately withholds: the paradigm in full, and
 * every sentence from the collection that uses the word. The sentences are
 * themselves linked, so reading an entry can lead to the next word rather than
 * dead-ending.
 */

import React, { useState } from "react";
import { View, Image, Pressable, Linking } from "react-native";
import { useTheme, radius } from "../theme";
import { Screen, Card, Pill, Speaker, Muted, Senses, SenseList, List, Row, SectionLabel, Text, Familiarity } from "../ui";
import { TableGroup, Facts } from "../rules";
import { wordFacts } from "@core/facts";
import { familiarity, familiarityLabel, cardFor } from "@core/scheduler";
import { useSession } from "../session";
import { L, UN, resolveWord, heardIn, sensesOf, idxOfWord, rankOf } from "../data";
import { Linked } from "../words";
import { IMAGES, CREDITS } from "../images";
import { clock, short } from "./Misc";

/* How many videos an entry lists under "Heard in" before it asks. Four is a
   glance; 22 % of the words the library says are said in more than four videos
   and «что» in 130, so the count in the heading used to promise a list the
   screen had no way to reach (ROADMAP P11.9). */
const HEARD_ROWS = 4;
const GENDER = { m: "masculine", f: "feminine", n: "neuter", pl: "plural" };

export default function Word({ route, navigation }) {
  /* Addressed by the word, not by an index: lemma indices are assigned by frequency
     at build time and move on every rebuild, which is the same reason learner state
     keys on the word. The index form is still accepted for older call sites. */
  const p = route.params || {};
  const w = p.word !== undefined ? resolveWord(p.word) : L[p.i];
  if (!w) {
    return (
      <Screen>
        <Muted style={{ textAlign: "center", marginTop: 40 }}>
          {`“${p.word}” is not in the dictionary.`}
        </Muted>
      </Screen>
    );
  }
  return (
    <Screen>
      <WordEntry w={w} index={p.i} navigation={navigation} />
    </Screen>
  );
}

/* The entry itself, which the screen wraps and the word sheet can show whole
   when there is no navigator to push the screen onto (words.js). Without a
   navigation object the "Heard in" list is left out: its rows open the player,
   and a row that cannot is a dead control. */
/* Where the learner stands with this word: the same 0–100 the flashcard's ring
   carries, off the same card, with a word for it (the owner, 2026-09-28). The
   score is read against how common the word is — «это» is mastered once it has
   held three weeks, a rare word only near three months — so the words met every
   day reach 100 when they are genuinely known (core/scheduler.js). A word never
   studied says so and draws no ring; a zero would claim a measurement. */
function WordStatus({ word }) {
  const t = useTheme();
  const session = useSession();
  if (!session || !session.st) return null;
  const entry = (session.st.seen || {})[word] || null;
  const score = familiarity(cardFor(entry), rankOf(word));
  const label = familiarityLabel(score);
  return (
    <View testID="word-status" style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 }}
          accessibilityLabel={score === null ? "Not studied yet" : `${label}, ${score} of 100`}>
      {score === null ? null : <Familiarity score={score} size={40} />}
      {/* The ring carries the colour; the word stays ink, since a mixed
          amber is a text colour nobody audited (§31). */}
      <Text style={{ color: score === null ? t.ink3 : t.ink, fontWeight: "700" }}>
        {score === null ? (entry ? "New" : "Not studied yet") : label}
      </Text>
    </View>
  );
}

export function WordEntry({ w, index, navigation }) {
  const t = useTheme();
  const [allHeard, setAllHeard] = useState(false);
  const [openHeard, setOpenHeard] = useState(false);
  const unit = w.u ? UN.find((u) => u.id === w.u) : null;
  const examples = w.x || [];
  const heard = navigation ? heardIn(w.b) : [];
  /* Senses are shipped for the studied words by index, so a dictionary-only
     entry (the deep tier) has none and shows its gloss, as it always did. */
  const senses = sensesOf(index !== undefined ? index : idxOfWord(w.b));

  const photo = IMAGES[w.b];
  const credit = CREDITS[w.b];
  return (
    <>
      <Card>
        {photo ? (
          <Image testID="word-photo" source={photo} resizeMode="cover"
                 accessibilityLabel={`Photo: ${(w.e || "").split(/[,;]/)[0]}`}
                 style={{ width: "100%", height: 160, borderRadius: radius.md, marginBottom: 12 }} />
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ color: t.ink, fontSize: 32, fontWeight: "600", flex: 1 }}>
            {w.w}
          </Text>
          <Speaker text={w.b} />
        </View>
        {/* The entry gets every sense there is, with its examples: this is the
            screen a learner opened *to read* (§30q). The card shows four. */}
        {senses
          ? <SenseList senses={senses} size={16} style={{ marginTop: 10 }} />
          : <Senses e={w.e} size={16} align="left" style={{ marginTop: 8 }} />}
        {/* Words a learner reads, not codes: "feminine", not "f".
            The frequency rank went on 2026-09-22 (the owner: "remove the 'X by
            frequency' in the definition details"). It was a fact about the
            corpus, not about the word — nothing a learner does with «№ 187»,
            and it sat in the same row as the grammar, which is the row they
            came to read. The rank itself is not lost: it is the lemma's own
            index, and it is what orders the new flashcards (§30ap). */}
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {[w.p, GENDER[w.g] || w.g, w.a].filter(Boolean).map((x) => <Pill key={x}>{x}</Pill>)}
          {w.pt ? <Pill>{`pair: ${[w.pt, w.pt2].filter(Boolean).join(", ")}`}</Pill> : null}
          {unit ? <Pill tone="brand">{unit.name}</Pill> : null}
        </View>
        {/* What is true about the word, before the tables that follow from
            it: gender and why, hard or soft stem, which conjugation, whether
            the stress moves (core/facts.js, 2026-09-28). The entry is the
            other place a learner comes to look something up, so it gets the
            same guide the drill's bulb does. */}
        <WordStatus word={w.b} />
        <Facts facts={wordFacts(w)} testID="word-facts" />
        {/* One section a table, the first open: a verb is three grids and a
            noun twelve cells, and stacked whole they buried the rest (§30bb). */}
        <TableGroup tables={w.t} speak testID="word-tables" />
        {credit ? (
          // The photo's record: title, author where one is named, licence — and
          // the page it came from, which is what a CC BY credit asks for.
          <Pressable onPress={credit.u ? () => Linking.openURL(credit.u) : undefined}
                     accessibilityRole={credit.u ? "link" : undefined}
                     accessibilityLabel={`Photo credit: ${credit.t}${credit.a ? `, ${credit.a}` : ""}, ${credit.l}`}
                     hitSlop={8} style={{ marginTop: 12 }}>
            <Muted size={11} testID="photo-credit">
              {`Photo: ${credit.t}${credit.a ? `, ${credit.a}` : ""} · ${credit.l}, Wikimedia Commons`}
            </Muted>
          </Pressable>
        ) : null}
      </Card>

      {examples.length ? (
        <>
          {/* The heading is the whole of the provenance signal now (the owner,
              2026-09-22: "no need to flag tatoeba cards"). Each borrowed
              sentence used to carry an uppercase TATOEBA caption of its own,
              which put a source line under half the examples of half the
              dictionary. §30a's rule survives where it does the work: an
              unlabelled *group* is his own collection, a mixed one says
              "Examples", and the licence credit is built from the databases'
              own meta rows on the Credits screen, which is what CC BY asks
              for — a per-row caption never was. */}
          <SectionLabel style={{ marginTop: 22 }}>
            {examples.every((e) => !e.src)
              ? `In your collection · ${examples.length}`
              : `Examples · ${examples.length}`}
          </SectionLabel>
          <Card>
            {examples.map((e, k) => (
              <View
                key={k}
                style={{ paddingVertical: 10,
                         borderTopWidth: k ? 1 : 0, borderTopColor: t.lineSoft }}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Linked text={e.ru} />
                  </View>
                  <Speaker text={e.ru} size={36} />
                </View>
                <Muted style={{ marginTop: 4 }}>{e.en}</Muted>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {/* Where a native speaker says it: the videos that say the word, each at
          the moment it is said. A tap opens the player there, the run-up
          included (the owner, 2026-09-08). Only videos that say the word are
          listed — the transcript index decides, never a guess. */}
      {/* Closed until asked for (the owner, 2026-09-29), like the tables: the
          entry is read top to bottom, and twenty video rows under it were the
          longest thing on the screen for a word like «что». */}
      {heard.length ? (
        <>
          <Pressable testID="heard-toggle" onPress={() => setOpenHeard(!openHeard)}
                     accessibilityRole="button" accessibilityState={{ expanded: openHeard }}
                     style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", minHeight: 44,
                                                marginTop: 14, opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ flex: 1, color: t.ink, fontSize: 16, fontWeight: "700" }}>
              {`Heard in · ${heard.length}`}
            </Text>
            <Text style={{ color: t.ink3, fontSize: 16 }}>{openHeard ? "▾" : "▸"}</Text>
          </Pressable>
          {openHeard ? (
          <List>
            {(allHeard ? heard : heard.slice(0, HEARD_ROWS)).map((h) => (
              <Row key={h.id} testID={`heard-${h.id}`}
                   onPress={() => navigation.navigate("Video", { videoId: h.id, word: w.b, at: h.t })}>
                <Pill tone="brand">{clock(h.t)}</Pill>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>
                    {short(h.title)}
                  </Text>
                  <Muted>{[h.ch, `«${h.w}»`, h.n > 1 ? `×${h.n}` : null].filter(Boolean).join(" · ")}</Muted>
                </View>
              </Row>
            ))}
            {/* The rest of them, in the row after the last one rather than as a
                control off to the side — the list expands where it stopped. */}
            {heard.length > HEARD_ROWS ? (
              <Row testID="heard-more" onPress={() => setAllHeard(!allHeard)}>
                <Text style={{ flex: 1, color: t.brandInk, fontSize: 15, fontWeight: "600" }}>
                  {allHeard ? "Show fewer" : `Show all ${heard.length}`}
                </Text>
              </Row>
            ) : null}
          </List>
          ) : null}
        </>
      ) : null}
    </>
  );
}
