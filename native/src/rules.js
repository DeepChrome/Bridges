/* How the app draws a rule, a table, and the reference behind the bulb.
 *
 * These were three near-copies of two components (§22): `Table` in
 * screens/Word.js, a second table inside `HintSheet` in screens/Run.js, and
 * `RuleNote` there beside `GrammarNote` in lesson.js — the same grammar card
 * rendered two different ways depending on which screen you met it on. One
 * rule should look like a rule wherever it turns up, so there is one of each
 * here and the four call sites import them.
 *
 * The bulb (the owner, 2026-09-27: *"when you're asking them to perform a
 * specific skill, make sure there's a lightbulb available"*). `Reference` is
 * that sheet: every table the word has, nothing held back (§30az — a
 * reference you have to outwit is not a reference), with the cell the
 * question asks for marked in the brand colour (`at` on the question, set by
 * the generator, because only the generator knows which cell). Since
 * 2026-10-08 it is the tables alone: no facts, no rule card, no topic link
 * (§30by). A word with no table has no bulb.
 */

import React, { useState } from "react";
import { View, ScrollView, Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme, radius, type as T } from "./theme";
import { Text, Card, Muted, Note, Speaker, Sheet, Btn, SectionLabel, Marked, Bubble, Flag, Subheading } from "./ui";
import { Linked, navRef } from "./words";
import { tableLabel } from "@core/forms";
import { irregularities } from "@core/facts";
// The form recordings are looked up where every sound is (audio.js formClip).
import { say, hasRealAudio, formClip } from "./audio";
import { wordClip } from "./wordaudio";
import { fold } from "@core/util";

/* A column is wide enough for a long inflected form and no wider: at 110 a
   three-column table fits a 390 px screen without scrolling, which is most of
   them, and the rest scroll sideways rather than wrapping. */
const COL = 110;

/* One form in a table, which says itself when pressed (the owner,
 * 2026-09-28: *"an audio button next to every pronunciation of a word so I can
 * hear how the word is said in all forms"*).
 *
 * **A recording of this exact form, or no speaker** (ROADMAP 13.42, bought
 * 2026-09-28; the phone's voice taken out 2026-10-04). The word bundle is
 * keyed by the *folded* spelling and cannot be used here: for a spelling two
 * stresses share («руки́» / «ру́ки») it would play whichever word its clip was
 * bought for, the wrong stress half the time, on the one control whose
 * purpose is hearing where the stress falls. So forms have their own
 * manifest, keyed by the accented form; the spellings with two stresses were
 * never bought, and those cells, like every form of a word outside the units,
 * have no speaker.
 *
 * The whole cell is the target, with a small glyph beside the form: a 40 px
 * round speaker in every cell would push a three-column table past the width
 * of a phone. */
export function FormSpeaker({ form, style, testID, children, device = true, headword }) {
  const t = useTheme();
  /* First the form's own recording, looked up by its **accented** spelling
     (formaudio.js) — bought for every form whose spelling has one stress.
     Then, with `device={false}`, any recording of the spelling at all — right
     for a word shown on its own (the endings' examples), where there is no
     second stress to confuse it with.
     And the cell that *is* the headword («вода́» in вода's own table) plays
     the headword's clip — the one the card already plays for the word. A
     rare homograph elsewhere in the dictionary («во́да», a genitive of
     "waters") takes the form recording away (§30cf), and a table with no
     speaker on its own dictionary form, under a card that plays it, read as
     broken. */
  const clip = formClip(form) || (headword && form === headword ? wordClip(fold(form)) : null);
  const real = !!clip || (!device && hasRealAudio(form));
  /* Only a recording plays (the owner, 2026-10-04): a form with none — a
     word outside the units, or a spelling with two stresses — shows no
     speaker rather than the phone's voice. */
  const live = real;
  const play = () => (clip ? say(form, { clip }) : say(form));
  return (
    <Pressable testID={testID}
               onPress={live ? play : undefined}
               accessibilityRole={live ? "button" : undefined}
               accessibilityLabel={live ? `Hear ${form}` : undefined}
               // 36 tall plus 4 either side: the 44 a finger needs (rule 20.12)
               // without making every row of a twelve-row table that tall.
               hitSlop={4}
               style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 4,
                                          opacity: pressed ? 0.55 : 1 }, style]}>
      {children}
      {live ? (
        <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={t.brandInk}
             strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M11 5 6 9H3v6h3l5 4z" />
          <Path d="M15.5 8.5a5 5 0 0 1 0 7" />
        </Svg>
      ) : null}
    </Pressable>
  );
}

const CYRILLIC = /[Ѐ-ӿ]/;

/* One paradigm or reference table.
 *
 * `mark` is [row, column] — the cell the question is asking for, drawn in the
 * brand colour so the eye lands on it. It used to *blank* that cell, and the
 * owner reversed it (§30az): the reference is for learning, not a puzzle, so
 * the cell it points at is the one it shows most clearly.
 *
 * `speak` gives every form a speaker (FormSpeaker). Off by default: the
 * grammar reference's tables hold *endings* — «-ов», «-ами» — and a speaker
 * reading a lone ending aloud says something no Russian would. The entry and
 * the drill's reference turn it on, because their tables hold real words. */
export function Table({ table, mark, speak, testID, bare, labelHead, headword }) {
  const t = useTheme();
  const [br, bc] = mark || [];
  /* Laid out for a person reading it rather than for a parser (the owner,
     2026-09-28: *"it seems like it's optimized for computers to look at but not
     humans"*): every other row shaded so the eye can follow one across, the
     column heads in ordinary words rather than spaced capitals, and the grid
     inside a rounded panel so it reads as one object. `bare` drops the title,
     for a table whose section header already names it (TableGroup). */
  return (
    <View testID={testID} style={{ marginTop: bare ? 4 : 14 }}>
      {table.title && !bare ? <SectionLabel>{table.title}</SectionLabel> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: t.line,
                       overflow: "hidden" }}>
          <View style={{ flexDirection: "row", backgroundColor: t.surface3, paddingHorizontal: 10 }}>
            {table.columns.map((c, ci) => (
              <Text key={c + ci}
                    style={{ width: COL, color: t.ink2, fontSize: T.small, fontWeight: "700",
                             paddingVertical: 7 }}>
                {ci === 0 && !labelHead ? "" : c}
              </Text>
            ))}
          </View>
          {table.rows.map((r, ri) => (
            <View key={ri} testID={testID ? `${testID}-row-${ri}` : undefined}
                  style={{ flexDirection: "row", paddingHorizontal: 10,
                           backgroundColor: ri % 2 ? t.surface2 : t.surface }}>
              {r.map((cell, ci) => {
                const asked = ri === br && (ci === bc || ci === 0);
                const style = { fontSize: ci === 0 ? T.small : T.body,
                                fontWeight: asked ? "700" : "400",
                                color: asked ? t.brandInk : ci === 0 ? t.ink3 : t.ink };
                const forms = (Array.isArray(cell) ? cell : [cell]).filter(Boolean);
                /* The row label is not a form ("Genitive", "я"), and neither
                   is anything without Cyrillic in it. */
                if (!speak || ci === 0 || !forms.some((f) => CYRILLIC.test(f))) {
                  return (
                    <Text key={ci} testID={asked && ci === bc ? "table-asked" : undefined}
                          style={[{ width: COL, paddingVertical: 6 }, style]}>
                      {forms.join(" / ")}
                    </Text>
                  );
                }
                /* A cell may hold two forms («ру́кою / руко́й»); each says itself. */
                return (
                  <View key={ci} testID={asked && ci === bc ? "table-asked" : undefined}
                        style={{ width: COL, paddingVertical: 4, gap: 2 }}>
                    {forms.map((f, fi) => (
                      <FormSpeaker key={fi} form={f} testID={`say-${ri}-${ci}-${fi}`} headword={headword}
                                   style={{ minHeight: 36 }}>
                        <Text style={style}>{f}</Text>
                      </FormSpeaker>
                    ))}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/* A word's tables as sections that open and close (2026-09-28).
 *
 * A verb's entry was three full grids one after another — present, past,
 * imperative — and a noun's twelve-cell declension sat above everything that
 * came after it. Each table is a row now, its name and a chevron, and `open`
 * says which start open: the first on an entry, the one the question is about
 * in the bulb's sheet. The learner opens the rest when they want them. */
/* `aspect` is the verb's, so its personal forms are headed Present or Future
   rather than both (core/forms.js tableLabel). */
export function TableGroup({ tables, speak, mark, open = [0], testID = "tables", aspect, headword }) {
  const t = useTheme();
  const [shown, setShown] = React.useState(() => new Set(open));
  if (!tables || !tables.length) return null;
  const toggle = (k) => setShown((s) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });
  return (
    <View testID={testID} style={{ marginTop: 14, gap: 6 }}>
      {tables.map((tb, k) => {
        const on = shown.has(k);
        return (
          <View key={k}>
            <Pressable testID={`${testID}-head-${k}`} onPress={() => toggle(k)}
                       accessibilityRole="button" accessibilityState={{ expanded: on }}
                       accessibilityLabel={tableLabel(tb.title, aspect)}
                       style={({ pressed }) => ({ flexDirection: "row", alignItems: "center",
                         minHeight: 44, opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ flex: 1, color: t.ink, fontSize: T.body, fontWeight: "700" }}>{tableLabel(tb.title, aspect)}</Text>
              <Text style={{ color: t.ink3, fontSize: T.body }}>{on ? "▾" : "▸"}</Text>
            </Pressable>
            {on ? (
              <Table table={tb} speak={speak} bare testID={`${testID}-${k}`} headword={headword}
                     mark={mark && mark.table === tb ? mark.at : null} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/* A grammar card — title, one rule, its examples.
 *
 * `tone="brand"` is the lesson's teaching step, where the rule is the whole
 * screen and earns the coloured panel and the left edge. Plain is everywhere
 * else: inside a sheet, under a verdict. Both are the same component so the
 * rule cannot read as two different things. */
export function RuleCard({ note, tone, testID, style }) {
  const t = useTheme();
  const brand = tone === "brand";
  const body = (
    <>
      {/* On its own teaching step the rule's name is the screen's title;
          anywhere else it sits under a section's Heading and is the
          Subheading, so a page carries two heading styles, not three. */}
      {brand ? (
        <Text style={{ color: t.ink, fontSize: T.title, fontWeight: "700" }}>{note.title}</Text>
      ) : (
        <Subheading>{note.title}</Subheading>
      )}
      <Note text={note.body} color={t.ink2} style={{ marginTop: 6 }} />
      {/* A set of endings, pairs or choices is a table, not a sentence (the
          owner, 2026-10-09: "side by side tables when that would help
          organization… not just a wall of text"). Forms in it say themselves. */}
      {note.table ? <Table table={note.table} speak labelHead testID={testID ? `${testID}-table` : "rule-table"} /> : null}
      <Examples examples={note.examples} line={brand ? t.brandDim : t.lineSoft} />
    </>
  );
  if (!brand) return <View testID={testID} style={style}>{body}</View>;
  return (
    <Card testID={testID}
          style={[{ borderLeftWidth: 4, borderLeftColor: t.brand, backgroundColor: t.brandBg,
                    borderColor: t.brandDim }, style]}>
      {body}
    </Card>
  );
}

/* Russian over its English, each with a speaker — the one way an example is
   drawn anywhere in the app (§30as: everything Russian can be heard). */
export function Examples({ examples, line }) {
  const t = useTheme();
  if (!examples || !examples.length) return null;
  return (
    <>
      {examples.map(([ru, en], k) => (
        <View key={k} style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1,
                               borderTopColor: line || t.lineSoft }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <View style={{ flex: 1 }}><Linked text={ru} size={T.head} /></View>
            <Speaker text={ru} size={34} />
          </View>
          <Muted style={{ marginTop: 2 }}>{en}</Muted>
        </View>
      ))}
    </>
  );
}

/* One section of the grammar reference: a heading, one sentence, and then
   structure. `uses` is the list of jobs a case does — the bullets that exist
   so "when do I use the genitive" is answered by a list rather than by a
   paragraph nobody finishes. */
export function TopicSection({ section, cards, testID }) {
  const t = useTheme();
  return (
    <View testID={testID} style={{ marginTop: section.heading ? 22 : 6 }}>
      {/* No heading on a section that is a page of its own: the page title is it. */}
      {section.heading ? (
        <Text style={{ color: t.ink, fontSize: T.head, fontWeight: "700" }}>
          {section.heading}
        </Text>
      ) : null}
      <Note text={section.rule} color={t.ink2} style={{ marginTop: 4 }} />
      {/* What the rule means and how to use it, a sentence to a line
          (core/grammar.js `why`): the rule names the point, this explains it. */}
      {section.why && section.why.length ? (
        <View testID="section-why" style={{ marginTop: 10, gap: 8 }}>
          {section.why.map((w, k) => <Marked key={k} text={w} size={T.body} color={t.ink} />)}
        </View>
      ) : null}
      {section.uses ? (
        <View style={{ marginTop: 10, gap: 6 }}>
          {section.uses.map((u, k) => (
            <View key={k} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
              <Text style={{ color: t.brand, fontSize: T.body, fontWeight: "700",
                             lineHeight: T.body + 5 }}>·</Text>
              <Text style={{ flex: 1, color: t.ink, fontSize: T.body, lineHeight: T.body + 5 }}>
                {u}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {section.table ? <Table table={section.table} /> : null}
      <Examples examples={section.examples} />
      {/* Where the course itself teaches this. Drawn from the payload rather
          than restated in core/grammar.js, so the reference and the lesson
          cannot drift (§22). */}
      {(cards || []).map(({ unit, note }) => (
        <Card key={unit.id} testID={`card-${unit.id}`}
              style={{ marginTop: 14, borderLeftWidth: 4, borderLeftColor: t.brand,
                       backgroundColor: t.brandBg, borderColor: t.brandDim }}>
          <Muted size={T.tiny}>{unit.name}</Muted>
          <RuleCard note={note} style={{ marginTop: 6 }} />
        </Card>
      ))}
    </View>
  );
}

/* What the app can say about this word, from its own paradigm (core/facts.js)
   — the owner, 2026-09-28: *"If it's irregular, it should say that it's
   irregular. There can be details about identifying stems, masculine vs
   feminine etc."* A table says what the form is; these say why, which is the
   half that transfers to the next word. A pill and one sentence each, never a
   paragraph. */
/* A fact's pill opens the reference section that explains it (`ref`, from
   core/facts.js FACT_REFS), over whatever screen it is on: the Grammar route
   is on the Root stack, so a navigate from any tab finds it. */
const openRule = (ref) => {
  if (ref && navRef.isReady()) navRef.navigate("Grammar", { topic: ref.topic, section: ref.section, only: true });
};

/* Labels only, the sentence behind a tap (the owner, 2026-10-04: "less
   verbose and only provide details if clicked in sort of a bubble"): a row of
   pills, and a pill opens its note in a Bubble with the rule a tap further.
   A rule-breaker keeps its amber stroke, so what does not follow the pattern
   is still the first thing seen. */
/* One fact's note, and its rule a tap further, over a dimmed screen.
   `onLeave` closes whatever sheet the fact sits in (the word sheet, the
   bulb's reference): the rule opens as a screen, and a sheet left open stays
   drawn over it. */
export function FactBubble({ fact, onClose, onLeave }) {
  const t = useTheme();
  return (
    <Bubble testID="fact-bubble" title={fact.label} onClose={onClose}
            footer={fact.ref ? (
              <Btn kind="link" testID="fact-rule" label="Read the rule" style={{ marginTop: 10 }}
                   onPress={() => { onClose(); if (onLeave) onLeave(); openRule(fact.ref); }} />
            ) : null}>
      <Note text={fact.note} color={t.ink2} size={T.body} gap={4} />
    </Bubble>
  );
}

/* What breaks the rules about a word, each with its one line (core/facts.js
   `irregularities`): «ребёнок» → «дети», «хотеть»'s mixed endings. The
   owner, 2026-10-05: "the first time an irregular is introduced… point out
   what makes it irregular… in the full entries where it's flagged
   irregular, you can click that and it will say what's irregular". */
export function IrregularNotes({ word, testID = "irregular-notes", style }) {
  const t = useTheme();
  const ir = word ? irregularities(word) : [];
  if (!ir.length) return null;
  return (
    <View testID={testID} style={[{ gap: 6 }, style]}>
      {ir.map((x) => (
        <View key={x.kind + x.label} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
          <Warn />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: T.small, fontWeight: "700" }}>{x.label}</Text>
            <Marked text={x.note} size={T.small} />
          </View>
        </View>
      ))}
    </View>
  );
}

/* The warning mark: a red circle with "!" — "something here breaks the
   pattern" (the owner: "a red exclamation point in a circle is a warning for
   anything that deviates from the norm"). */
function Warn({ size = 18 }) {
  const t = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.bad,
                   alignItems: "center", justifyContent: "center", marginTop: 1 }}>
      <Text style={{ color: t.badOn, fontSize: size * 0.7, fontWeight: "700", lineHeight: size }}>!</Text>
    </View>
  );
}

/* The "Irregular" tag, wherever a word is shown: the mark and the word, and a
   tap opens what is irregular about it. Draws nothing for a regular word. */
export function IrregularTag({ word, testID = "irregular" }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  if (!word || !irregularities(word).length) return null;
  return (
    <>
      <Pressable testID={testID} onPress={() => setOpen(true)} hitSlop={6}
                 accessibilityRole="button" accessibilityLabel="Irregular, what is irregular"
                 style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 5,
                   borderWidth: 1.5, borderColor: t.warn, borderRadius: 99, backgroundColor: t.surface,
                   paddingLeft: 3, paddingRight: 9, paddingVertical: 2, opacity: pressed ? 0.6 : 1 })}>
        <Warn size={16} />
        <Text style={{ color: t.ink, fontSize: 12, fontWeight: "700",
                       textDecorationLine: "underline", textDecorationStyle: "dotted" }}>Irregular</Text>
      </Pressable>
      <Bubble visible={open} onClose={() => setOpen(false)} title={word.w} testID={`${testID}-bubble`}>
        <IrregularNotes word={word} />
      </Bubble>
    </>
  );
}

export function Facts({ facts, testID, onLeave }) {
  const [open, setOpen] = useState(null);
  if (!facts || !facts.length) return null;
  const f = open !== null ? facts[open] : null;
  return (
    <View testID={testID} style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {facts.map((x, k) => (
        <Flag key={k} tone={x.irregular ? "irregular" : "form"} onPress={() => setOpen(k)}
              testID={x.irregular ? `${testID || "facts"}-irregular` : `fact-${x.label}`}>
          {x.label}
        </Flag>
      ))}
      {f ? <FactBubble fact={f} onClose={() => setOpen(null)} onLeave={onLeave} /> : null}
    </View>
  );
}

/* The bulb's sheet — the word and its tables, the asked one open and its cell
 * marked. Nothing is withheld (§30az), and nothing else is added (the owner,
 * 2026-10-08: *"Just show the reference conjugation chart. The rest is too
 * busy"*): the facts, the rule card and the topic link it used to carry went. */
export function Reference({ title, sub, tables, mark, onClose, aspect }) {
  const t = useTheme();
  return (
    <Sheet onClose={onClose} title="Reference"
           footer={<Btn block kind="pri" label="Got it" style={{ marginTop: 14 }} onPress={onClose} />}>
      {title ? (
        <View style={{ marginBottom: 4 }}>
          <Text style={{ color: t.ink, fontSize: T.title, fontWeight: "700" }}>{title}</Text>
          {sub ? <Muted>{sub}</Muted> : null}
        </View>
      ) : null}
      {/* The table the question is about opens; the word's others are a tap
          away rather than stacked under it. */}
      <TableGroup tables={tables} speak mark={mark} testID="ref-table" aspect={aspect} headword={title}
                  open={[Math.max(0, (tables || []).indexOf(mark && mark.table))]} />
    </Sheet>
  );
}

/* Is there a chart behind the bulb for this question? Exported so the runner
   draws the control only where it leads somewhere, and so a test can ask the
   question without mounting a sheet. */
export function hasReference({ tables }) {
  return !!(tables && tables.length);
}
