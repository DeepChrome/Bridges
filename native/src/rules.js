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
 * specific skill, make sure there's a lightbulb available… it doesn't reveal
 * the answer, but it reveals the reference for the different verb forms for
 * that word"*). `Reference` is that sheet: every table the word has, with the
 * one cell the question is asking for left blank, then the rule behind the
 * question, then a way into the grammar reference for the whole topic.
 *
 * Blanking is what makes it a reference rather than an answer key, and it is
 * the generator that says which cell to blank (`at` on the question), because
 * only the generator knows. A question with no `at` is one whose answer is not
 * in a table at all, and the whole paradigm is safe to show.
 */

import React from "react";
import { View, ScrollView, Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme, radius, type as T } from "./theme";
import { Text, Card, Muted, Note, Speaker, Sheet, Btn, SectionLabel, useRussianVoice } from "./ui";
import { Linked } from "./words";
import { say, hasRealAudio } from "./audio";

/* A column is wide enough for a long inflected form and no wider: at 110 a
   three-column table fits a 390 px screen without scrolling, which is most of
   them, and the rest scroll sideways rather than wrapping. */
const COL = 110;

/* One form in a table, which says itself when pressed (the owner,
 * 2026-09-28: *"an audio button next to every pronunciation of a word so I can
 * hear how the word is said in all forms"*).
 *
 * **The device voice, deliberately, with the stress mark kept.** Two reasons,
 * both measured before this was written:
 *   - Of the 9,885 forms the unit words' tables show, 730 have a recording,
 *     and those are keyed by the *folded* spelling — so for the 172 spellings
 *     two stresses share («руки́» / «ру́ки»), the bundle would play whichever
 *     word the clip was bought for, the wrong stress for half of them, on the
 *     one control whose whole purpose is hearing where the stress falls.
 *   - A table where one cell is a studio voice and eleven are the phone is two
 *     people reading one paradigm (§30ai's "one voice" argument).
 * Recordings for every form cost about $2–3 and ~50 MB of app, and are the
 * owner's call; this is what the table does until then, and the label says
 * which voice it is (§27).
 *
 * The whole cell is the target, with a small glyph beside the form: a 40 px
 * round speaker in every cell would push a three-column table past the width
 * of a phone. */
export function FormSpeaker({ form, style, testID, children, device = true }) {
  const t = useTheme();
  const voice = useRussianVoice();
  /* `device={false}` lets a recording play where one exists — right for a
     word shown on its own (the endings' examples), where there is no
     neighbouring cell to clash with and no second stress to confuse it with.
     The glyph takes the brand colour then, as `Speaker`'s ring does, so a
     recording and the phone's voice never look alike (§27). */
  const real = !device && hasRealAudio(form);
  const live = real || voice;
  return (
    <Pressable testID={testID}
               onPress={live ? () => say(form, device ? { device: true, stress: true } : {}) : undefined}
               accessibilityRole="button"
               accessibilityLabel={real ? `Hear ${form}` : voice ? `Hear ${form} (device voice)` : undefined}
               // 36 tall plus 4 either side: the 44 a finger needs (rule 20.12)
               // without making every row of a twelve-row table that tall.
               hitSlop={4}
               style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 4,
                                          opacity: pressed ? 0.55 : 1 }, style]}>
      {children}
      {live ? (
        <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={real ? t.brandInk : t.ink3}
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
export function Table({ table, mark, speak, testID }) {
  const t = useTheme();
  const [br, bc] = mark || [];
  return (
    <View testID={testID} style={{ marginTop: 14 }}>
      {table.title ? <SectionLabel>{table.title}</SectionLabel> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={{ flexDirection: "row" }}>
            {table.columns.map((c, ci) => (
              <Text key={c + ci}
                    style={{ width: COL, color: t.ink3, fontSize: T.tiny, fontWeight: "700",
                             textTransform: "uppercase", letterSpacing: 0.6, paddingVertical: 6 }}>
                {c}
              </Text>
            ))}
          </View>
          {table.rows.map((r, ri) => (
            <View key={ri} testID={testID ? `${testID}-row-${ri}` : undefined}
                  style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: t.lineSoft }}>
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
                      <FormSpeaker key={fi} form={f} testID={`say-${ri}-${ci}-${fi}`}
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
      <Text style={{ color: t.ink, fontSize: brand ? T.title : T.head, fontWeight: "700" }}>
        {note.title}
      </Text>
      <Note text={note.body} color={t.ink2} style={{ marginTop: 6 }} />
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
    <View testID={testID} style={{ marginTop: 22 }}>
      <Text style={{ color: t.ink, fontSize: T.head, fontWeight: "700" }}>
        {section.heading}
      </Text>
      <Note text={section.rule} color={t.ink2} style={{ marginTop: 4 }} />
      {section.uses ? (
        <View style={{ marginTop: 10, gap: 6 }}>
          {section.uses.map((u, k) => (
            <View key={k} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
              <Text style={{ color: t.brand, fontSize: T.body, fontWeight: "800",
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
          <Muted size={T.tiny} style={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
            {unit.name}
          </Muted>
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
export function Facts({ facts, testID }) {
  const t = useTheme();
  if (!facts || !facts.length) return null;
  return (
    <View testID={testID} style={{ marginTop: 12, gap: 10 }}>
      {facts.map((f, k) => (
        <View key={k} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
          <View style={{ backgroundColor: t.brandBg, borderColor: t.brandDim, borderWidth: 1,
                         borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3,
                         minWidth: 92 }}>
            <Text style={{ color: t.brandInk, fontSize: T.tiny, fontWeight: "700",
                           textTransform: "uppercase", letterSpacing: 0.5 }}>
              {f.label}
            </Text>
          </View>
          <Note text={f.note} color={t.ink2} size={T.small + 1} style={{ flex: 1 }} gap={4} />
        </View>
      ))}
    </View>
  );
}

/* The bulb's sheet — the word, what is true about it, its paradigms whole,
 * the rule behind the question, and the way into the reference for the whole
 * topic. In that order, because "feminine, hard stem" is what makes the table
 * underneath it readable rather than a grid to memorise.
 *
 * Nothing is withheld (§30az). Any part may be absent; the sheet is only
 * offered when at least one is there (`hasReference`), because a bulb that
 * opens on nothing is worse than no bulb. */
export function Reference({ title, sub, tables, mark, facts, note, topic, onTopic, onClose }) {
  const t = useTheme();
  return (
    <Sheet onClose={onClose} title="Reference"
           footer={<Btn kind="pri" label="Got it" style={{ marginTop: 14 }} onPress={onClose} />}>
      {title ? (
        <View style={{ marginBottom: 4 }}>
          <Text style={{ color: t.ink, fontSize: T.title, fontWeight: "700" }}>{title}</Text>
          {sub ? <Muted>{sub}</Muted> : null}
        </View>
      ) : null}
      <Facts facts={facts} testID="ref-facts" />
      {(tables || []).map((tb, k) => (
        <Table key={k} table={tb} testID={`ref-table-${k}`} speak
               mark={mark && mark.table === tb ? mark.at : null} />
      ))}
      {note ? (
        <View style={{ marginTop: tables && tables.length ? 20 : 0 }}>
          <RuleCard note={note} testID="ref-rule" />
        </View>
      ) : null}
      {topic ? (
        <Btn kind="ghost" testID="ref-topic" label={`More on ${topic.title.toLowerCase()}`}
             style={{ marginTop: 16, alignSelf: "flex-start" }}
             onPress={() => { onClose(); onTopic(topic.id); }} />
      ) : null}
    </Sheet>
  );
}

/* Is there anything behind the bulb for this question? Exported so the runner
   draws the control only where it leads somewhere, and so a test can ask the
   question without mounting a sheet. */
export function hasReference({ tables, facts, note, topic }) {
  return !!((tables && tables.length) || (facts && facts.length) || note || topic);
}
