/* Form cards: flashcards for forms and conjugations (the owner, 2026-11-12:
 * *"let's also add a drill that is just flashcards for forms/conjugations. It
 * can be in the practice section. It would just give the word and what
 * form/tense/person it wants"*).
 *
 * The front is a word and the cell asked for — «кни́га», *genitive plural*;
 * «чита́ть», *present for «они»*; «___ среду», *the form that agrees* — and
 * the back is the form, said aloud, with the word's table open at that cell.
 * The learner grades themselves, as on a flashcard: Again, Hard, Good, Easy.
 *
 * The questions are the grammar drills' own, written (core/questions.js
 * drillQuestions with `typed`), so a card asks exactly what the drill would
 * have asked and a wrong cell cannot be invented here. What a card grades is
 * the word's **"Cases & forms" score alone** (core/scheduler.js gradeSkill,
 * §30by): knowing «книгу» is the accusative says nothing about remembering
 * what «книга» means, so the word's card and its schedule are untouched.
 * Nothing is recorded as a best score — the skill slot is the record.
 *
 * Behind the cog: which kinds (cases, conjugation, agreement, aspect) and
 * where the words come from ("Your words" at familiarity 40+, data.js
 * knownPool, or whole chapters), kept in `st.drillPrefs.formcards`.
 */

import React, { useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useSession } from "../session";
import { useTheme, radius, type as T } from "../theme";
import { Screen, Btn, List, Row, SectionLabel, Chip, Tick, Text, Muted, Sheet, CogButton, Loading,
         RowText, Lift, toneOf, Speaker, Pill } from "../ui";
import { Table } from "../rules";
import { Done, useAudioStopOnLeave } from "../screens/Run";
import { Q, DRILL_TYPES } from "../questions";
import { L, STAGES, chapterWords, knownPool, skillWeight } from "../data";
import { gradeSkill, schedulerOpts } from "@core/scheduler";
import { shuffle } from "@core/util";

/* The drills whose written question is a form of the word asked. Stress is
   not one: where the mark falls is not a cell of a table. */
export const FORM_CARD_KINDS = DRILL_TYPES.filter((d) => d.id !== "stress").map((d) => d.id);
/* Cards in a run: a dozen, a sitting. */
export const FORM_CARDS_N = 12;
/* The score a card's grade moves. */
export const FORM_SKILL = "forms";

/* What the front asks for, read off the drill's own question: "Write genitive
   plural" → "genitive plural"; "Write the present for “они”" → "present for
   “они”". */
export const askLabel = (q) => String((q && q.ask) || "").replace(/^Write (the )?/, "");

/* The deck: the written questions of the chosen kinds, in equal measure,
   shuffled. `pool` is lemma indices; a kind with nothing to ask of them
   contributes nothing, and an empty deck says so on screen. */
export function formDeck(kinds, pool, weight, n = FORM_CARDS_N) {
  const chosen = (kinds || []).filter((k) => FORM_CARD_KINDS.includes(k));
  const use = chosen.length ? chosen : FORM_CARD_KINDS;
  if (!pool || !pool.length) return [];
  const per = Math.ceil(n / use.length);
  const out = [];
  for (const k of use) {
    // Typed, with no narrowing: a card asks any cell the drill would.
    for (const q of Q.drillQuestions(k, per, pool, undefined, true, null, weight) || []) {
      if (q && q.typed && typeof q.i === "number" && q.answer) out.push(q);
    }
  }
  return shuffle(out).slice(0, n);
}

function FormCardOptions({ prefs, onChange, onClose }) {
  const kinds = prefs.kinds && prefs.kinds.length ? prefs.kinds : FORM_CARD_KINDS;
  const chapters = prefs.chapters || [];
  const toggle = (id) => {
    // The last tick cannot be removed: a deck of nothing is not a drill (§30ac).
    const next = kinds.includes(id) ? (kinds.length > 1 ? kinds.filter((x) => x !== id) : kinds) : kinds.concat([id]);
    onChange({ ...prefs, kinds: next.length === FORM_CARD_KINDS.length ? null : next });
  };
  const toggleChapter = (k) => onChange({
    ...prefs,
    chapters: chapters.includes(k) ? chapters.filter((x) => x !== k) : chapters.concat([k]).sort((a, b) => a - b),
  });
  return (
    <Sheet onClose={onClose} testID="formcards-options" maxHeight="88%"
           footer={<Btn block kind="pri" testID="formcards-apply" label="Apply" style={{ marginTop: 8 }} onPress={onClose} />}>
      <View style={{ marginBottom: 18 }}>
        <SectionLabel>Ask about</SectionLabel>
        <List>
          {DRILL_TYPES.filter((d) => FORM_CARD_KINDS.includes(d.id)).map((d) => (
            <Row key={d.id} testID={`formcards-kind-${d.id}`} onPress={() => toggle(d.id)}>
              <Tick on={kinds.includes(d.id)} />
              <RowText title={d.name} bold={false} />
            </Row>
          ))}
        </List>
      </View>
      <View style={{ marginBottom: 6 }}>
        <SectionLabel>Words from</SectionLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Chip testID="formcards-mine" on={!chapters.length} label="Your words"
                onPress={() => onChange({ ...prefs, chapters: [] })} />
          {STAGES.map((s, k) => (
            <Chip key={s.core.id} testID={`formcards-ch${k + 1}`} on={chapters.includes(k)}
                  label={`Ch ${k + 1}`} onPress={() => toggleChapter(k)} />
          ))}
        </View>
      </View>
    </Sheet>
  );
}

/* One card: the word and the cell asked on the front; the form, its speaker
   and the table on the back. */
function FormCard({ q, shown, onShow }) {
  const t = useTheme();
  const w = L[q.i];
  const gap = /_{2,}/.test(q.prompt || "");
  return (
    <View testID="formcard" style={{ borderWidth: 1, borderColor: t.lineSoft, borderRadius: radius.xl,
                                     backgroundColor: t.surface, padding: 20, marginTop: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text testID="formcard-word" style={{ flex: 1, color: t.ink, fontSize: T.display, fontWeight: "700" }}>{q.prompt}</Text>
        {!gap ? <Speaker text={w ? w.b : q.prompt} size={36} /> : null}
      </View>
      {q.sub ? <Muted testID="formcard-sub" size={T.small} style={{ marginTop: 4 }}>{q.sub}</Muted> : null}
      <View style={{ marginTop: 14, flexDirection: "row" }}>
        <Pill tone="brand" testID="formcard-ask">{askLabel(q)}</Pill>
      </View>
      {shown ? (
        <View testID="formcard-back" style={{ marginTop: 18, borderTopWidth: 1, borderTopColor: t.lineSoft, paddingTop: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text testID="formcard-answer" style={{ flex: 1, color: t.brandInk, fontSize: T.display, fontWeight: "700" }}>{q.answer}</Text>
            <Speaker text={q.answer} size={36} />
          </View>
          {q.alts && q.alts.length ? <Muted size={T.small} style={{ marginTop: 2 }}>{"also " + q.alts.join(", ")}</Muted> : null}
          {q.table ? (
            <View style={{ marginTop: 14 }}>
              <Table table={q.table} mark={q.at} narrow testID="formcard-table" headword={w ? w.w : undefined} />
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ marginTop: 18 }}>
          <Btn block kind="pri" testID="formcard-show" label="Show" onPress={onShow} />
        </View>
      )}
    </View>
  );
}

export function FormCardsFlow({ navigation }) {
  const { st, update, ready } = useSession();
  const t = useTheme();
  const prefs = (st.drillPrefs || {}).formcards || {};
  const setPrefs = (next) => update((p) => ({ ...p, drillPrefs: { ...(p.drillPrefs || {}), formcards: next } }));
  const [seed, setSeed] = useState(0);
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(false);
  const [held, setHeld] = useState(0);
  // Open on arrival, as a drill does (the owner, 2026-10-02): the ticks are
  // prefilled, so Apply untouched is the deck as it would have been.
  const [cog, setCog] = useState(true);
  const chapters = prefs.chapters || [];
  const kinds = prefs.kinds && prefs.kinds.length ? prefs.kinds : FORM_CARD_KINDS;
  useAudioStopOnLeave();

  const deck = useMemo(() => {
    if (!ready) return null;
    const pool = chapters.length ? chapterWords(chapters) : knownPool(st);
    return formDeck(kinds, pool, skillWeight(st, FORM_SKILL));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, seed, kinds.join(","), chapters.join(",")]);

  const before = useRef(JSON.stringify(prefs));
  const openCog = () => { before.current = JSON.stringify(prefs); setCog(true); };
  const closeCog = () => {
    setCog(false);
    if (JSON.stringify(prefs) !== before.current) { setAt(0); setShown(false); setHeld(0); setSeed(seed + 1); }
  };
  const again = () => { setAt(0); setShown(false); setHeld(0); setSeed(seed + 1); };
  const sheet = cog ? <FormCardOptions prefs={prefs} onChange={setPrefs} onClose={closeCog} /> : null;

  if (!deck) return <Screen><Loading /></Screen>;
  if (!deck.length) {
    return (
      <>
        <Done title={chapters.length ? "No forms to ask here" : "No words at 40 yet"}
              detail={chapters.length ? undefined : "Pick chapters in Options"}
              onBack={() => navigation.goBack()} onAgain={openCog} againLabel="Options" />
        {sheet}
      </>
    );
  }
  const q = deck[at];
  if (!q) {
    return (
      <>
        <Done title="Form cards" detail={`${held} of ${deck.length} known`}
              onAgain={again} againLabel="Again" onBack={() => navigation.goBack()} />
        {sheet}
      </>
    );
  }

  /* A grade moves the word's "Cases & forms" score and nothing else. */
  const grade = (g) => {
    const word = L[q.i] && L[q.i].b;
    if (word) {
      const now = Date.now();
      update((prev) => ({ ...prev, seen: gradeSkill(prev.seen, word, FORM_SKILL, g, now, schedulerOpts(prev)).seen }));
    }
    if (g >= 3) setHeld(held + 1);
    setShown(false);
    setAt(at + 1);
  };

  const controls = shown ? (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {[[1, "Again", "bad"], [2, "Hard", "plain"], [3, "Good", "good"], [4, "Easy", "pri"]].map(([g, label, kind]) => {
        const tone = toneOf(t, kind);
        const fill = kind === "plain" ? t.surface : tone.bg;
        const edge = kind === "plain" ? t.surface3 : tone.edge;
        return (
          <Lift key={g} testID={`formcard-grade-${g}`} fill={fill} edge={edge}
                border={kind === "plain" ? t.line : edge} r={radius.md}
                style={{ flex: 1 }} onPress={() => grade(g)}>
            <View style={{ alignItems: "center", paddingVertical: 13 }}>
              <Text style={{ fontWeight: "700", fontSize: T.small, color: tone.fg }}>{label}</Text>
            </View>
          </Lift>
        );
      })}
    </View>
  ) : null;

  return (
    <>
      <Screen footer={controls}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <RowText testID="formcards-progress" title={`${at + 1} / ${deck.length}`} bold={false} />
          <CogButton testID="formcards-cog" onPress={openCog} label="Form card options" />
        </View>
        <FormCard key={`${seed}:${at}`} q={q} shown={shown} onShow={() => setShown(true)} />
        <Muted size={T.tiny} style={{ marginTop: 10, textAlign: "center" }}>{`${held} known`}</Muted>
      </Screen>
      {sheet}
    </>
  );
}
