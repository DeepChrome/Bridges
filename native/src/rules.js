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
import { Text, Card, Muted, Note, Speaker, Sheet, Btn, SectionLabel, useRussianVoice, Marked } from "./ui";
import { Linked } from "./words";
import { say, hasRealAudio } from "./audio";
/* The form table is 9,579 asset requires. Loaded on the first table that
   speaks, not at boot: most sessions never open one, and in jest the first
   load reads every clip file for its cache key (seconds, not milliseconds). */
let forms = null;
const formClip = (form) => {
  if (!forms) forms = require("./formaudio");
  return forms.formClip(form);
};

/* A column is wide enough for a long inflected form and no wider: at 110 a
   three-column table fits a 390 px screen without scrolling, which is most of
   them, and the rest scroll sideways rather than wrapping. */
const COL = 110;

/* One form in a table, which says itself when pressed (the owner,
 * 2026-09-28: *"an audio button next to every pronunciation of a word so I can
 * hear how the word is said in all forms"*).
 *
 * **A recording of this exact form where one was bought, and the device voice
 * with the stress mark where none safely could be** (ROADMAP 13.42, bought
 * 2026-09-28). The word bundle is keyed by the *folded* spelling and cannot be
 * used here: for a spelling two stresses share («руки́» / «ру́ки») it would
 * play whichever word its clip was bought for, the wrong stress half the time,
 * on the one control whose purpose is hearing where the stress falls. So forms
 * have their own manifest, keyed by the accented form, and the spellings with
 * two stresses were never bought — those, about 3 % of the table, are the
 * phone's voice reading the mark, and the label says so (§27).
 *
 * The whole cell is the target, with a small glyph beside the form: a 40 px
 * round speaker in every cell would push a three-column table past the width
 * of a phone. */
export function FormSpeaker({ form, style, testID, children, device = true }) {
  const t = useTheme();
  const voice = useRussianVoice();
  /* First the form's own recording, looked up by its **accented** spelling
     (formaudio.js, ROADMAP 13.42) — bought for every form whose spelling has
     one stress, and deliberately absent for the ones with two, which is what
     makes it safe to play. Then, with `device={false}`, any recording of the
     spelling at all — right for a word shown on its own (the endings'
     examples), where there is no second stress to confuse it with. Otherwise
     the phone's voice, with the stress mark. The glyph takes the brand colour
     for a recording, as `Speaker`'s ring does, so a recording and the phone's
     voice never look alike (§27). */
  const clip = formClip(form);
  const real = !!clip || (!device && hasRealAudio(form));
  const live = real || voice;
  const play = () => (clip ? say(form, { clip })
    : real ? say(form) : say(form, { device: true, stress: true }));
  return (
    <Pressable testID={testID}
               onPress={live ? play : undefined}
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
export function Table({ table, mark, speak, testID, bare }) {
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
                {ci === 0 ? "" : c}
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

/* A word's tables as sections that open and close (2026-09-28).
 *
 * A verb's entry was three full grids one after another — present, past,
 * imperative — and a noun's twelve-cell declension sat above everything that
 * came after it. Each table is a row now, its name and a chevron, and `open`
 * says which start open: the first on an entry, the one the question is about
 * in the bulb's sheet. The learner opens the rest when they want them. */
export function TableGroup({ tables, speak, mark, open = [0], testID = "tables" }) {
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
                       accessibilityLabel={tb.title}
                       style={({ pressed }) => ({ flexDirection: "row", alignItems: "center",
                         minHeight: 44, opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ flex: 1, color: t.ink, fontSize: T.body, fontWeight: "700" }}>{tb.title}</Text>
              <Text style={{ color: t.ink3, fontSize: T.body }}>{on ? "▾" : "▸"}</Text>
            </Pressable>
            {on ? (
              <Table table={tb} speak={speak} bare testID={`${testID}-${k}`}
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
        <View key={k} testID={f.irregular ? `${testID || "facts"}-irregular` : undefined}
              style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
          {/* A rule-breaker is drawn apart (2026-09-29): an amber edge — the
              `warn` token is audited as a stroke, not as text — around ink,
              so what does not follow the pattern is the first thing seen. */}
          <View style={{ backgroundColor: f.irregular ? t.surface : t.brandBg,
                         borderColor: f.irregular ? t.warn : t.brandDim, borderWidth: f.irregular ? 2 : 1,
                         borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3,
                         minWidth: 92 }}>
            <Text style={{ color: f.irregular ? t.ink : t.brandInk, fontSize: T.tiny, fontWeight: "700",
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

/* The explanation a wrong answer gets without the model (core/explain.js):
 * which form the answer is, the facts that decide it — what breaks the rules
 * first — and the two references it leans on: the grammar section that states
 * the rule, and the word's own entry. Organised as those parts and nothing
 * more (the owner, 2026-09-29: "keep it organized… rely on references"). */
export function StandardWhy({ ex, onRule, onWord, testID = "standard-why" }) {
  const t = useTheme();
  if (!ex) return null;
  return (
    <View testID={testID}>
      {ex.what ? <Marked testID={`${testID}-what`} text={ex.what} size={T.body - 1} color={t.ink} /> : null}
      <Facts facts={ex.why} testID={`${testID}-facts`} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 10 }}>
        {ex.rule && onRule ? (
          <Btn kind="link" testID={`${testID}-rule`} label={`Rule: ${ex.rule.heading}`}
               onPress={() => onRule(ex.rule)} />
        ) : null}
        {onWord ? (
          <Btn kind="link" testID={`${testID}-word`} label="The full entry" onPress={onWord} />
        ) : null}
      </View>
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
      {/* The table the question is about opens; the word's others are a tap
          away rather than stacked under it. */}
      <TableGroup tables={tables} speak mark={mark} testID="ref-table"
                  open={[Math.max(0, (tables || []).indexOf(mark && mark.table))]} />
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
