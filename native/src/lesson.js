/* The three teaching steps of a lesson: the word list, the grammar note, and the
 * vocabulary card.
 *
 * The owner, 2026-09-10: "the lesson slides look so damn boring". They did, and
 * the reasons were structural rather than a matter of taste:
 *
 *   - the three steps were inline JSX inside `VocabFlow`, so there was nothing
 *     to design — no component, no name, no test seam;
 *   - all three drew the same `Card`: same border, same radius, same surface, as
 *     the verdict panel and the Done panel. Four different kinds of moment, one
 *     shape;
 *   - the photograph was a 150 px band inset inside the card's padding, which
 *     reads as an attachment rather than as the subject;
 *   - there was no motion anywhere in the lesson at all. Stepping from card to
 *     card was a synchronous re-render; the progress bar jumped.
 *
 * So: each step now has its own shape and its own weight, the photograph runs to
 * the card's edges and is the top of it, everything arrives with a short rise
 * (`useEnter`), and Yuri (§30m) is present at the two moments that frame a
 * lesson — meeting the set, and the rule the chapter turns on.
 *
 * §25's line holds: motion reinforces, it never delays. Nothing here waits on an
 * animation to become usable, and a learner with reduce-motion on gets the end
 * state immediately.
 */

import React from "react";
import { Animated, View, Image, Pressable } from "react-native";
import { useTheme, radius, type as T } from "./theme";
import { Card, Bar, Pill, Speaker, Muted, List, Row, Senses, Text, Btn } from "./ui";
import { RuleCard } from "./rules";
import { Linked } from "./words";
import { Guide } from "./guide";
import { useEnter } from "./motion";
import { L, linesWith } from "./data";
import { IMAGES, CREDITS } from "./images";
import { firstSense } from "@core/util";
import { soundTip } from "@core/alphabet";
import { isIrregular } from "@core/facts";
import { hasRealAudio } from "./audio";
import { VideoLines } from "./prep";

/* How big a word can be drawn in the head band, by how long it is. */
const bandSize = (word) => {
  const n = (word || "").length;
  if (n <= 2) return 76;
  if (n <= 4) return 62;
  if (n <= 7) return 50;
  if (n <= 11) return 38;
  return 30;
};

/* Where you are in the lesson. One row, and the bar now fills rather than
   jumping — the step you just finished is the thing it is reporting. */
export function StepBar({ at, total }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <View style={{ flex: 1 }}><Bar value={total ? at / total : 0} animate /></View>
      <Pill tone="brand">{`${at + 1}/${total}`}</Pill>
    </View>
  );
}

/* ------------------------------------------------------------- the word list */

/* The whole set before the cards begin. Yuri opens the lesson here — the one
   place a guide belongs, since this is the moment the learner is told what they
   are about to do — and the rows stagger in so the list reads as arriving rather
   than as having always been there. */
export function WordList({ unit, words, at, total }) {
  const t = useTheme();
  const head = useEnter([unit.id, at]);
  const odd = words.filter((i) => L[i] && isIrregular(L[i]));
  const regular = words.filter((i) => !odd.includes(i));
  return (
    <>
      <StepBar at={at} total={total} />
      <Animated.View style={[head, { flexDirection: "row", alignItems: "center",
                                     gap: 12, marginBottom: 16 }]}>
        <Guide pose="wave" size={64} />
        <View style={{ flex: 1 }}>
          <Text testID="vocab-list" style={{ color: t.ink, fontSize: T.title, fontWeight: "700" }}>
            {`${words.length} new ${words.length === 1 ? "word" : "words"}`}
          </Text>
          <Muted numberOfLines={1}>{unit.name}</Muted>
        </View>
      </Animated.View>
      {/* The words that break the rules, grouped under their own heading
          (the owner, 2026-09-29: "when necessary, they should be grouped when
          they are encountered in lesson plans"): met together, and met as
          the exceptions they are rather than one among five. */}
      <List>
        {regular.map((i, k) => (
          <WordRow key={i} i={i} unit={unit} delay={60 + k * 45} />
        ))}
      </List>
      {odd.length ? (
        <View testID="vocab-irregular" style={{ marginTop: regular.length ? 18 : 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Pill tone="irregular">Irregular</Pill>
          </View>
          <List>
            {odd.map((i, k) => (
              <WordRow key={i} i={i} unit={unit} delay={60 + (regular.length + k) * 45} />
            ))}
          </List>
        </View>
      ) : null}
    </>
  );
}

function WordRow({ i, unit, last, delay }) {
  const t = useTheme();
  const word = L[i];
  // Staggered by position, so the eye is led down the list once. The distance is
  // small: a list that flies in from far away is a toy, not a lesson.
  const anim = useEnter([i], { delay, distance: 6 });
  return (
    <Animated.View style={anim}>
      <Row testID={`new-${word.b}`} last={last}>
        {IMAGES[word.b] ? (
          <Image source={IMAGES[word.b]} resizeMode="cover"
                 accessibilityLabel={`Photo: ${firstSense(word)}`}
                 style={{ width: 46, height: 46, borderRadius: radius.sm }} />
        ) : (
          /* The unit's icon used to stand in, which meant a lesson of function
             words was five identical grey tiles down the left of the list — the
             most repetitive thing on the screen, in the place the eye starts.
             The word's own first letter is different on every row and is the
             thing being learned. */
          <View style={{ width: 46, height: 46, borderRadius: radius.sm,
                         backgroundColor: t.brandBg, alignItems: "center",
                         justifyContent: "center" }}>
            <Text style={{ color: t.brandInk, fontSize: 22, fontWeight: "700" }}>
              {(word.b || "?").charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.ink, fontSize: T.head + 2, fontWeight: "600" }}>{word.w}</Text>
          <Muted numberOfLines={1}>{firstSense(word)}</Muted>
        </View>
        <Speaker text={word.b} size={36} />
      </Row>
    </Animated.View>
  );
}

/* ----------------------------------------------------------- the grammar note */

/* The rule the chapter turns on. It gets the brand colour and a left edge, so a
   rule does not look like a vocabulary card with different words in it, and Yuri
   points at it rather than saying anything about it. */
export function GrammarNote({ unit, note, at, total, onEpisode }) {
  const t = useTheme();
  const anim = useEnter([note.title, at]);
  return (
    <>
      <StepBar at={at} total={total} />
      <Animated.View style={anim}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, marginBottom: 12 }}>
          <Guide pose="point" size={58} />
          <View style={{ flex: 1, paddingBottom: 6 }}>
            <Muted numberOfLines={1}>{unit.name}</Muted>
            <Text style={{ color: t.brand, fontSize: T.tiny, fontWeight: "700",
                           letterSpacing: 0.8, marginTop: 2 }}>
              THE RULE
            </Text>
          </View>
        </View>
        <RuleCard note={note} tone="brand" testID="grammar-note" />
        {/* The chapter's grammar episode, where the library has one (Phase 14):
            the same rule, taught by a person, in slow Russian. */}
        {onEpisode && unit.v && unit.v.lesson ? (
          <Btn testID="grammar-episode" label="Watch the grammar episode" style={{ marginTop: 12 }}
               onPress={() => onEpisode(unit.v.lesson.id)} />
        ) : null}
      </Animated.View>
    </>
  );
}

/* ------------------------------------------------------- the vocabulary card */

/* One word, and everything about it worth reading before it is asked for.
 *
 * The photograph is the top of the card now rather than a panel inside it: it
 * runs to all three edges, is taller, and the card's own padding is cancelled
 * for it. That single change is most of the difference between "a form with a
 * picture attached" and "a card about a thing".
 *
 * The speaker moved off the headword's row. Sharing a centred row with a 40 px
 * button pushed every word off-centre by 25 px, and the longer the word the
 * worse it looked; now the word is optically centred and the button sits under
 * it where the thumb reaches.
 */
export function WordCard({ i, at, total, unit, onMoment }) {
  const t = useTheme();
  const w = L[i];
  const anim = useEnter([i]);
  const pad = 16;                                  // Card's own padding, cancelled for the photo
  const tip = soundTip(w.b);
  const photo = IMAGES[w.b];
  const credit = CREDITS[w.b];
  const tags = [w.p, w.g, w.a].filter(Boolean).filter((x) => x !== "other");
  // Where the unit's video says this word (Phase 14): the lesson is preparing
  // for that video, so the card shows the word in it and plays the moment.
  const moment = unit && unit.v && unit.v.heard && (unit.v.heard[w.b] || [])[0];
  // The video's own sentences with this word, which are what the lesson is
  // preparing for (2026-09-29: *"for those sentences, we should only use the
  // ones in the video"*); without one, only the collection's recorded
  // examples — never a sentence the phone would have to read.
  const lines = unit ? linesWith(unit, [i]).slice(0, 2) : [];
  const examples = lines.length ? [] : (w.x || []).filter((ex) => hasRealAudio(ex.ru)).slice(0, 2);

  return (
    <>
      <StepBar at={at} total={total} />
      <Animated.View style={anim}>
        <Card testID="word-card"
              style={{ alignItems: "center", padding: pad, borderRadius: radius.xl,
                       overflow: "hidden" }}>
          {/* Every card has a head band, and only what fills it changes.
              Photo-less words used to open on white space with a small word
              floating in it, which is most of what «в» looked like: a big empty
              box. Only 346 of the 1,056 unit words have a photograph and the
              ones that do not are largely the function words a beginner meets
              first, so the empty case *is* the common case early on. Now the
              word itself takes the band on brand colour and is not repeated
              below — a preposition gets a card that looks deliberate. */}
          {photo ? (
            /* A photograph of the thing (tools/harvest_images.py). Above the word:
               see it, then read it. CC BY and CC BY-SA require the credit wherever
               the picture appears, not only on the entry (rule 20.10). */
            <View style={{ marginHorizontal: -pad, marginTop: -pad, marginBottom: 14,
                           alignSelf: "stretch" }}>
              <Image testID="word-photo" source={photo} resizeMode="cover"
                     accessibilityLabel={`Photo: ${firstSense(w)}`}
                     style={{ width: "100%", height: 190 }} />
              {credit ? (
                <Muted testID="photo-credit" size={T.tiny}
                       style={{ textAlign: "center", paddingTop: 6, paddingHorizontal: pad }}>
                  {`${credit.a || "Wikimedia Commons"} · ${credit.l}`}
                </Muted>
              ) : null}
            </View>
          ) : (
            <View testID="word-band"
                  style={{ marginHorizontal: -pad, marginTop: -pad, marginBottom: 14,
                           alignSelf: "stretch", height: 150, backgroundColor: t.brandBg,
                           alignItems: "center", justifyContent: "center", paddingHorizontal: pad }}>
              {/* Sized to the word. The band is a fixed height, so «в» at the
                  same 40 px as «здравствуйте» sat in it like a typo; the early
                  curriculum is mostly one- and two-letter function words, so
                  this is the common case rather than an edge one. */}
              <Text numberOfLines={2}
                    style={{ color: t.brandInk, fontWeight: "700", textAlign: "center",
                             fontSize: bandSize(w.w), lineHeight: bandSize(w.w) + 8 }}>
                {w.w}
              </Text>
            </View>
          )}

          {photo ? (
            <Text style={{ color: t.ink, fontSize: T.hero, fontWeight: "700",
                           textAlign: "center", lineHeight: T.hero + 6 }}>
              {w.w}
            </Text>
          ) : null}
          <Speaker text={w.b} />

          {/* Four is enough on a teaching card; the rest are counted, not hidden. */}
          <Senses e={w.e} size={T.body + 1} max={4} style={{ marginTop: 10 }} />

          {/* "other" is the lexicon's bucket for closed classes, and it told a
              learner nothing except that the app had nothing to say. */}
          {tags.length ? (
            <View style={{ flexDirection: "row", gap: 6, marginTop: 12, flexWrap: "wrap",
                           justifyContent: "center" }}>
              {tags.map((x) => <Pill key={x}>{x}</Pill>)}
            </View>
          ) : null}

          {/* One line about a sound this word carries — a letter that is not what
              it looks like, or one English has not got (ROADMAP P10.2). A tip,
              not a lesson: the whole system is under Practice → Sounds. */}
          {tip ? (
            <View testID="sound-tip"
                  style={{ marginTop: 14, backgroundColor: t.surface2, borderRadius: radius.md,
                           paddingHorizontal: 12, paddingVertical: 10, alignSelf: "stretch" }}>
              <Muted size={T.small} style={{ textAlign: "center" }}>{tip}</Muted>
            </View>
          ) : null}

          {lines.length ? (
            <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.lineSoft,
                           alignSelf: "stretch" }}>
              <Muted size={T.small}>In the video</Muted>
              <VideoLines lines={lines} testID="word-lines"
                          onMoment={onMoment ? (l) => onMoment(l.vid, null, l.t) : undefined} />
            </View>
          ) : null}

          {examples.map((ex, k) => (
            <View key={k} style={{ marginTop: k ? 10 : 14, paddingTop: k ? 10 : 12,
                                   borderTopWidth: 1, borderTopColor: t.lineSoft,
                                   alignSelf: "stretch" }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                <View style={{ flex: 1 }}><Linked text={ex.ru} size={T.head + 1} /></View>
                <Speaker text={ex.ru} size={36} />
              </View>
              <Muted>{ex.en}</Muted>
            </View>
          ))}

          {!lines.length && moment && onMoment ? (
            <Pressable testID="word-moment" accessibilityRole="button"
                       accessibilityLabel="Play it in the video"
                       onPress={() => onMoment(unit.v.id, w.b, moment.t)}
                       style={({ pressed }) => ({ marginTop: 14, paddingTop: 12, borderTopWidth: 1,
                                                  borderTopColor: t.lineSoft, alignSelf: "stretch",
                                                  flexDirection: "row", alignItems: "center", gap: 10,
                                                  opacity: pressed ? 0.6 : 1 })}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.brandBg,
                             alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: t.brandInk, fontSize: 14 }}>▶</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Muted size={T.small}>In the video</Muted>
                <Text style={{ color: t.ink2, fontSize: T.body }} numberOfLines={2}>{moment.s}</Text>
              </View>
            </Pressable>
          ) : null}
        </Card>
      </Animated.View>
    </>
  );
}
