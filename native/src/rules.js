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
import { View, ScrollView } from "react-native";
import { useTheme, type as T } from "./theme";
import { Text, Card, Muted, Note, Speaker, Sheet, Btn, SectionLabel } from "./ui";
import { Linked } from "./words";
import { fold } from "@core/util";

/* A column is wide enough for a long inflected form and no wider: at 110 a
   three-column table fits a 390 px screen without scrolling, which is most of
   them, and the rest scroll sideways rather than wrapping. */
const COL = 110;
/* Cyrillic runs, stress marks included — the same shape as core/util's TOKEN,
   used here only to read an example word by word. */
const TOKENS = /[Ѐ-ӿ̀́]+/g;

/* One paradigm or reference table.
 *
 * `blank` is [row, column] — the cell the question is asking for. `hide` is
 * the answer itself, and blanks *any* cell holding it: a paradigm repeats
 * (an inanimate accusative is its nominative) and a verb's three tables are
 * shown together, so blanking one cell by position would have left the same
 * form printed two rows down. Both are needed — the asked cell is blanked
 * even where it holds something else, and the answer is hidden wherever it
 * turns up.
 *
 * A blanked cell is a dash in the brand colour rather than nothing: an empty
 * cell reads as missing data, and this one is missing on purpose. */
export function Table({ table, blank, hide, testID }) {
  const t = useTheme();
  const [br, bc] = blank || [];
  const hidden = hide ? fold(String(hide)) : null;
  const holds = (cell) => hidden !== null && (Array.isArray(cell) ? cell : [cell])
    .some((f) => f !== undefined && f !== null && fold(String(f)) === hidden);
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
                const gone = (ri === br && ci === bc) || holds(cell);
                return (
                  <Text key={ci}
                        testID={gone ? "table-blank" : undefined}
                        style={{ width: COL, paddingVertical: 6,
                                 fontSize: ci === 0 ? T.small : T.body,
                                 fontWeight: gone ? "700" : "400",
                                 color: gone ? t.brand : ci === 0 ? t.ink3 : t.ink }}>
                    {gone ? "—" : Array.isArray(cell) ? cell.join(" / ") : cell}
                  </Text>
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
export function RuleCard({ note, tone, hide, testID, style }) {
  const t = useTheme();
  const brand = tone === "brand";
  const body = (
    <>
      <Text style={{ color: t.ink, fontSize: brand ? T.title : T.head, fontWeight: "700" }}>
        {note.title}
      </Text>
      <Note text={note.body} color={t.ink2} style={{ marginTop: 6 }} />
      <Examples examples={note.examples} hide={hide}
                line={brand ? t.brandDim : t.lineSoft} />
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
export function Examples({ examples, hide, line }) {
  const t = useTheme();
  /* A rule's examples are real Russian, and `conjugationNote` builds its
     examples out of the verb's own paradigm with the asked row first — so
     inside the reference sheet the answer was the first thing printed under
     the blanked table. An example that says it is dropped rather than
     redacted: a sentence with a dash in the middle of it teaches nothing. */
  const shown = hide
    ? examples.filter(([ru]) => !(String(ru).match(TOKENS) || [])
        .some((w) => fold(w) === fold(String(hide))))
    : examples;
  if (!shown || !shown.length) return null;
  return (
    <>
      {shown.map(([ru, en], k) => (
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

/* The bulb's sheet.
 *
 * What it may show is decided by the question, not by the screen: `tables` are
 * the word's own paradigms with `blank` applied, `note` is the rule behind the
 * question, and `topic` is the reference page for the whole subject. Any of
 * the three may be absent; the sheet is only offered when at least one is
 * there (`hasReference` below), because a bulb that opens on nothing is worse
 * than no bulb. */
export function Reference({ title, sub, tables, blank, hide, note, topic, onTopic, onClose }) {
  const t = useTheme();
  return (
    <Sheet onClose={onClose} title="Reference"
           footer={<Btn kind="pri" label="Got it" style={{ marginTop: 14 }} onPress={onClose} />}>
      {/* The headword names the sheet — unless it *is* the answer, which
          happens when the form asked for is the dictionary form (an
          adjective's masculine nominative). The word is on the question
          screen behind this anyway, so dropping it here costs nothing and
          keeps "the reference never prints the answer" literally true. */}
      {title && !(hide && fold(String(title)) === fold(String(hide))) ? (
        <View style={{ marginBottom: 4 }}>
          <Text style={{ color: t.ink, fontSize: T.title, fontWeight: "700" }}>{title}</Text>
          {sub ? <Muted>{sub}</Muted> : null}
        </View>
      ) : null}
      {(tables || []).map((tb, k) => (
        <Table key={k} table={tb} testID={`ref-table-${k}`} hide={hide}
               blank={blank && blank.table === tb ? blank.at : null} />
      ))}
      {note ? (
        <View style={{ marginTop: tables && tables.length ? 20 : 0 }}>
          <RuleCard note={note} hide={hide} testID="ref-rule" />
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
export function hasReference({ tables, note, topic }) {
  return !!((tables && tables.length) || note || topic);
}
