/* Study — flashcards with the four Anki buttons, scheduled by FSRS.
 *
 * A card is a curriculum word, a pool sentence, or a card from an imported Anki
 * deck. All key their schedule on the Russian string (rule 20.4), so a deck
 * card that is also a curriculum word shares one memory — one card a word
 * since §30at, asked from whichever front the learner chose (Russian, English,
 * sound).
 *
 * The session is built by core/queue.js, which is where the owner's "131
 * cards, sequential" went: most forgotten first, learning steps when due, new
 * cards rationed and mixed in, siblings buried, twenty at a time, Again back
 * after three others. This screen deals what it is handed and grades what
 * is answered; it does not decide order. */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Pressable, Animated } from "react-native";
import { useSession } from "../session";
import { useTheme, radius, type as T } from "../theme";
import { Screen, Card, Btn, Bar, Pill, Speaker, Muted, List, Row, Senses, SenseList, Tick, Sheet, Lift, Text, CogButton, Unselectable, toneOf,
         Familiarity, familiarityColor, RowText, Bubble, ActionChip } from "../ui";
import { PartialHintButton, PartialHintLine } from "../hint";
import { hintSteps, hintMask } from "@core/hint";
import { RunTools } from "../askai";
import { L, idxOfWord, exactIdx, sensesOf, goalNow, goalOpts, rankOf, lowPriority } from "../data";
import { Linked, GrammarLine } from "../words";
import { useAbout, cardAbout } from "../about";
import { IrregularTag } from "../rules";
import { say } from "../audio";
import { tap as buzzTap } from "../haptics";
import { useFlip } from "../motion";
import { applyGrade, reviewRows, preview, schedulerOpts, cardFor } from "@core/scheduler";
import { requeue, dailyFor, kindsOf, rollGoal, spendGoal, isStudyDay } from "@core/queue";
import { flagsFor, troubleWords, cardsIn, sourceCards, studyCards, knownWords, sittingTally, masteryOf,
         sessionFor } from "../studycards";
import { SetPicker } from "../studypicker";
import { ScoreRing } from "../skills";
import { WordDrillsButton } from "../worddrills";
import { leanNudge } from "@core/lean";
import { SKILLS } from "@core/skills";
import { dayOf } from "@core/scheduler";

/* The familiarity ring and its colour live in ui.js now (2026-09-28): the
   dictionary entry draws the same ring for the same number, and a second copy
   here is how the two would come to disagree. Re-exported for the tests that
   import it from here. */
export { familiarityColor, Familiarity };

/* The counter: a few small figures in a row, each its colour; a tap opens what
   each one is (`TallySheet`). Small and tight, no words beyond "left" — the
   colours carry the meaning once seen, and the sheet says it for the first
   time. */
function Tally({ parts, onPress }) {
  const t = useTheme();
  return (
    <Pressable testID="tally" accessibilityRole="button" onPress={onPress} hitSlop={8}
               accessibilityLabel={parts.map((p) => `${p.n} ${p.label}`).join(", ")}
               style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10,
                 minHeight: 32, paddingHorizontal: 10, borderRadius: radius.lg,
                 backgroundColor: t.surface2, opacity: pressed ? 0.6 : 1 })}>
      {parts.map((p) => (
        <View key={p.id} testID={`tally-${p.id}`} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {p.dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.dot }} /> : null}
          <Text style={{ color: p.muted ? t.ink3 : t.ink, fontSize: 13, fontWeight: "700" }}>
            {p.short || String(p.n)}
          </Text>
        </View>
      ))}
    </Pressable>
  );
}

function TallySheet({ title, parts, onClose }) {
  const t = useTheme();
  return (
    <Sheet testID="tally-sheet" title={title} onClose={onClose}>
      <List>
        {parts.map((p) => (
          <Row key={p.id}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.dot || t.ink3 }} />
            <RowText title={p.label} sub={p.desc} />
            <Text style={{ color: t.ink, fontSize: 17, fontWeight: "700" }}>{String(p.n)}</Text>
          </Row>
        ))}
      </List>
    </Sheet>
  );
}

/* How big the Russian sits on the card. A word is the card and should be the
   largest thing on the screen; a sentence is a line to read and wants to stay
   on three lines rather than seven. */
const faceSize = (face) => (face.sentence ? (face.w.length > 46 ? 20 : 24)
  : face.w.length > 18 ? 26 : face.w.length > 11 ? 34 : 44);

/* The card's front, by direction: the Russian, its meaning, or only the sound.
   A sentence is plain text here and word-linked on the back — tapping a word
   before answering would hand over the answer. */
/* The meaning, as the English side of a card: the first sense large — it is
   the side the learner starts from on a produce card, and the starting side
   is always the large text (the owner, 2026-10-03: "it helps anchor and
   orient everything") — and any other senses small beneath it, since the
   question is "which word means all of these?". A sentence's translation is
   one line. */
/* …and the meanings are the entry's own senses where it has them, the gloss
   otherwise — the same first sense the Russian side numbers 1, so the two
   fronts of one card name the same meaning (the owner, 2026-10-31: "the words
   and definitions for English to Russian don't always match the key
   definitions from the Russian to English"). */
function Meaning({ face, senses }) {
  const t = useTheme();
  if (face.sentence) {
    return <Text testID="card-meaning-front" style={{ color: t.ink, fontSize: 22, fontWeight: "600",
                                                       textAlign: "center" }}>{face.e || "—"}</Text>;
  }
  const groups = senses && senses.length ? senses.map((s) => s.g).filter(Boolean)
    : String(face.e || "").split(";").map((s) => s.trim()).filter(Boolean);
  if (!groups.length) return <Text style={{ color: t.ink, fontSize: 22, fontWeight: "600" }}>—</Text>;
  return (
    <View style={{ alignItems: "center", gap: 4 }}>
      <Text testID="card-meaning-front"
            style={{ color: t.ink, fontWeight: "600", textAlign: "center",
                     fontSize: groups[0].length > 22 ? 24 : 30 }}>{groups[0]}</Text>
      {groups.length > 1 ? (
        <Muted style={{ textAlign: "center" }}>{groups.slice(1, 4).join("; ")}</Muted>
      ) : null}
    </View>
  );
}

/* What a card's front hides, for its partial hint: the Russian on an English
   front; on a Russian or a sound front, the meaning — its first sense, and of
   that the first word given, since "free, gratuitous, rent-free" a letter at
   a time is three answers. A sentence's answer is its English. Exported for
   the test. */
export function frontAnswer(face, direction, senses) {
  if (direction === "produce") return String(face.w || "");
  if (face.sentence) return String(face.e || "");
  const group = senses && senses.length && senses[0].g ? senses[0].g : String(face.e || "").split(";")[0];
  return String(group || "").split(",")[0].trim();
}

/* The front's partial hint (the owner, 2026-11-06: "add this mechanism to the
   front side of the flash cards… go one letter at a time"): each press shows
   one more letter of the answer, a sentence one more word (core/hint.js). The
   card is graded by the learner, so a hint costs nothing here — the four
   buttons are where they say how it went. */
function FrontHint({ answer }) {
  const steps = useMemo(() => hintSteps(answer), [answer]);
  const [n, setN] = useState(0);
  if (!steps.length) return null;
  return (
    <View style={{ alignItems: "center", gap: 10, marginTop: 14, alignSelf: "stretch" }}>
      <PartialHintLine mask={n ? hintMask(answer, steps[n - 1]) : null} testID="card-hint-text" size={20} />
      {n < steps.length ? (
        <PartialHintButton testID="card-hint" on={n > 0} onPress={() => setN(n + 1)} />
      ) : null}
    </View>
  );
}

function Front({ face, direction, senses }) {
  const t = useTheme();
  const hint = <FrontHint answer={frontAnswer(face, direction, senses)} />;
  if (direction === "produce") return <>{<Meaning face={face} senses={senses} />}{hint}</>;
  if (direction === "listen") {
    return (
      <View style={{ alignItems: "center", paddingVertical: 12, alignSelf: "stretch" }}>
        <Speaker text={face.b} size={64} />
        {hint}
      </View>
    );
  }
  return (
    <>
      <Text style={{ color: t.ink, fontWeight: "600", textAlign: "center", fontSize: faceSize(face) }}>
        {face.w}
      </Text>
      <View style={{ marginTop: 10 }}><Speaker text={face.b} /></View>
      {hint}
    </>
  );
}

export default function Study({ navigation, route }) {
  const { st, update, ready } = useSession();
  const t = useTheme();
  const [picker, setPicker] = useState(false);
  const [session, setSession] = useState(null);   // core/queue.js buildSession
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(false);
  /* Turned over at least once. The grade buttons follow this, not `shown`, so
     a card can be turned back to its front and looked at again before it is
     graded (the owner, 2026-09-24: "an option to flip the card back over…
     right now it asks you to flip and then requires you grade it
     immediately"). Tapping the card turns it either way once revealed. */
  const [revealed, setRevealed] = useState(false);
  const [last, setLast] = useState(null);         // the answer just given, for Undo

  /* What each card in the session looks like, keyed by its Russian.
   *
   * The dependency list used to end `st.seen === undefined`, which is a
   * **constant** — it is `false` on every render — so the map was built once
   * and never rebuilt as cards were graded. That matters because the `__due__`
   * set is computed *from* `st.seen`: the session is dealt fresh from
   * `cardsIn` every time, so it can contain a word the stale map has no face
   * for, and the card then renders with nothing on it.
   *
   * Keyed on what the set actually is, so a grade that changes what is due
   * rebuilds it. `cardsIn` is a walk over the ticked sets — 1,045 words at the
   * very most — and it runs on a render, not on a frame. */
  const faces = useMemo(() => {
    const m = {};
    for (const c of studyCards(st).concat(cardsIn(st, ["__trouble__"]))) if (!m[c.b]) m[c.b] = c;
    return m;
    // A card restored from low priority needs its face back (studycards.js).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.sets, st.decks, st.seen, st.cardKinds, st.lowPriority]);
  // Cards not yet met that the sources could introduce — what "Study ahead" offers.
  const unmet = useMemo(() => sourceCards(st).filter((c) => !st.seen[c.b]).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [st.sets, st.decks, st.seen, st.cardKinds, st.lowPriority]);
  const trouble = troubleWords(st);
  // The day's goal as it stands, and whether today is a study day.
  const goal = goalNow(st);
  const studyDay = isStudyDay(goal.day, st.studyDays);
  // Anything met to go on with past the goal: what "Keep going" deals.
  const metAny = Object.keys(st.seen || {}).length > 0;
  const knownCount = useMemo(() => knownWords(st).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [st.seen, st.cardKinds]);

  const dealt = useRef(0);   // which deal this is, for "read once per card"
  /* The sitting, by card (`sittingTally`): every card dealt in it, across the
     chunks — the pile is dealt twenty at a time and the next chunk follows by
     itself, so the counter has to span them (the owner, 2026-09-30: "Still
     says 157 due but 20 cards") — and how each was last answered. */
  const sitting = useRef(new Set());
  const [marks, setMarks] = useState({});
  const [aheadMode, setAheadMode] = useState(false);
  // Past the day's reviews by choice ("Keep going"); chunks dealt after carry it.
  const [beyondMode, setBeyondMode] = useState(false);
  const [tallyOpen, setTallyOpen] = useState(false);
  /* **The goal is a moment, not a wall** (the owner, 2026-11-02: "Remove the
     25 study cap. Just have a little temporary pop-up when player hits 25 and
     offer to pivot to something else"). Reaching it opens a small bubble once
     a sitting — Keep going, or Something else — and the pile runs on past it
     by itself; `stopped` is the learner choosing something else, which ends
     the sitting on the ways on. `sawOwed` keeps the bubble for a sitting that
     actually reached the goal, not one opened after it was met. */
  const [goalPop, setGoalPop] = useState(false);
  const [stopped, setStopped] = useState(false);
  const sawOwed = useRef(false);
  const celebrated = useRef(false);
  const deal = (ahead, round, extra, carry) => {
    dealt.current += 1;
    // A chunk past the goal, asked for or carried on from one: the sitting
    // stays "beyond" from then on. And a review begun with the goal already
    // met is past it from its first card — the goal is not a cap.
    const beyond = !!(extra && extra.beyond) || (!!carry && beyondMode)
      || (!ahead && !round && goalNow(st).owed === 0 && metAny);
    const next = sessionFor(st, { ahead, round, ...extra, beyond });
    if (beyond) setBeyondMode(true);
    if (!carry) {
      sitting.current = new Set(); setMarks({}); setAheadMode(!!ahead); setBeyondMode(beyond); setAfter(null);
      setStopped(false); sawOwed.current = false; celebrated.current = false;
    }
    for (const it of next.items) sitting.current.add(it.word);
    setSession(next);
    setAt(0);
    setShown(false); setRevealed(false);
    setLast(null);
  };
  /* The trouble round, asked for from elsewhere — You's trouble sheet. A
     route param rather than a tick in the picker, so it is one round and
     leaves the day's settings as they were. */
  const params = (route && route.params) || {};
  const round = params.round === "trouble" || params.round === "list" ? params.round : null;
  /* A round handed in from somewhere the learner is going back to — the
     video's "Before the video" cards, a lesson's — ends on the one way back
     (`after`: its label), not on the day's options (the owner, 2026-10-04:
     "the option should be to continue to video, not those other options"). */
  /* …and since 2026-10-09 the round goes *on* rather than back: `next` is
     the route the lesson continues to (the video, the next lesson's words),
     and the one button says Continue (the owner: "After the flashcards, it
     should not go back to summary. Continue to the video or whatever the
     exercise is. The button should just say continue"). */
  const [after, setAfter] = useState(null);
  const [onward, setOnward] = useState(null);
  useEffect(() => {
    if (!round || !ready) return;
    dealtKey.current = setsKey;   // the round stands until the settings change
    deal(false, round, { words: params.words, title: params.title });
    setAfter(params.after || (params.next ? "Continue" : null));
    setOnward(params.next || null);
    navigation.setParams({ round: undefined, words: undefined, title: undefined, after: undefined, next: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, ready]);
  // The profile arrives after the first render, and a set or a deck can change
  // from the picker: the session follows what is ticked. Not what is graded —
  // a session is dealt once and played through.
  /* Everything the picker can change that changes the deal. The rations were
     missing, so picking a different "New words a day" wrote the setting and
     left the pile alone — the owner read that, correctly, as a control that
     did nothing (2026-09-22). `flashVoice` is deliberately absent: it changes
     how a card is read aloud, not which cards there are, and re-dealing on it
     would throw away a session in progress. */
  const setsKey = [
    st.sets.join(","), kindsOf(st.cardKinds).join(","),
    (st.decks || []).map((d) => d.id + d.cards.length).join(","),
    (st.flash || []).join(","),
    st.newPerDay, st.learnAhead, st.retention,
  ].join("|");
  /* Not before the profile has arrived: the store's defaults now carry a
     source of new cards (`__path__`), so a deal from them was a real pile —
     one card read aloud from a profile nobody had loaded, then replaced. */
  // …nor over a trouble round that was asked for, which deals itself.
  /* …and not while the options sheet is open: every tick re-dealt, and the new
     first card read itself aloud under the finger (the owner, 2026-09-29).
     The pile is dealt once when the sheet closes, and only if something that
     changes the deal did. */
  const dealtKey = useRef(null);
  /* **Study opens on its options, each time** (the owner, 2026-10-05: "Each
     time the person clicks study, they'll encounter the options for which
     cards they review. The default will be their personal review"). Nothing
     is dealt until Start — or until a round handed in from another screen,
     which is its own start. */
  const [started, setStarted] = useState(false);
  /* The front changed part-way through a sitting: the same cards again from
     the first, met from the other side (studycards.js `again`; the owner,
     2026-10-31). A plain re-deal only held what was still due, so the cards
     just graded from the Russian were gone and the pile "started right where I
     left off". The fronts are compared on their own: a change of source or
     ration re-deals the day's pile as before. */
  const dealtFronts = useRef((st.flash || []).join(","));
  useEffect(() => {
    if (!ready || !started || picker || round || dealtKey.current === setsKey) return;
    dealtKey.current = setsKey;
    const fronts = (st.flash || []).join(",");
    const switched = fronts !== dealtFronts.current && Object.keys(marks).length > 0;
    dealtFronts.current = fronts;
    if (switched) deal(false, "again", { words: [...sitting.current], title: "From the top" });
    else deal(false);
  }, [setsKey, ready, picker, started]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Back on the tab after leaving it: the options again, unless a sitting is
  // under way (a half-played pile is not thrown away by a tab press).
  /* …and only after leaving the *tab*. A screen pushed over this one — a
     word's drill or entry from the back of a card, a video from "Where you
     heard it" — blurs and refocuses it too, and the pile was thrown away on
     the way back whenever nothing had been graded yet: Drills on the first
     card, Done, and the options again (the emulator, 2026-10-31). On blur the
     stack says which it was: a pushed screen is on top of this one; a tab
     press leaves this screen on top of its own stack. */
  const pushedOver = useRef(false);
  useEffect(() => {
    if (!navigation || typeof navigation.addListener !== "function") return undefined;
    const offBlur = navigation.addListener("blur", () => {
      const s = typeof navigation.getState === "function" ? navigation.getState() : null;
      const top = s && s.routes ? s.routes[s.index] : null;
      pushedOver.current = !!(top && route && top.key !== route.key);
    });
    const offFocus = navigation.addListener("focus", () => {
      if (pushedOver.current) { pushedOver.current = false; return; }
      if (started && !Object.keys(marks).length && !(session && session.practice)) {
        setStarted(false); dealtKey.current = null; setSession(null);
      }
    });
    return () => { offBlur(); offFocus(); };
  }, [navigation, route, marks, started, session]);

  /* The nudge, read off the scores (core/lean.js leanNudge), and stamped the
     day it is shown so it stays quiet afterwards. Stamped only while the
     options are showing, which is where it is drawn. */
  const onOptions = ready && !started && !session;
  const nudge = useMemo(() => (onOptions
    ? leanNudge({ seen: st.seen, rankOf, fronts: st.flash, nudged: st.nudged }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onOptions, st.seen, st.flash, st.nudged]);
  useEffect(() => {
    if (!nudge) return;
    const day = dayOf(Date.now());
    if (st.nudged && st.nudged.skill === nudge.skill && st.nudged.day === day) return;
    update((p) => ({ ...p, nudged: { day, skill: nudge.skill } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nudge && nudge.skill]);

  const kinds = kindsOf(st.cardKinds);
  const heading = session && session.practice ? session.title || "Trouble words"
    : kinds.length === 2 ? "Words and sentences" : kinds[0] === "sentences" ? "Sentences" : "Words";

  const items = session ? session.items : [];
  const item = items[at] || null;
  /* A card the session holds but the face map does not know, or one whose
     Russian is empty, must never reach the screen as a blank card — which is
     what the owner reported on 2026-09-17. The session is built from the
     scheduler's own record, so a word can be in it that the ticked sets cannot
     describe: a deck card whose fields did not parse, or a word left in `seen`
     by a payload that no longer carries it. Falling back to the word itself
     means the worst case is a card with no meaning on it rather than a card
     with nothing at all, and `blank` below says so plainly rather than
     pretending. */
  const known = item ? faces[item.word] || (session.faces && session.faces[item.word]) : null;
  const face = !item ? null
    : known && String(known.w || "").trim() ? known
    : { key: "x" + item.word, w: item.word, b: item.word, e: "",
        sentence: /\s/.test(String(item.word || "")) };
  const blank = !!item && !String(face.w || "").trim();
  // The card as it stands now — a re-queued Again is not the card it was
  // when the session was dealt.
  const current = item ? cardFor(st.seen[item.word]) : null;
  const iv = item ? preview(current, Date.now(), schedulerOpts(st)) : null;
  /* The card's own lemma — the one whose bare form *is* this card's word
     (`exactIdx`), not the first owner of the folded key, which for «всё» or
     «его» is another word. A sentence or a deck card has none. */
  const own = face && !face.sentence ? exactIdx(face.b) : -1;
  const senses = own >= 0 ? sensesOf(own) : null;
  const cardLemma = own >= 0 ? L[own] : null;
  /* The card on screen, for a tester's report and for the AI (about.js): what
     the back shows — the meanings as numbered there and the example sentences
     in their order — so "is the third example accusative?" is about the one
     in front of the learner (the owner, 2026-10-13). */
  useAbout(item ? { kind: face.sentence ? "sentence card" : "word card", word: face.b || item.word,
                    answer: face.e || undefined, front: item.front || undefined,
                    step: `${at + 1} of ${items.length}`,
                    card: cardAbout(face, senses) } : null);
  const flip = useFlip(shown, at);

  /* The Russian side reads itself out: on arrival when it is the front, on
     the turn when it is the back, and a listening card is the recording. A
     tap on the speaker plays it again (audio.js). */
  /* Keyed on the card, not only on the position. `[at, shown]` alone missed
     the first card of every session: dealing leaves `at` at 0 and `shown` at
     false — their initial values — so React never re-ran this, and only the
     second card onward was read aloud. A listen card first in the pile was a
     speaker button in silence, which is what the owner reported as a blank
     card (2026-09-17). `studyoptions.test.js` holds it. */
  /* **Once per card, not once per flip** (the owner, 2026-09-29: *"the card
     audio goes off each time the card flips… not necessary"*). A card reads
     itself when it arrives with the Russian or the sound on its front, or —
     for an English-front card — the first time it is turned to the Russian.
     Turning it back and forth after that is looking, and the speaker is
     there for hearing it again. Keyed on the deal as well as the position,
     so the same word at the same place in a new session still reads. */
  const heard = useRef(new Set());
  useEffect(() => {
    if (!item || !face) return;
    const russianShowing = item.direction === "produce" ? shown : !shown;
    const key = `${dealt.current}:${at}:${item.word}`;
    if (russianShowing && !heard.current.has(key)) {
      heard.current.add(key);
      say(face.b, { repeat: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, shown, item && item.word, item && item.direction]);
  const flags = flagsFor(st, item);

  const grade = (g) => {
    /* The weight of the button, not a verdict. Nothing here is right or wrong
       — the learner is reporting how it went, and a phone that buzzed "wrong"
       at an honest Again would be arguing with them. */
    buzzTap();
    const now = Date.now();
    const word = item.word, direction = item.direction;
    /* **Every grade counts, a second look the same day included.** From
       2026-10-05 a right answer on a card already answered today changed
       nothing in a practice round («ребёнок» at 98 after a lesson's cards, the
       video's and the day's pile each met it within the hour). That hid the
       repeat instead of stopping it, and the owner met the other side of it
       on 2026-10-19: *"multiple easy presses is not putting a dent in the
       familiarity score"*. The rounds no longer deal a card answered today
       (studycards.js sessionFor, core/queue.js goalSession); a card that is
       dealt is graded, and FSRS-6's same-day formula is what keeps three
       Easys in a sitting from reading as three weeks (one Easy is 8 days,
       the next 13, the next 20). */
    const rows = reviewRows(st.seen, [{ word, direction, grade: g }], now, "study", schedulerOpts(st));
    // `entry`: the word's whole entry as it was — its card and its skill
    // slots (core/skills.js) — so Undo puts all of it back.
    const before = { items: items, at, prev: current, entry: st.seen[word], trouble: st.trouble, daily: st.daily,
                     goal: st.goal, row: rows[0], marks };
    setMarks({ ...marks, [word]: g === 1 ? "again" : "done" });
    update((prev) => {
      const r = applyGrade(prev.seen, prev.trouble, word, direction, g, now, schedulerOpts(prev));
      const daily = dailyFor(prev.daily, now);
      return {
        ...prev, seen: r.seen, trouble: r.trouble,
        /* A card, not a press: a re-queued Again and a new card's first grade
           do not spend the day's reviews (the review, 2026-10-02 — fifteen
           Agains used to end the day at thirty-five cards). */
        daily: { ...daily, reviews: daily.reviews + (item.again || item.kind === "new" ? 0 : 1),
                 new: daily.new + (item.kind === "new" && !item.again ? 1 : 0) },
        /* One off the day's goal for every card answered, any round — the
           number on the tab is what the learner is fighting (2026-10-05). An
           Again coming round is the same card, not another. */
        goal: item.again ? rollGoal(prev.goal, now, goalOpts(prev))
          : spendGoal(rollGoal(prev.goal, now, goalOpts(prev)), 1),
      };
    }, rows);
    setLast(before);
    const next = g === 1 ? requeue(items, at, item) : items;
    setSession({ ...session, items: next });
    setAt(at + 1);
    setShown(false); setRevealed(false);
  };

  /* **Set aside as low priority** (the owner, 2026-11-06: "the option to flag
     a word low priority and that will remove it from the rotation"). The
     card leaves the pile now — this time and every time it was due to come
     round in this sitting — and every pile after (data.js lowPriority). It is
     not a grade: its schedule is kept as it is, so taking it off the list
     (Study options) picks it up where it was. Undo puts it straight back. */
  const setAside = () => {
    const word = item.word;
    setLast({ aside: word, items, at, marks, wasLow: lowPriority(st)[word] });
    update((p) => ({ ...p, lowPriority: { ...(p.lowPriority || {}), [word]: Date.now() } }));
    sitting.current.delete(word);
    const { [word]: _gone, ...rest } = marks;
    setMarks(rest);
    setSession({ ...session, items: items.filter((it, k) => k < at || (k > at && it.word !== word)) });
    setShown(false); setRevealed(false);
  };

  /* The last answer taken back: the card as it was, the log row gone, the
     session as it stood — the card is in front again, face up. */
  const undo = () => {
    if (!last) return;
    if (last.aside) {
      const word = last.aside;
      update((p) => {
        const low = { ...(p.lowPriority || {}) };
        if (last.wasLow === undefined) delete low[word]; else low[word] = last.wasLow;
        return { ...p, lowPriority: low };
      });
      sitting.current.add(word);
      setSession({ ...session, items: last.items });
      setMarks(last.marks);
      setAt(last.at);
      setShown(true); setRevealed(true);
      setLast(null);
      return;
    }
    const { row, entry } = last;
    update((p) => {
      // The entry — the card and its skill scores — back as it was, or gone,
      // if the grade was its first.
      const seen = { ...p.seen };
      if (row) { if (entry) seen[row.word] = entry; else delete seen[row.word]; }
      return { ...p, seen, trouble: last.trouble, daily: last.daily, goal: last.goal };
    }, [], row ? [{ word: row.word, direction: row.direction, at: row.at }] : []);
    setSession({ ...session, items: last.items });
    setMarks(last.marks);
    setAt(last.at);
    setShown(true); setRevealed(true);
    setLast(null);
  };

  const finished = session && at >= items.length;
  /* What a fresh deal would hold once this pile is through: the rest of a
     backlog past the session's twenty, and the learning steps that have come
     due while it ran. Read off the scheduler rather than the finished
     session's own count, so an Again ten minutes ago is not lost. The day's
     pile, never the trouble round. */
  const more = useMemo(() => {
    if (!session || (!finished && items.length)) return 0;
    // Past the goal, "Keep going" is one chunk at a time and ends on the
    // options again rather than dealing for ever.
    if (beyondMode) return 0;
    const s = sessionFor(st, {});
    return s.items.length + (s.remaining || 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, items.length, st.seen, st.daily, setsKey, beyondMode]);
  /* **The pile goes on until the day is done** (the owner, 2026-09-29: "when
     I finish my review… it randomly says '3 to go'"). A session is dealt
     twenty at a time and the cards just missed come back within minutes, so
     there was a screen between chunks announcing a number nobody had asked
     about. The next chunk is simply dealt; the only stop is the end of the
     day's work. Not after a trouble round, which ends on its own screen. */
  useEffect(() => {
    // The learner chose something else at the goal: the sitting ends here.
    if (stopped) return;
    if (finished && more > 0 && session && !session.practice) { deal(false, undefined, undefined, true); return; }
    /* The goal is met and the pile would have stopped: it runs on instead,
       a chunk at a time past the goal, until the pool has nothing left that
       was not answered today (the owner, 2026-11-02). The bubble below is
       where the learner is told, and where they may stop. */
    if (finished && more === 0 && session && session.goal && items.length && !session.practice
        && Object.keys(marks).length && sessionFor(st, { beyond: true }).items.length) {
      deal(false, undefined, { beyond: true }, true);
      return;
    }
    /* The pool is exhausted — every met card answered today, nothing due,
       no new card allowed — and the goal still says some are owed. There is
       nothing left to deal that would not be a card already answered today
       (core/queue.js goalSession), so the rest of the goal is met: the
       number on the tab goes to 0 because the work is done, not because the
       same cards were shown twice. Only after a pile that dealt something,
       so a learner with nothing met at all is told "Nothing to review yet"
       rather than congratulated. */
    if (finished && more === 0 && session && session.goal && !beyondMode && items.length
        && goal.owed > 0) {
      update((prev) => {
        const g = rollGoal(prev.goal, Date.now(), goalOpts(prev));
        return g.owed > 0 ? { ...prev, goal: { ...g, owed: 0 } } : prev;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, more, stopped]);
  /* The goal reached inside a sitting: the bubble, once. Only a sitting that
     had something owed when it began counts; a goal met on another screen is
     the options' business ("Daily goal met"). */
  useEffect(() => {
    if (!started || !session || session.practice) return;
    if (goal.owed > 0) { sawOwed.current = true; return; }
    // The pool ran out as the goal was met: the end screen says so itself.
    if (finished && !sessionFor(st, { beyond: true }).items.length) return;
    if (sawOwed.current && !celebrated.current && Object.keys(marks).length) {
      celebrated.current = true;
      setGoalPop(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal.owed, started, session && session.practice]);
  /* "Keep going" only while something met is left to deal: past the goal
     the fill never repeats a card answered today, so a learner who has been
     through everything is not offered an empty chunk. */
  const moreToGo = useMemo(() => !!session && !session.practice && finished && metAny
    && sessionFor(st, { beyond: true }).items.length > 0,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [finished, st.seen, setsKey, session && session.practice]);
  /* Where the sitting stands. A review (the day's pile, a video's list, a
     chosen round) counts its own cards: done, coming back, left, and the
     total, which the scheduler's cards past the dealt chunks are part of and
     an Again never adds to. Learning new words ahead of schedule is free
     study, and what it shows is the words themselves: how many of the ticked
     sources are mastered, still learning, and not met yet — no total, since
     the point there is progress across the set, not a pile to clear. */
  const tally = !session ? null : sittingTally(sitting.current, marks,
    session.practice ? 0 : (session.remaining || 0) + (session.newRemaining || 0));
  const mastery = useMemo(() => (aheadMode ? masteryOf(st, sourceCards(st)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aheadMode, st.seen, setsKey]);
  const tallyParts = mastery ? [
    { id: "mastered", n: mastery.mastered, dot: t.good, label: "Mastered", desc: "Held well enough to last weeks" },
    { id: "learning", n: mastery.learning, dot: t.warn, label: "Learning", desc: "Met, not yet held" },
    { id: "new", n: mastery.fresh, short: `${mastery.fresh} new`, label: "New", desc: "Not met yet" },
  ] : tally ? [
    { id: "done", n: tally.done, dot: t.good, label: "Done", desc: "Answered, finished for today" },
    { id: "again", n: tally.again, dot: t.warn, label: "Coming back", desc: "Missed, asked again soon" },
    { id: "left", n: tally.left, short: `${tally.left} left`, label: "Left", desc: "Still to answer today" },
    { id: "total", n: tally.total, muted: true, label: "In this review", desc: "Every card, each counted once" },
  ] : [];

  /* The controls belong to the screen, not to the card, and they are pinned
     off the scroll (`Screen footer`).

     They used to sit under the card inside it, which is fine while a card is
     short and wrong the moment it is not: the back of «этот» carries a
     four-line sense, two example pairs and three sentences, so Again / Hard /
     Good / Easy were below the fold and the one thing the screen is *for* could
     only be reached by scrolling past everything it shows. The quiz builder had
     exactly this bug and `footer` is the fix that was built for it — found
     again here by reading the walkthrough shots (§31), which is what they are
     for. Nothing while there is no card: an empty state has nothing to grade. */
  const controls = !item ? null : (
    <>
      {!revealed ? (
        <Btn kind="pri" label="Show" onPress={() => { setShown(true); setRevealed(true); }} />
      ) : (
        <View style={{ flexDirection: "row", gap: 6 }}>
          {/* The four most-pressed controls on the screen go through `Lift`
              like the quiz answers (§30ah): pressed *into* an edge in their own
              colour, not a border that thins. */}
          {[[1, "Again", "bad"], [2, "Hard", "plain"],
            [3, "Good", "good"], [4, "Easy", "pri"]].map(([g, label, kind]) => {
            // Btn's own tone table (ui.js toneOf), so a grade button and a
            // button of the same kind cannot drift apart.
            const tone = toneOf(t, kind);
            const fill = kind === "plain" ? t.surface : tone.bg;
            const edge = kind === "plain" ? t.surface3 : tone.edge;
            const fg = tone.fg;
            return (
              <Lift key={g} testID={`grade-${g}`} fill={fill} edge={edge}
                    border={kind === "plain" ? t.line : edge} r={radius.md}
                    style={{ flex: 1 }} onPress={() => grade(g)}>
                <View style={{ alignItems: "center", paddingVertical: 11 }}>
                  <Text style={{ fontWeight: "700", fontSize: 13, color: fg }}>{label}</Text>
                  <Text style={{ fontSize: 12, fontWeight: "500", color: kind === "plain" ? t.ink2 : fg }}>
                    {iv[g].label}
                  </Text>
                </View>
              </Lift>
            );
          })}
        </View>
      )}

      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
        <Btn kind="ghost" label="Undo" testID="undo" style={{ flex: 1 }}
             disabled={!last} onPress={undo} />
        <Btn kind="ghost" label="Skip ▶" style={{ flex: 1 }}
             onPress={() => { setAt(at + 1); setShown(false); setRevealed(false); }} />
      </View>
    </>
  );

  return (
    <Screen footer={controls}>
      {/* A summary of what is ticked — so it only exists once something is.
          The empty state's button is the way in; this row is the way back. */}
      {/* What is ticked and what the pile holds, with the cog that changes
          both — the same control the drills carry (2026-09-26). It was a row
          with a "Change" button, which the owner read as a menu; the cog is
          what every other screen means by "options". */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {/* The heading alone (the owner, 2026-10-05: "remove the top left
            where it says mastered and total cards… I just like the
            standalone system on the top right"). The tally beside the bar
            counts the sitting; the start panel and the tab badge carry the
            day's goal. */}
        <RowText testID="study-heading" title={heading} bold={false} />
        {started || session ? <RunTools /> : null}
        <CogButton testID="study-cog" label="Study options" onPress={() => setPicker(true)} />
      </View>

      {!started && !session ? (
        /* The options, first (2026-10-05): the day's number, the personal
           review as the one big action, and choosing other cards behind it. */
        <View testID="study-start" style={{ marginTop: 48, alignItems: "center", paddingHorizontal: 24 }}>
          <Text testID="study-goal" style={{ color: t.ink, fontSize: 56, fontWeight: "700", lineHeight: 64 }}>
            {studyDay ? String(goal.owed) : "–"}
          </Text>
          <Muted>{!studyDay ? "Not a study day" : goal.owed ? "to go today" : "Daily goal met"}</Muted>
          <Btn kind="pri" testID="study-go" style={{ marginTop: 24, minWidth: 240 }}
               label={st.sets.includes("__path__") ? "Personal review" : "Start review"}
               onPress={() => setStarted(true)} />
          <Btn kind="link" testID="study-choose" style={{ marginTop: 10 }} label="Choose cards"
               onPress={() => setPicker(true)} />
          {/* One direction has run well ahead of the other across the
              learner's words (core/lean.js): one quiet line naming the skill
              behind, and the switch. Here only, on the options — never over a
              card — and after a day it shows, not again for three. */}
          {nudge ? (
            <View testID="lean-nudge" style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 28 }}>
              <Muted>{`${(SKILLS.find((s) => s.id === nudge.skill) || {}).name} is behind`}</Muted>
              <Btn kind="link" testID="lean-switch" label="Switch"
                   onPress={() => update((p) => ({ ...p, flash: [nudge.front] }))} />
            </View>
          ) : null}
        </View>
      ) : !item ? (
        /* A sentence and its actions, with air around them — not a panel.
           The day's pile first; once it is empty, the day is done and what
           is left is the learner's choice: another round on the trouble words
           (the owner, 2026-09-28), or new cards ahead of schedule. */
        /* The day's goal, met — said as such (the owner, 2026-09-29: "they
           should be congratulated and notified on meeting their daily goal
           and presented with the option of continuing… review trouble words
           or be exposed to new words"). Between chunks nothing is drawn: the
           next one is dealt at once (the effect above). */
        more && !stopped && !(session && session.practice) ? null : (
        <View style={{ marginTop: 56, alignItems: "center", paddingHorizontal: 24 }}>
          {session && session.practice && finished ? (
            <Text testID="study-state" style={{ color: t.ink, fontSize: T.title, fontWeight: "700", textAlign: "center" }}>
              Round finished.
            </Text>
          ) : studyDay && !goal.owed ? (
            <>
              <Tick on size={56} />
              <Text testID="study-state"
                    style={{ color: t.ink, fontSize: T.title, fontWeight: "700", textAlign: "center", marginTop: 14 }}>
                Daily goal met
              </Text>
              <Muted testID="study-today" style={{ marginTop: 4 }}>
                {`${goal.done} ${goal.done === 1 ? "card" : "cards"} today`}
              </Muted>
            </>
          ) : (
            <Text testID="study-state" style={{ color: t.ink, fontSize: T.title, fontWeight: "700", textAlign: "center" }}>
              {studyDay ? "Nothing to review yet" : "Not a study day"}
            </Text>
          )}
          {/* The day's reviews are done and more are due: tomorrow's, unless
              the learner wants them now. No number on it — the point of the
              cap is not to show the wall. */}
          {after && session && session.practice && finished ? (
            <Btn kind="pri" testID="round-after" label={after}
                 style={{ marginTop: 20, minWidth: 220 }}
                 onPress={() => (onward ? navigation.replace(...onward) : navigation.goBack())} />
          ) : null}
          {after && session && session.practice && finished ? null : (
          /* The ways on, side by side where they fit rather than a column of
             wide buttons (the owner, 2026-10-31: "put them side by side…
             organized, space conscious, no clutter"). */
          <View testID="study-ways-on"
                style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: 20 }}>
          {/* Past the goal, as far as the learner wants: more reviews push
              the familiarity of their words up faster (the owner,
              2026-10-05). */}
          {moreToGo ? (
            <Btn kind="pri" testID="keep-going" label="Keep going"
                 onPress={() => deal(false, undefined, { beyond: true })} />
          ) : null}
          {session && session.practice && more ? (
            <Btn kind="pri" testID="continue" label={`Back to today's cards · ${more}`}
                 onPress={() => deal(false)} />
          ) : null}
          {trouble.length ? (
            <Btn kind={session && session.practice && more ? "plain" : "pri"} testID="trouble-round"
                 label={`Review trouble words · ${trouble.length}`}
                 onPress={() => deal(false, "trouble")} />
          ) : null}
          {unmet ? (
            <Btn testID="study-ahead" label="Learn new words" onPress={() => deal(true)} />
          ) : null}
          {knownCount ? (
            <Btn testID="known-round" label="Review known words" onPress={() => deal(false, "known")} />
          ) : null}
          </View>)}
        </View>
        )
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 }}>
            <View style={{ flex: 1 }}>
              <Bar value={mastery ? mastery.mastered / Math.max(1, mastery.mastered + mastery.learning + mastery.fresh)
                                  : tally.done / Math.max(1, tally.total)} />
            </View>
            <Tally parts={tallyParts} onPress={() => setTallyOpen(true)} />
          </View>
          {tallyOpen ? (
            <TallySheet title={mastery ? "Your words" : "This review"} parts={tallyParts}
                        onClose={() => setTallyOpen(false)} />
          ) : null}

          <Animated.View style={flip.style}>
          <Card testID={`card-${item.direction}`} style={{ marginTop: 12, alignItems: "center", paddingVertical: 28 }}>
          {/* Once revealed, a tap on the card's head — the word, its meaning,
              the speaker — turns it: back to the front to look again, and over
              once more, while the grade buttons stay. The head only: the
              meanings and examples under it are text to hold and copy (ui.js
              NoSelect), and a Pressable round the whole card took that touch
              first and turned the card instead (emulator, 2026-10-13). */}
          <Pressable testID="card-turn" accessibilityRole={revealed ? "button" : undefined}
                     accessibilityLabel={revealed ? "Turn the card" : undefined}
                     onPress={revealed ? () => setShown(!shown) : undefined}
                     style={{ alignSelf: "stretch", alignItems: "center" }}>
          <Unselectable>
            {/* A card with no Russian on it at all. It should not be possible
                and it happened, so it says what it is instead of showing an
                empty box — a failure the learner can report is worth more than
                a silent one (rule 20.7's third exemption). Skip moves past it
                and grading still works, so the pile is never stuck. */}
            {/* Whether the card is new, and on the back how well it is held.
                No caption naming the front any more (the owner, 2026-10-05:
                "Doesn't have to say Russian or English at the top of the
                card"): the front shows what it is. A flag is about the card's
                history, never its content, so it gives nothing away. */}
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8,
                           alignSelf: "stretch", marginBottom: 14, minHeight: 28 }}>
              {/* The card's actions, at the top of the card and boxed as the
                  controls they are (the owner, 2026-11-06: "the more and
                  drills button should be more clearly indicated as buttons and
                  they should be at the top of the card"). Once turned only:
                  every drill this word can take (worddrills.js), the whole
                  entry — a word only, a sentence card has neither — and
                  setting the card aside, which any card can be. */}
              {revealed && !blank ? (
                <View testID="card-actions" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, flexShrink: 1 }}>
                  {idxOfWord(face.b) >= 0 ? (
                    <>
                      <WordDrillsButton word={face.b}
                                        onPick={(drill) => navigation.navigate("WordDrill", { word: face.b, drill })} />
                      <ActionChip label="More" testID="full-entry"
                                  onPress={() => navigation.navigate("Word", { word: face.b })} />
                    </>
                  ) : null}
                  <ActionChip label="Low priority" testID="set-aside" onPress={setAside}
                              accessibilityLabel="Low priority: take out of the rotation" />
                </View>
              ) : <View />}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 28 }}>
              {flags.isNew ? <Pill testID="flag-new" tone="brand">New</Pill> : null}
              {/* How well this card is held, off its own FSRS stability. On
                  both faces for the same reason as the flags: it is about the
                  card's history, so it gives nothing away. */}
              {/* On the back only (the owner, 2026-09-29): the front is the
                  question, and a score beside it is something else to look
                  at before answering. */}
              {flip.face && flags.irregular ? <IrregularTag word={L[idxOfWord(item.word)]} testID="flag-irregular" /> : null}
              {flip.face ? <ScoreRing word={item.word} score={flags.score} /> : null}
              </View>
            </View>
            {blank ? (
              <Muted testID="card-blank" style={{ textAlign: "center" }}>
                This card has no word on it
              </Muted>
            ) : !revealed ? <Front key={`${dealt.current}:${at}:${item.word}`} face={face}
                                   direction={item.direction} senses={senses} /> : (
              <>
                {/* **Both sides on the back, the starting side on top** (the
                    owner, 2026-10-03: "both english and russian on the back,
                    and then whatever their starting point is on the front").
                    The front shows only its own side until the first turn, so
                    the answer is never on it. **After that first turn both
                    sides are the full card** (the owner, 2026-10-31: "flipping
                    back should give the full card on the other side… fully
                    detailed cards after the initial flip"): the English-headed
                    side of a produce card, and the Russian-headed side of
                    every card, each with the meanings and examples under it.
                    The Russian is word-linked here and can always be heard. */}
                {item.direction === "produce" && flip.face ? (
                  <>
                    <Meaning face={face} senses={senses} />
                    {/* The answer at the size the Russian has on any card
                        (the owner, 2026-10-31: "the answer is extremely
                        small. It should be bigger"). */}
                    <View testID="card-russian" style={{ alignItems: "center", alignSelf: "stretch", marginTop: 14 }}>
                      {face.sentence
                        ? <Linked text={face.w} size={faceSize(face)} />
                        : <Text style={{ color: t.ink, fontWeight: "600", textAlign: "center", fontSize: faceSize(face) }}>{face.w}</Text>}
                      {cardLemma ? <GrammarLine lemma={cardLemma} center style={{ marginTop: 2, alignSelf: "stretch" }} /> : null}
                      <View style={{ marginTop: 8 }}><Speaker text={face.b} /></View>
                    </View>
                  </>
                ) : (
                  <View testID="card-russian" style={{ alignItems: "center", alignSelf: "stretch" }}>
                    {face.sentence
                      ? <Linked text={face.w} size={faceSize(face)} />
                      : <Text style={{ color: t.ink, fontWeight: "600", textAlign: "center", fontSize: faceSize(face) }}>{face.w}</Text>}
                    {/* What the word is, under it, as everywhere (words.js
                        GrammarLine): only on the back, where nothing is left
                        to give away. */}
                    {cardLemma ? <GrammarLine lemma={cardLemma} center style={{ marginTop: 2, alignSelf: "stretch" }} /> : null}
                    <View style={{ marginTop: 10 }}><Speaker text={face.b} /></View>
                  </View>
                )}
              </>
            )}
          </Unselectable>
          </Pressable>
          {revealed && !blank ? (
              <>
                {/* Every meaning the word has, numbered as a dictionary
                    lays them (§30q), four at most — the full entry is one
                    press away above. Where there are no senses (2% of the
                    curriculum, every deck card) the translation stands on
                    its own. A sentence's English is its answer, in ink. The
                    English-headed side already has the meaning as its head. */}
                {item.direction === "produce" && flip.face ? null : face.sentence ? (
                  <Text testID="card-meaning" selectable
                        style={{ color: t.ink, fontSize: 18, marginTop: 12, textAlign: "center" }}>
                    {face.e || "—"}
                  </Text>
                ) : senses ? <SenseList senses={senses} size={16} max={4} brief mark={cardLemma} style={{ marginTop: 10 }} />
                  : <Senses e={face.e} size={16} align="left" style={{ alignSelf: "stretch" }} />}
                {(face.x || []).slice(0, 3).map((ex, k) => (
                  // The word in use, three ways: the entry reads like a dictionary,
                  // not a gloss (the owner, 2026-09-07).
                  <View key={k} style={{ marginTop: k ? 10 : 14, alignSelf: "stretch",
                                         paddingTop: k ? 10 : 0, borderTopWidth: k ? 1 : 0, borderTopColor: t.lineSoft }}>
                    {/* Every sentence the learner can read, they can hear (the
                        owner, 2026-09-23: "everything in the app… a speaker
                        button… the user is always hearing the words"). */}
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                      <View style={{ flex: 1 }}><Linked text={ex.ru} size={16} mark={cardLemma} /></View>
                      <Speaker text={ex.ru} size={32} />
                    </View>
                    <Muted selectable>{ex.en}</Muted>
                  </View>
                ))}
                {/* A word taken from a video keeps its source, and the card sends
                    you back to the second it was said (ROADMAP P10.4). */}
                {(st.mined || {})[face.b] ? (
                  <Pressable
                    testID="from-video"
                    accessibilityRole="button"
                    onPress={() => navigation.navigate("Video", {
                      videoId: st.mined[face.b].v, word: face.b, at: st.mined[face.b].t })}
                    style={{ marginTop: 14, alignSelf: "stretch", paddingTop: 12,
                             borderTopWidth: 1, borderTopColor: t.lineSoft }}
                  >
                    <Muted numberOfLines={2}>{st.mined[face.b].s}</Muted>
                    <Text style={{ color: t.brandInk, fontSize: 13, marginTop: 4 }}>
                      Where you heard it
                    </Text>
                  </Pressable>
                ) : null}
                {/* "3 reviews · 1 lapse" sat here until 2026-09-24. The count is
                    still kept (it is what the familiarity ring and the trouble
                    bank read); it is not something to show the learner. */}
              </>
          ) : null}
          </Card>
          </Animated.View>
        </>
      )}

      {/* Chosen from the options screen, the cards are the start: closing the
          picker deals them. */}
      <SetPicker visible={picker} onClose={() => { setPicker(false); if (!started) setStarted(true); }} />
      {/* The goal, reached mid-sitting: a small bubble, once, with the two
          ways on. Keep going closes it and the pile runs on; Something else
          ends the sitting on the ways on (trouble words, new words…). */}
      {goalPop ? (
        <Bubble testID="goal-met" title="Daily goal met" onClose={() => setGoalPop(false)}
                footer={(
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Btn kind="plain" testID="goal-pivot" label="Something else" style={{ flex: 1 }}
                         onPress={() => { setGoalPop(false); setStopped(true); setAt(items.length); setShown(false); setRevealed(false); }} />
                    <Btn kind="pri" testID="goal-keep" label="Keep going" style={{ flex: 1 }}
                         onPress={() => setGoalPop(false)} />
                  </View>
                )}>
          <Muted testID="goal-met-count">{`${goal.done} ${goal.done === 1 ? "card" : "cards"} today`}</Muted>
        </Bubble>
      ) : null}
    </Screen>
  );
}
