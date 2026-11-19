/* The practice drills: shadowing, the minimal pairs, word building, the grammar
 * drills behind their cog, and a chapter's grammar run. */

import React, { useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useSession } from "../session";
import { useTheme, type as T } from "../theme";
import { Screen, Btn, List, Text, Sheet, Loading, OptionRow, ToggleRow } from "../ui";
import { useHeaderOptions } from "../headermenu";
import { Runner, Done, useAudioStopOnLeave } from "../screens/Run";
import { clearRun, savedRun, useResume } from "../resume";
import { Q, DRILL_TYPES, wordDrillSpec } from "../questions";
import { wordIndex } from "../worddrills";
import {
  L, UN, STAGES, DRILL_PASS, SHADOW_PASS, drillPool,
  chapterWords, irregularWords, knownPool, skillWeight,
  reachedUnits, grammarKey,
} from "../data";
import { pairDrill } from "@core/alphabet";
import { skillOfKind } from "@core/skills";
import { buildupDrill } from "@core/buildup";
import { firstSense } from "@core/util";
import { scoreOf, bestOf } from "./shared";

/* Pairs in one run of the pronunciation drill: five heard and five said, which
   is about a minute and a half and does not outstay a contrast. */
export const SOUND_DRILL_N = 10;

/* The drills whose words can break the rules in a way the drill asks about:
   a verb's conjugation and its aspect partner, a noun's cases. */
export const IRREGULAR_DRILLS = ["conjugation", "aspect", "cases"];

/* Words in one build-up run. Six, because each is four or five repetitions of
   the same mouth shape and the value is in doing them properly rather than in
   getting through a list. */
export const BUILD_DRILL_N = 6;

/* Sentences in a shadowing run. Fewer than a quiz: each one is a recording, a
   hold, a wait for the recogniser and usually a second go. */
export const SHADOW_N = 6;

/* ---------------------------------------------------------------- shadowing */

/* Hear a sentence, say it back (ROADMAP P10.6). Drawn from the speak pool, so
   every sentence has a real recording — shadowing a device voice would be
   shadowing a robot's rhythm, which is the one thing the exercise is for. */
export function ShadowFlow({ navigation }) {
  const { st } = useSession();
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  const units = useMemo(() => reachedUnits(st), [seed]);
  /* The whole route as well, so a thin pool can be widened along it
     (`shadowDrill`): chapter 1 carries 29 sentences and six a run out of
     twenty-nine is the same six every sitting. */
  const steps = useMemo(() => Q.shadowDrill(units, SHADOW_N, UN), [units, seed]);
  useAudioStopOnLeave();

  if (!steps.length) {
    return <Done title="Nothing to shadow yet"
                 detail="Come back after a lesson or two."
                 onBack={() => navigation.goBack()} />;
  }
  if (result) {
    return (
      <Done title="Shadowing"
            detail={`${result.right} of ${result.total} clean`}
            score={scoreOf(result)} passed={scoreOf(result) >= SHADOW_PASS}
            onAgain={() => { setResult(null); setSeed(seed + 1); }}
            onBack={() => navigation.goBack()} />
    );
  }
  return (
    <Runner steps={steps} recycle={false} navigation={navigation}
            onFinish={(r) => setResult(r)} />
  );
}

/* ------------------------------------------------------ pronunciation drill */

/* Minimal pairs, heard and then said (ROADMAP P10.8). Reached from Sounds,
   which is the home of the writing system: a drill on the letters belongs with
   the letters rather than as a twelfth row on Practice (rule 20.8).

   Not scored out of a pass mark. A pronunciation attempt the recogniser did not
   catch is skipped rather than failed (see Pair.js), so a percentage here would
   be a percentage of however many attempts happened to be audible. */
export function SoundDrillFlow({ navigation }) {
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  const steps = useMemo(() => pairDrill(SOUND_DRILL_N), [seed]);
  useAudioStopOnLeave();

  if (result) {
    return (
      <Done
        title="Sounds"
        detail={result.total
          ? `${result.right} of ${result.total} caught`
          : "Nothing the phone could hear"}
        onAgain={() => { setResult(null); setSeed(seed + 1); }}
        againLabel="Again"
        onBack={() => navigation.goBack()}
      />
    );
  }
  return (
    <Runner steps={steps} recycle={false} navigation={navigation}
            onFinish={(r) => setResult(r)} />
  );
}

/* Word building (core/buildup.js): the long words the learner is actually
   studying, each said a syllable at a time. Drawn from `drillPool` like every
   other drill, so nobody is asked to pronounce a word they have not met.

   One question on the way in — should the phone listen? — and then it is not
   asked again (the owner, 2026-09-16). It is a choice and not a setting because
   it is a choice about *this run*: some days you are somewhere you can talk out
   loud and some days you are not. `listen` rides on each question rather than
   being read from state inside the activity, which keeps the activity a
   function of its question (registry.test.js). */
export function BuildDrillFlow({ navigation }) {
  const { st } = useSession();
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  const [listen, setListen] = useState(null);      // null until the question is answered
  const t = useTheme();
  const words = useMemo(
    () => drillPool(st).map((i) => ({ ru: L[i].w, en: firstSense(L[i]) })),
    [st.seen]);   // eslint-disable-line react-hooks/exhaustive-deps
  const steps = useMemo(() => buildupDrill(words, BUILD_DRILL_N, { listen: !!listen }),
                        [words, seed, listen]);
  useAudioStopOnLeave();

  if (result) {
    return (
      <Done
        title="Word building"
        detail={`${result.total} ${result.total === 1 ? "word" : "words"}`}
        onAgain={() => { setResult(null); setListen(null); setSeed(seed + 1); }}
        againLabel="Again"
        onBack={() => navigation.goBack()}
      />
    );
  }
  if (!buildupDrill(words, BUILD_DRILL_N).length) {
    return (
      <Done
        title="Word building"
        detail="No long words yet"
        onBack={() => navigation.goBack()}
      />
    );
  }
  if (listen === null) {
    /* Two buttons and the question, in the middle of the screen. Not a sheet:
       there is nothing behind it yet. */
    return (
      <Screen fill>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 }}>
          <Text style={{ color: t.ink, fontSize: T.title, fontWeight: "700", textAlign: "center" }}>
            Should the phone listen?
          </Text>
        </View>
        <Btn kind="pri" testID="build-listen-yes" label="Listen" onPress={() => setListen(true)} />
        <Btn kind="ghost" testID="build-listen-no" label="Just play it" style={{ marginTop: 8 }}
             onPress={() => setListen(false)} />
      </Screen>
    );
  }
  return (
    <Runner steps={steps} recycle={false} allowBack navigation={navigation}
            onFinish={(r) => setResult(r)} />
  );
}

/* ------------------------------------------------------------------ drills */

/* What a drill asks about and where its words come from, behind the cog on the
 * drill itself (the owner, 2026-09-26: *"for conjugations, you should be able
 * to select which areas to hit… for cases, you should be able to select each
 * case or all cases… for agreement, maybe you want to focus on irregulars… for
 * all of them, maybe you want to select which chapters"*). It replaced a setup
 * screen that stood in front of the drill (§30ac) and that he called ugly.
 *
 * Three things, each with the rule that keeps it honest:
 *
 *   - **Ask about** — the drill's focus ids (`drillFocus`): a tense or the
 *     reading question, the aspect shapes, each of the six cases, an
 *     adjective's stem class. Everything the route has reached is ticked to
 *     begin with (`defaultFocus`), so an untouched cog is exactly the drill as
 *     it was. **The last tick cannot be removed** — an empty selection is a
 *     drill with nothing to ask.
 *   - **Words from** — "Your words" (the learner's own at familiarity 40 or
 *     above, never widened — data.js knownPool) or any set of chapters. A chapter chosen is a
 *     chapter drawn on whole, quests included, and nothing widens it: the
 *     learner asked for chapter 3 and a run short of ten is what chapter 3 has.
 *   - **Answers** — written or chosen. One setting for every drill
 *     (`typedDrills`), here rather than in Settings, where it was never found.
 *
 * Kept per drill in `st.drillPrefs`, so the cog remembers what it was set to.
 * `null` for a field is "as before" and is what a profile that has never
 * opened the cog carries.
 */
/* Which words a drill draws on: the learner's own, or chapters chosen whole.
   One row chooses between the two and the chapters row shows under the
   second — the shape the Study options have (studypicker.js), so an options
   sheet is the same thing wherever it opens (the owner, 2026-11-19: "that's
   the theme that we need to work towards throughout the entire app"). Shared
   with the form cards. `chapters` are chapter indices; empty is "your words". */
export const WORD_SOURCES = [{ id: "mine", name: "Your words", sub: "Held at 25 or above" },
                             { id: "chapters", name: "Chapters", sub: "Chosen whole" }];
export function WordSourceRows({ chapters, onChange, prefix }) {
  const [fromChapters, setFromChapters] = useState(chapters.length > 0);
  const pick = (id) => { setFromChapters(id === "chapters"); if (id === "mine") onChange([]); };
  return (
    <>
      <OptionRow testID={`${prefix}-words`} title="Words from" value={fromChapters ? "chapters" : "mine"}
                 options={WORD_SOURCES} onPick={pick} />
      {fromChapters ? (
        <OptionRow testID={`${prefix}-chapters`} title="Chapters" multi value={chapters.map(String)}
                   valueText={chapters.length ? chapters.map((k) => k + 1).join(", ") : "None"}
                   options={STAGES.map((s, k) => ({ id: String(k), name: `Chapter ${k + 1}`, sub: s.title || undefined }))}
                   onPick={(ids) => onChange(ids.map(Number).sort((a, b) => a - b))} />
      ) : null}
    </>
  );
}

export function DrillOptions({ type, prefs, onChange, onClose }) {
  const { st, update } = useSession();
  const options = useMemo(() => Q.drillFocus(type), [type]);
  const suggested = useMemo(() => Q.defaultFocus(type, reachedUnits(st)), [type]);
  const on = prefs.only || suggested || options.map((o) => o.id);
  const chapters = prefs.chapters || [];
  const typed = st.typedDrills !== false;

  /* Everything ticked is no filter, and saying so keeps the generators on
     their ordinary path rather than through a set that matches everything.
     The cases and the stem classes are two rows over one list of ticks. */
  const main = options.filter((o) => !o.group);
  const stem = options.filter((o) => o.group === "stem");
  const pickFrom = (list) => (ids) => {
    const rest = on.filter((id) => !list.some((o) => o.id === id));
    const next = options.map((o) => o.id).filter((id) => ids.includes(id) || rest.includes(id));
    onChange({ ...prefs, only: next.length === options.length ? null : next });
  };

  return (
    <Sheet onClose={onClose} testID="drill-options" title="Drill options" maxHeight="88%"
           footer={<Btn block kind="pri" testID="drill-apply" label="Apply" style={{ marginTop: 8 }} onPress={onClose} />}>
      <List>
        {main.length > 1 ? (
          <OptionRow testID="focus" title="Ask about" multi minOne value={on.filter((id) => main.some((o) => o.id === id))}
                     options={main} onPick={pickFrom(main)} />
        ) : null}
        {stem.length > 1 ? (
          <OptionRow testID="stem" title="Stem" multi minOne value={on.filter((id) => stem.some((o) => o.id === id))}
                     options={stem} onPick={pickFrom(stem)} />
        ) : null}
        {/* The words that break the rules, on their own (the owner, 2026-09-29:
            "have options to drill them specifically"). Only where the drill's
            words have any: verbs for conjugation and aspect, nouns for cases. */}
        {IRREGULAR_DRILLS.includes(type) ? (
          <ToggleRow testID="irregular-only" title="Irregular words only" value={!!prefs.irregular}
                     onValueChange={(v) => onChange({ ...prefs, irregular: v })} />
        ) : null}
        <WordSourceRows prefix="drill" chapters={chapters} onChange={(c) => onChange({ ...prefs, chapters: c })} />
        <OptionRow testID="drill-answers" title="Answers" value={typed ? "written" : "chosen"}
                   options={[{ id: "written", name: "Written" }, { id: "chosen", name: "Multiple choice" }]}
                   onPick={(id) => update((p) => ({ ...p, typedDrills: id === "written" }))} />
      </List>
    </Sheet>
  );
}

export function DrillFlow({ route, navigation }) {
  const { type } = route.params;
  /* `all`: every focus in play and straight in, no options first — what "All
     the forms" under the cases means (the owner, 2026-10-08: "if they press
     that, the exercise should just start and assume all cases are in play").
     It opened the options ticked for the route, which read as the button not
     doing anything. The cog still changes it from there. */
  const [all, setAll] = useState(!!route.params.all);
  const { st, update, ready } = useSession();
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  /* Open on arrival (the owner, 2026-10-02: "when a user selects an exercise
     or drill, they should be confronted with the settings/config that is pre
     populated based on where they're at"): the ticks are the route's own, so
     closing it untouched is the drill as it would have been. */
  const [cog, setCog] = useState(() => !all && !savedRun(`drill:${type}`));
  const prefs = (st.drillPrefs || {})[type] || {};
  const setPrefs = (next) => update((p) => ({ ...p, drillPrefs: { ...(p.drillPrefs || {}), [type]: next } }));
  /* Written or chosen (the owner, 2026-09-11: *"fill in the blank allows the
     user to generate it completely rather than guess"*). On unless turned off,
     because that is §30j's own finding — recognition meets a word, production
     keeps it — and every drill question used to be four options. */
  const typed = st.typedDrills !== false;
  /* What the cog says to ask about: the learner's ticks, else the cases the
     route has taught (which used to be the `cells` gate, §30i), else
     everything. A cases drill before chapter 4 therefore asks all six cases
     rather than saying "not yet" — nothing in Practice is locked (§30au). */
  const only = useMemo(() => (all ? null : prefs.only || Q.defaultFocus(type, reachedUnits(st))),
                       [type, prefs.only, all]);
  const chapters = prefs.chapters || [];

  /* "Rule-breakers only" (2026-09-29) narrows the pool to the words that break
     the rules (data.js irregularWords). */
  const irregularOnly = !!prefs.irregular && IRREGULAR_DRILLS.includes(type);
  /* "Your words" are the words held at familiarity 40 or above
     (data.js knownPool), and nothing widens them (2026-10-08). It used to
     step along the route to the whole curriculum until a run filled, which
     is how unmet words kept arriving under "Your words". Chapters chosen on
     the cog draw on those chapters whole, as before. */
  /* Dealt once the profile has loaded: dealt from the store's defaults, the
     known words were none and the run stayed empty (the old widening hid it). */
  const steps = useMemo(() => {
    if (!ready) return null;
    const odd = irregularOnly ? new Set(irregularWords()) : null;
    const narrow = (pool) => (odd ? pool.filter((i) => odd.has(i)) : pool);
    const pool = narrow(chapters.length ? chapterWords(chapters) : knownPool(st));
    // An empty pool means "anything" to the generators (withPool), which is
    // exactly the random words this must not ask; empty is no questions.
    if (!pool.length) return [];
    // The words whose skill this drill measures is weakest come up most
    // (data.js skillWeight) — the scores feeding the drills (2026-10-29).
    const skill = skillOfKind(type);
    return Q.drillQuestions(type, undefined, pool, undefined, typed, only, skill ? skillWeight(st, skill) : undefined);
  }, [type, seed, typed, only, chapters.join(","), irregularOnly, ready]);
  const mine = !chapters.length;
  const spec = DRILL_TYPES.find((d) => d.id === type);
  useAudioStopOnLeave();
  const save = { key: `drill:${type}`, route: "Drill", tab: "Practice", params: all ? { type, all } : { type },
                 title: spec ? spec.name : type };
  // "Start again" opens the options, as a first visit does.
  const resume = useResume(save.key, route.params, { onRestart: () => setCog(true) });

  /* The cog: open it, change things, Apply deals a fresh run. Closing with
     nothing changed leaves the run where it was. */
  const before = useRef(JSON.stringify([prefs, typed]));
  const openCog = () => { before.current = JSON.stringify([prefs, typed]); setCog(true); };
  const closeCog = () => {
    setCog(false);
    if (JSON.stringify([prefs, typed]) !== before.current) {
      clearRun(save.key);              // a run on the old options is not where you left off
      setAll(false);                   // the ticks chosen now are what it asks
      setResult(null); setSeed(seed + 1);
    }
  };
  // The header menu's "Drill options" row (headermenu.js) opens the cog.
  useHeaderOptions(route, openCog, "Drill options");
  const sheet = cog ? <DrillOptions type={type} prefs={prefs} onChange={setPrefs} onClose={closeCog} /> : null;

  if (resume.prompt) return resume.prompt;
  if (!steps) return <Screen><Loading /></Screen>;
  if (!steps.length) {
    return (
      <>
        {/* Under "Your words", say why: no word is at 40 yet, and the cog's
            chapters are the way in until one is. */}
        <Done title={mine ? "No words at 40 yet" : "No questions available"}
              detail={mine ? "Pick chapters in Options" : undefined}
              onBack={() => navigation.goBack()}
              onAgain={openCog} againLabel="Options" />
        {sheet}
      </>
    );
  }
  if (result) {
    return (
      <Done
        title={spec.name}
        detail={`${result.right} of ${result.total} right` +
                (result.helped ? ` · ${result.helped} with the table` : "")}
        score={result.score}
        passed={result.score >= DRILL_PASS}
        onAgain={() => { setResult(null); setSeed(seed + 1); }}
        onBack={() => navigation.goBack()}
      />
    );
  }

  return (
    <>
      <Runner
        key={seed}
        steps={steps}
        navigation={navigation}
        save={save}
        restore={resume.restore}
        onFinish={(r) => {
          const score = scoreOf(r);
          update((prev) => bestOf(prev, type, score));
          setResult({ ...r, score });
        }}
      />
      {sheet}
    </>
  );
}

/* ------------------------------------------------------- one word's drill */

/* A drill on one word, chosen from the back of its flashcard (worddrills.js;
   core/questions.js wordDrill). `word` is the card's Russian string and
   `drill` one of WORD_DRILLS, or one of SKILL_DRILLS from a segment of the
   score ring (skills.js). Graded as any run is — the meaning questions
   move the card and its meaning scores, the form drills the "Cases & forms"
   score alone (Run.js gradesCard), Say it nothing — which is what makes the
   row in the sheet the way to move the number the breakdown shows. No best
   score is kept: the skill slots are the record. */
export function WordDrillFlow({ route, navigation }) {
  const { word, drill } = route.params || {};
  const { st } = useSession();
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  const i = wordIndex(word);
  const spec = wordDrillSpec(drill);
  const typed = st.typedDrills !== false;
  const steps = useMemo(() => (i >= 0 && spec ? Q.wordDrill(i, drill, { typed }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i, drill, typed, seed]);
  useAudioStopOnLeave();
  const title = spec ? spec.name : "Drill";
  const save = { key: `word:${word}:${drill}`, route: "WordDrill", tab: "Study", params: { word, drill },
                 title: i >= 0 ? `${title} · ${L[i].w}` : title };
  const resume = useResume(save.key, route.params);
  if (resume.prompt) return resume.prompt;

  if (!steps.length) {
    return <Done title="Nothing to drill here" onBack={() => navigation.goBack()} />;
  }
  if (result) {
    // A word said is not marked (§30z): the run ends, and nothing is scored.
    const said = drill === "say";
    return (
      <Done
        title={title}
        detail={said ? L[i].w : `${result.right} of ${result.total} right`}
        score={said ? undefined : result.score}
        passed={said ? undefined : result.score >= DRILL_PASS}
        onAgain={() => { setResult(null); setSeed(seed + 1); }}
        againLabel="Again"
        onBack={() => navigation.goBack()}
      />
    );
  }
  return (
    <Runner
      key={seed}
      steps={steps}
      navigation={navigation}
      save={save}
      restore={resume.restore}
      onFinish={(r) => setResult({ ...r, score: scoreOf(r) })}
    />
  );
}

/* ------------------------------------------------------------- grammar */

/* A run on one chapter's grammar point with that chapter's words
   (core/questions.js grammarRun; the owner, 2026-09-30: "exercises within the
   lessons that focus on … one of the grammar points from that chapter… They
   can be embedded in lessons and also stand alone modules"). Inside a lesson
   it is the questions that close the vocabulary walk; this is the unit's own
   module, reached from the unit screen and Practice. It was also a lesson
   step until 2026-10-08 (data.js components). Graded like any run, so the
   scheduler hears every word it asks. */
export function GrammarFlow({ route, navigation }) {
  const { unitId } = route.params || {};
  const unit = UN.find((u) => u.id === unitId);
  const { update } = useSession();
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(0);
  const steps = useMemo(() => (unit ? Q.grammarRun(unit, null) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unitId, seed]);
  const title = (steps[0] && steps[0].note && steps[0].note.title) || "Grammar";
  useAudioStopOnLeave();
  const save = { key: `grammar:${unitId}:unit`, route: "GrammarRun", params: { unitId }, title };
  const resume = useResume(save.key, route.params);
  if (resume.prompt) return resume.prompt;

  if (!unit || !steps.length) {
    return <Done title="No grammar practice here yet" onBack={() => navigation.goBack()} />;
  }
  if (result) {
    /* Continue back to where it was opened, Try again the quieter choice (the
       owner, 2026-10-06: "Remove back and place continue… try again being the
       less important more neutral looking option"). */
    return (
      <Done
        title={title}
        detail={`${result.right} of ${result.total} right`}
        score={result.score}
        passed={result.score >= DRILL_PASS}
        onAgain={() => { setResult(null); setSeed(seed + 1); }}
        againLabel="Try again"
        onContinue={() => navigation.goBack()}
        onBack={() => navigation.goBack()}
      />
    );
  }
  return (
    <Runner
      key={seed}
      steps={steps}
      navigation={navigation}
      save={save}
      restore={resume.restore}
      onFinish={(r) => {
        const score = scoreOf(r);
        update((prev) => bestOf(prev, grammarKey(unit), score));
        setResult({ ...r, score });
      }}
    />
  );
}
