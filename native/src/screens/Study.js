/* Study — flashcards with the four Anki buttons, scheduled by FSRS.
 *
 * A card is a curriculum word or, since 2026-09-07, a card from an imported Anki
 * deck (You → decks). Both key their schedule on the Russian string (rule 20.4),
 * so a deck card that is also a curriculum word shares one memory — three
 * memories since Phase 2, one a direction (core/scheduler.js): the word
 * shown, the meaning shown, the word heard.
 *
 * The session is built by core/queue.js, which is where the owner's "131
 * cards, sequential" went: most forgotten first, learning steps when due, new
 * cards rationed and mixed in, siblings buried, twenty at a time, Again back
 * after three others. This screen deals what it is handed and grades what
 * is answered; it does not decide order. */

import React, { useEffect, useMemo, useState } from "react";
import { View, Pressable, Alert, Animated } from "react-native";
import { useSession } from "../session";
import { useTheme, radius, type as T } from "../theme";
import { Screen, Card, Btn, Bar, Pill, Speaker, Muted, List, Row, Senses, SenseList, Tick, SectionLabel, Sheet, Choice, Stepper, Lift, Text } from "../ui";
import { L, UN, STAGES, SPEECH, unitUnlocked, reachedUnits, idxOfWord, sensesOf } from "../data";
import { Linked } from "../words";
import { say } from "../audio";
import { tap as buzzTap } from "../haptics";
import { useFlip } from "../motion";
import { applyGrade, reviewRows, preview, schedulerOpts, wanted, wordTrouble, maxLapses, DIRECTIONS, DEFAULT_FRONTS, cardFor, familiarity } from "@core/scheduler";
import Svg, { Circle } from "react-native-svg";
import { buildSession, requeue, dailyFor, QUEUE_DEFAULTS } from "@core/queue";

/* The three directions as the learner sees them: by what is on the **front**.
 *
 * They were three switches in Settings named "Cards: recognise / produce /
 * listen" — the scheduler's words, not a learner's — and the owner studied for
 * days without finding them, reporting the produce card as "sometimes the card
 * starts in English" and the listen card, whose front is a speaker and nothing
 * else, as "blank". Both are the app working as designed with nothing on the
 * card saying so. The names here say what you will see, and `KIND_LABEL` puts
 * the same word on the card. */
export const FRONTS = [
  ["recognise", "Russian", "You give the meaning"],
  ["produce", "English", "You give the Russian"],
  ["listen", "Sound only", "You give what you heard"],
];
export const KIND_LABEL = { recognise: "Russian", produce: "Meaning", listen: "Listen" };

/* What the reminder says a card is, on the card. `New` is the session's own
   word for it; `Trouble` is the scheduler's (wordTrouble) or the learner's
   (pinned). Neither names the word, so both are safe on the front — a learner
   who is told "this one has been hard" before turning it over is being told
   how to pay attention, not what the answer is. */
export function flagsFor(st, item) {
  if (!item) return { isNew: false, trouble: false, score: null };
  const entry = st.seen[item.word];
  return {
    isNew: item.kind === "new",
    trouble: (!!entry && wordTrouble(entry)) || (st.pinned || []).includes(item.word),
    /* The word's memory, 0–100 (core/scheduler.js familiarity); null while it
       is new, when the New flag says everything there is to say. */
    score: item.kind === "new" ? null : familiarity(cardFor(entry)),
  };
}

/* The familiarity ring's colour at a score: red at nothing, amber halfway,
   green at 100 — `bad`, `warn`, `good`, mixed in RGB between neighbours, so
   every anchor is a token the audit has seen (§24). A stroke, never text. */
export function familiarityColor(score, t) {
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const mix = (a, b, k) => "#" + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * k)
    .toString(16).padStart(2, "0")).join("").toUpperCase();
  const s = Math.max(0, Math.min(100, score));
  return s < 50 ? mix(t.bad, t.warn, s / 50) : mix(t.warn, t.good, (s - 50) / 50);
}

/* The score as a small ring with the number inside — a gauge, read at a
   glance, rather than a figure the learner has to find a scale for. The
   number is `ink` on the card's own surface; only the arc takes the colour. */
export function Familiarity({ score }) {
  const t = useTheme();
  if (score === null || score === undefined) return null;
  const size = 34, w = 3.5, r = (size - w) / 2, c = 2 * Math.PI * r;
  const color = familiarityColor(score, t);
  return (
    <View testID="familiarity" accessibilityLabel={`Familiarity ${score} of 100`}
          style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.surface3} strokeWidth={w} fill="none" />
        <Circle testID="familiarity-arc" cx={size / 2} cy={size / 2} r={r} stroke={color}
                strokeWidth={w} fill="none" strokeLinecap="round"
                strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - score / 100)}
                rotation={-90} originX={size / 2} originY={size / 2} />
      </Svg>
      <Text testID="familiarity-score"
            style={{ color: t.ink, fontSize: 11, fontWeight: "700" }}>{score}</Text>
    </View>
  );
}

export function troubleWords(st) {
  const out = [];
  for (const w in st.seen) if (wordTrouble(st.seen[w])) out.push(w);
  (st.pinned || []).forEach((w) => { if (!out.includes(w)) out.push(w); });
  return out.sort((a, b) => maxLapses(st.seen[b]) - maxLapses(st.seen[a]));
}

/* A card as the screen draws it: `b` is the schedule key, `w` the face. */
const cardOf = (i) => ({ key: "w" + i, w: L[i].w, b: L[i].b, e: L[i].e, x: L[i].x });
const deckCard = (c) => ({ key: "d" + c.ru, w: c.ru, b: c.ru, e: c.en });

/* A whole sentence as a card (the owner, 2026-09-16: *"not just vocabulary
   (individual words) but also sentences… Complete sentences are very
   helpful"* — which is how his own decks are built).
 *
 * The 1,987 rows of `payload.speech` are the right source and not the corpus
 * at large: every one has a real recording, every one is cut to a unit by the
 * coverage rule (§30b), so a sentence card is level-matched and can be *heard*
 * rather than read by the phone. `sentence: true` is what the screen reads to
 * link the Russian and to skip the dictionary entry a sentence does not have.
 *
 * It keys on the sentence string, like a deck card — rule 20.4 keys on what is
 * written, not on an index, so the scheduler needs nothing new to hold one. */
const sentenceCard = (row) => ({ key: "s" + row[0], w: row[0], b: row[0], e: row[1], sentence: true });

/* Every sentence the learner has reached, newest units first so the set leads
   with what they are working on. Both pools: a sentence worth hearing is worth
   saying, and the two overlap by design (§30b stores a shared row list). */
export function sentencesFor(st) {
  const out = [], have = new Set();
  const units = reachedUnits(st);
  for (const u of [...units].reverse()) {
    for (const pool of [SPEECH.listen, SPEECH.speak]) {
      for (const i of (pool || {})[u.id] || []) {
        const row = SPEECH.rows[i];
        if (!row || have.has(row[0])) continue;
        have.add(row[0]);
        out.push(sentenceCard(row));
      }
    }
  }
  return out;
}

/* Every card the ticked sets hold, one of each. */
export function cardsIn(st, sets) {
  const pool = [];
  const have = new Set();
  const add = (card) => { if (!have.has(card.b)) { have.add(card.b); pool.push(card); } };
  const byWord = (w) => {
    const i = idxOfWord(w);
    if (i >= 0) add(cardOf(i));
    // A word the curriculum does not carry: a deck card, or a sentence that
    // is due and whose set is not ticked. Either way the schedule knows it by
    // its Russian and that is all the card needs.
    else add({ key: "d" + w, w, b: w, e: "", sentence: /\s/.test(w) });
  };
  sets.forEach((id) => {
    if (id === "__trouble__") { troubleWords(st).forEach(byWord); return; }
    if (id === "__sentences__") { sentencesFor(st).forEach(add); return; }
    // Everything the scheduler wants today, whichever set it came from — what
    // "Review · N due" on the path opens.
    if (id === "__due__") {
      const now = Date.now();
      for (const w in st.seen) if (wanted(st.seen[w], now, st.learnAhead)) byWord(w);
      return;
    }
    if (id.startsWith("deck:")) {
      const d = (st.decks || []).find((x) => "deck:" + x.id === id);
      if (d) d.cards.forEach((c) => add(deckCard(c)));
      return;
    }
    const u = UN.find((x) => x.id === id);
    if (u) u.w.forEach((i) => add(cardOf(i)));
  });
  return pool;
}

/* The session for what is ticked, from the learner's state. Exported so a test
   can ask for the same session the screen deals. */
export function sessionFor(st, { ahead, rng } = {}) {
  const words = cardsIn(st, st.sets).map((c) => c.b);
  return buildSession({
    seen: st.seen, words, dirs: st.flash || DEFAULT_FRONTS, now: Date.now(), daily: st.daily, rng, ahead,
    opts: { newPerDay: st.newPerDay, reviewsPerDay: st.reviewsPerDay, learnAhead: st.learnAhead,
            scheduler: schedulerOpts(st), rank: newCardRank },
  });
}

/* Which new word to deal first: the commoner one. Lemma indices are assigned
   by frequency at build time (rule 20.4 is about never *keying state* on them;
   reading one as a rank is exactly what they are). A word the curriculum does
   not carry — a deck card the learner imported, a sentence — sorts after the
   curriculum but keeps the order it arrived in, which is the order they chose.

   This is what stops «воспользоваться» opening a beginner's pile (§30ap). */
export const newCardRank = (w) => {
  const i = idxOfWord(w);
  return i >= 0 ? i : Number.MAX_SAFE_INTEGER;
};

export const newDeckId = () => "k" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);

function SetPicker({ visible, onClose }) {
  const { st, update } = useSession();
  const t = useTheme();
  const toggle = (id) => update((p) => ({
    ...p,
    sets: p.sets.includes(id) ? p.sets.filter((x) => x !== id) : p.sets.concat(id),
  }));
  const dueCount = cardsIn(st, ["__due__"]).length;
  const sentenceCount = sentencesFor(st).length;

  const removeDeck = (d) => Alert.alert(
    "Remove deck", `Remove “${d.name}”? Its cards' review history stays.`,
    [{ text: "Cancel", style: "cancel" },
     { text: "Remove", style: "destructive",
       onPress: () => update((p) => ({ ...p, decks: (p.decks || []).filter((x) => x.id !== d.id),
                                       sets: p.sets.filter((x) => x !== "deck:" + d.id) })) }]);

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <Text style={{ flex: 1, color: t.ink, fontSize: 17, fontWeight: "600" }}>
        Practice
      </Text>
      <Btn kind="ghost" label="Select all"
           onPress={() => update((p) => ({
             ...p, sets: UN.filter((u) => unitUnlocked(p, u)).map((u) => u.id) }))} />
      <Btn kind="ghost" label="Clear"
           onPress={() => update((p) => ({ ...p, sets: [] }))} />
    </View>
  );
  /* Just the way out. "Export selected as an Anki deck" stood here and is gone
     (the owner, 2026-09-22: *"remove the anki deck export"*). It answered a
     question nobody was asking in the middle of choosing what to study, and
     the app is where the studying happens — a learner who wants their cards
     elsewhere is a learner leaving. Import moved to Settings, beside backup
     and restore, which is the same family of job: bringing something in. */
  const footer = <Btn kind="pri" label="Done" style={{ marginTop: 8 }} onPress={onClose} />;

  /* How the cards are asked — one way, both ways, or audio only (the owner,
     2026-09-23). A word is one card, so a front chooses nothing about *which*
     cards are dealt, only how each is met; two fronts ticked take turns on
     the same card. These lived in Settings and were never found; a learner
     decides them at the moment of starting, so they are here, where the sets
     are. The last front cannot be unticked — a session with no front is a
     session with no cards, and a control that lets you build one and then
     apologises is worse than one that will not (§30ac made the same rule for
     the drill focus). */
  const fronts = st.flash || DEFAULT_FRONTS;
  const toggleFront = (id) => update((p) => {
    const cur = p.flash || DEFAULT_FRONTS;
    if (cur.includes(id)) return cur.length === 1 ? p : { ...p, flash: cur.filter((d) => d !== id) };
    return { ...p, flash: DIRECTIONS.filter((d) => d === id || cur.includes(d)) };
  });

  return (
    <Sheet visible={visible} onClose={onClose} header={header} footer={footer} maxHeight="88%">
            <View style={{ marginBottom: 18 }}>
              <SectionLabel>Front of the card</SectionLabel>
              <List>
                {FRONTS.map(([id, name, sub]) => (
                  <Row key={id} testID={`flash-${id}`} onPress={() => toggleFront(id)}>
                    <Tick on={fronts.includes(id)} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.ink, fontSize: 15 }}>{name}</Text>
                      <Muted>{sub}</Muted>
                    </View>
                  </Row>
                ))}
              </List>
            </View>
            <View style={{ marginBottom: 18 }}>
              <SectionLabel>New words a day</SectionLabel>
              <Stepper testID="new-per-day" label="New words a day" min={0} max={99}
                       value={st.newPerDay === undefined ? QUEUE_DEFAULTS.newPerDay : st.newPerDay}
                       onChange={(n) => update((p) => ({ ...p, newPerDay: n }))} />
            </View>
            {/* Which voice reads the card — never which cards there are. The
                owner read "Recordings" as a filter and could not see what it
                filtered ("there's a filter option for recorded...no idea what
                that means", 2026-09-22); it sat in a sheet of real filters and
                was named like one. "As recorded" cannot be read that way. The
                recordings are the better sound and stay the default; what they
                cannot be is one speaker, since the collection has four
                sources (§27). */}
            <View style={{ marginBottom: 18 }}>
              <SectionLabel>Voice</SectionLabel>
              <Choice testID="flash-voice" value={st.flashVoice || "recording"}
                      options={[{ id: "recording", name: "As recorded" }, { id: "device", name: "One voice" }]}
                      onPick={(id) => update((p) => ({ ...p, flashVoice: id }))} />
            </View>

            {/* Everything the picker can turn on, it can turn off.
             *
             * "Due today" is what the path's "Review · N due" switches on, and
             * it had no row here — so a learner arriving that way was handed a
             * set they could see the name of, could not find, and could not
             * clear. The owner, 2026-09-11: *"Study mode — it defaults to
             * having the basic set active. Every set of cards should be able to
             * be toggled on or off."* The words it looked like were the first
             * chapter's, because those are what is due early on. */}
            <View style={{ marginBottom: 18 }}>
              <List>
                <Row testID="set-due" onPress={() => toggle("__due__")}>
                  <Tick on={st.sets.includes("__due__")} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.ink, fontSize: 15 }}>Due today</Text>
                    <Muted>{dueCount + " words"}</Muted>
                  </View>
                </Row>
                {troubleWords(st).length ? (
                  <Row testID="set-trouble" onPress={() => toggle("__trouble__")}>
                    <Tick on={st.sets.includes("__trouble__")} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.ink, fontSize: 15 }}>Trouble words</Text>
                      <Muted>{troubleWords(st).length + " words"}</Muted>
                    </View>
                  </Row>
                ) : null}
                {/* Whole sentences, which is how his own decks are built and
                    the unit a word is actually used in (§26). */}
                {sentenceCount ? (
                  <Row testID="set-sentences" onPress={() => toggle("__sentences__")}>
                    <Tick on={st.sets.includes("__sentences__")} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.ink, fontSize: 15 }}>Sentences</Text>
                      <Muted>{sentenceCount + " you have reached"}</Muted>
                    </View>
                  </Row>
                ) : null}
              </List>
            </View>

            {/* Only listed when there is one. An empty section headed "Your
                decks" over a line explaining how to get some is the app
                advertising a feature on the screen where somebody is trying to
                start studying; importing lives in Settings now. */}
            {(st.decks || []).length ? (
              <View style={{ marginBottom: 18 }}>
                <SectionLabel>Your decks</SectionLabel>
                <List>
                  {(st.decks || []).map((d) => (
                    <Row key={d.id}
                         onPress={() => toggle("deck:" + d.id)}>
                      <Tick on={st.sets.includes("deck:" + d.id)} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: t.ink, fontSize: 15 }}>{d.name}</Text>
                        <Muted>{d.cards.length + " cards"}</Muted>
                      </View>
                      <Btn kind="ghost" label="Remove" onPress={() => removeDeck(d)}
                           style={{ paddingHorizontal: 8 }} />
                    </Row>
                  ))}
                </List>
              </View>
            ) : null}

            {STAGES.map((s, i) => {
              const units = [s.core].concat(s.branches).filter((u) => unitUnlocked(st, u));
              if (!units.length) return null;
              const on = units.every((u) => st.sets.includes(u.id));
              return (
                <View key={s.core.id} style={{ marginBottom: 18 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8,
                                 marginBottom: 8 }}>
                    <SectionLabel style={{ flex: 1, marginBottom: 0 }}>{`Chapter ${s.n || i + 1}`}</SectionLabel>
                    <Btn kind="ghost" label={on ? "Deselect chapter" : "Select chapter"}
                         onPress={() => update((p) => {
                           const ids = units.map((u) => u.id);
                           return { ...p, sets: on
                             ? p.sets.filter((x) => !ids.includes(x))
                             : p.sets.concat(ids.filter((x) => !p.sets.includes(x))) };
                         })} />
                  </View>
                  <List>
                    {units.map((u) => (
                      <Row key={u.id}
                           onPress={() => toggle(u.id)}>
                        <Tick on={st.sets.includes(u.id)} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: t.ink, fontSize: 15 }}>{u.name}</Text>
                          <Muted>{u.w.length + " words"}</Muted>
                        </View>
                      </Row>
                    ))}
                  </List>
                </View>
              );
            })}
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
function Front({ face, direction, device }) {
  const t = useTheme();
  if (direction === "produce") {
    // Meaning first: the same numbered senses, since the question is "which
    // word means all of these?" and one of nine synonyms is a different question.
    // A sentence has a translation rather than senses, so it reads as one line.
    if (face.sentence) {
      return <Text style={{ color: t.ink, fontSize: 20, textAlign: "center" }}>{face.e || "—"}</Text>;
    }
    return face.e ? <Senses e={face.e} size={20} style={{ marginTop: 0 }} />
                  : <Text style={{ color: t.ink, fontSize: 22, fontWeight: "600" }}>—</Text>;
  }
  if (direction === "listen") {
    return (
      <View style={{ alignItems: "center", paddingVertical: 12 }}>
        <Speaker text={face.b} size={64} device={device} />
      </View>
    );
  }
  return (
    <>
      <Text style={{ color: t.ink, fontWeight: "600", textAlign: "center", fontSize: faceSize(face) }}>
        {face.w}
      </Text>
      <View style={{ marginTop: 10 }}><Speaker text={face.b} device={device} /></View>
    </>
  );
}

export default function Study({ navigation }) {
  const { st, update } = useSession();
  const t = useTheme();
  const [picker, setPicker] = useState(false);
  const [session, setSession] = useState(null);   // core/queue.js buildSession
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(false);
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
    for (const c of cardsIn(st, st.sets)) m[c.b] = c;
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.sets, st.decks, st.seen]);
  const chosen = Object.keys(faces).length;        // cards in the sets, due or not

  const deal = (ahead) => {
    setSession(sessionFor(st, { ahead }));
    setAt(0);
    setShown(false);
    setLast(null);
  };
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
    st.sets.join(","),
    (st.decks || []).map((d) => d.id + d.cards.length).join(","),
    (st.flash || []).join(","),
    st.newPerDay, st.reviewsPerDay, st.learnAhead, st.retention,
  ].join("|");
  useEffect(() => { deal(false); }, [setsKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  const names = st.sets.map((id) => id === "__trouble__" ? "Trouble words"
    : id === "__due__" ? "Due today"
    : id.startsWith("deck:") ? ((st.decks || []).find((d) => "deck:" + d.id === id) || {}).name
    : (UN.find((u) => u.id === id) || {}).name).filter(Boolean);

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
  const known = item ? faces[item.word] : null;
  const face = !item ? null
    : known && String(known.w || "").trim() ? known
    : { key: "x" + item.word, w: item.word, b: item.word, e: "",
        sentence: /\s/.test(String(item.word || "")) };
  const blank = !!item && !String(face.w || "").trim();
  // The card as it stands now — a re-queued Again is not the card it was
  // when the session was dealt.
  const current = item ? cardFor(st.seen[item.word]) : null;
  const iv = item ? preview(current, Date.now(), schedulerOpts(st)) : null;
  const senses = face ? sensesOf(idxOfWord(face.b)) : null;
  const flip = useFlip(shown, at);

  /* The Russian side reads itself out: on arrival when it is the front, on
     the turn when it is the back, and a listening card is the recording. A
     tap on the speaker plays it again (audio.js). */
  const device = st.flashVoice === "device";
  /* Keyed on the card, not only on the position. `[at, shown]` alone missed
     the first card of every session: dealing leaves `at` at 0 and `shown` at
     false — their initial values — so React never re-ran this, and only the
     second card onward was read aloud. A listen card first in the pile was a
     speaker button in silence, which is what the owner reported as a blank
     card (2026-09-17). `studyoptions.test.js` holds it. */
  useEffect(() => {
    if (!item || !face) return;
    const russianShowing = item.direction === "produce" ? shown : !shown;
    if (russianShowing) say(face.b, { repeat: false, device });
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
    const rows = reviewRows(st.seen, [{ word, direction, grade: g }], now, "study", schedulerOpts(st));
    const before = { items: items, at, prev: current, trouble: st.trouble, daily: st.daily,
                     row: rows[0] };
    update((prev) => {
      const r = applyGrade(prev.seen, prev.trouble, word, direction, g, now, schedulerOpts(prev));
      const daily = dailyFor(prev.daily, now);
      return {
        ...prev, seen: r.seen, trouble: r.trouble,
        daily: { ...daily, reviews: daily.reviews + 1,
                 new: daily.new + (item.kind === "new" && !item.again ? 1 : 0) },
      };
    }, rows);
    setLast(before);
    const next = g === 1 ? requeue(items, at, item) : items;
    setSession({ ...session, items: next });
    setAt(at + 1);
    setShown(false);
  };

  /* The last answer taken back: the card as it was, the log row gone, the
     session as it stood — the card is in front again, face up. */
  const undo = () => {
    if (!last) return;
    const { row, prev } = last;
    update((p) => {
      // The one card, back as it was — or gone, if the grade was its first.
      const seen = { ...p.seen };
      if (prev) seen[row.word] = { recognise: prev }; else delete seen[row.word];
      return { ...p, seen, trouble: last.trouble, daily: last.daily };
    }, [], [{ word: row.word, direction: row.direction, at: row.at }]);
    setSession({ ...session, items: last.items });
    setAt(last.at);
    setShown(true);
    setLast(null);
  };

  const finished = session && at >= items.length;
  const doneToday = session && session.done;

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
      {!shown ? (
        <Btn kind="pri" label="Show" onPress={() => setShown(true)} />
      ) : (
        <View style={{ flexDirection: "row", gap: 6 }}>
          {/* The four most-pressed controls on the screen go through `Lift`
              like the quiz answers (§30ah): pressed *into* an edge in their own
              colour, not a border that thins. */}
          {[[1, "Again", "bad"], [2, "Hard", "plain"],
            [3, "Good", "good"], [4, "Easy", "pri"]].map(([g, label, kind]) => {
            const fill = kind === "bad" ? t.bad : kind === "good" ? t.good : kind === "pri" ? t.brand : t.surface;
            const edge = kind === "bad" ? t.badDim : kind === "good" ? t.goodDim : kind === "pri" ? t.brandDim : t.surface3;
            const fg = kind === "plain" ? t.ink : kind === "pri" ? t.brandOn : kind === "good" ? t.goodOn : t.badOn;
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
             onPress={() => { setAt(at + 1); setShown(false); }} />
      </View>
    </>
  );

  return (
    <Screen footer={controls}>
      {/* A summary of what is ticked — so it only exists once something is.
          The empty state's button is the way in; this row is the way back. */}
      {names.length ? (
        <List>
          <Row onPress={() => setPicker(true)}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 15 }}>
                {names.length === 1 ? names[0] : `${names.length} sets`}
              </Text>
              <Muted testID="pile">
                {session && session.due ? `${session.due} due` + (session.newLeft ? ` · ${Math.min(session.newLeft, chosen)} new` : "")
                  : `${chosen} cards`}
              </Muted>
            </View>
            <Btn kind="ghost" label="Change" style={{ paddingHorizontal: 8 }} onPress={() => setPicker(true)} />
          </Row>
        </List>
      ) : null}

      {!item ? (
        /* A sentence and one action, with air around them — not a panel. */
        <View style={{ marginTop: 56, alignItems: "center", paddingHorizontal: 24 }}>
          <Text testID="study-state" style={{ color: t.ink, fontSize: T.title, fontWeight: "700", textAlign: "center" }}>
            {finished && items.length && session.remaining ? `${session.remaining} to go.`
              : finished && items.length ? "Set finished."
              : doneToday ? "Done for today."
              : chosen ? "Nothing due today." : "Pick a set to practice."}
          </Text>
          {finished && items.length && session.remaining ? (
            <Btn kind="pri" testID="continue" label={`Continue · ${session.remaining} left`} style={{ marginTop: 20, minWidth: 200 }}
                 onPress={() => deal(false)} />
          ) : finished && items.length ? (
            <Btn kind="pri" label="Go again" style={{ marginTop: 20, minWidth: 200 }}
                 onPress={() => deal(false)} />
          ) : doneToday ? null : chosen ? (
            // The scheduler has nothing to ask; studying ahead is the learner's
            // choice, said as such, not the default.
            <Btn label={`Study ahead · ${chosen} cards`} style={{ marginTop: 20, minWidth: 200 }}
                 onPress={() => deal(true)} />
          ) : (
            <Btn kind="pri" label="Choose what to review" style={{ marginTop: 20, minWidth: 200 }}
                 onPress={() => setPicker(true)} />
          )}
        </View>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 }}>
            <View style={{ flex: 1 }}><Bar value={at / items.length} /></View>
            <Pill testID="progress">{`${at + 1}/${items.length}`}</Pill>
          </View>

          <Animated.View style={flip.style}>
          <Card testID={`card-${item.direction}`} style={{ marginTop: 12, alignItems: "center", paddingVertical: 28 }}>
            {/* A card with no Russian on it at all. It should not be possible
                and it happened, so it says what it is instead of showing an
                empty box — a failure the learner can report is worth more than
                a silent one (rule 20.7's third exemption). Skip moves past it
                and grading still works, so the pile is never stuck. */}
            {/* What kind of card this is, and whether it is new or has been
                hard. On both faces: the caption is what stops a speaker-only
                front reading as an empty card, and a flag is about the card's
                history, never its content, so it gives nothing away. */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6,
                           alignSelf: "stretch", marginBottom: 14 }}>
              <Text testID="card-kind"
                    style={{ flex: 1, color: t.ink3, fontSize: 12, fontWeight: "600",
                             letterSpacing: 1, textTransform: "uppercase" }}>
                {KIND_LABEL[item.direction] || ""}
              </Text>
              {flags.isNew ? <Pill testID="flag-new" tone="brand">New</Pill> : null}
              {flags.trouble ? <Pill testID="flag-trouble" tone="bad">Trouble</Pill> : null}
              {/* How well this card is held, off its own FSRS stability. On
                  both faces for the same reason as the flags: it is about the
                  card's history, so it gives nothing away. */}
              <Familiarity score={flags.score} />
            </View>
            {blank ? (
              <Muted testID="card-blank" style={{ textAlign: "center" }}>
                This card has no word on it
              </Muted>
            ) : !flip.face ? <Front face={face} direction={item.direction} device={device} /> : (
              <>
                {item.direction !== "recognise" ? (
                  <>
                    {/* Word-linked once it has been answered: the sentence is
                        the reason to study a sentence, and a word inside it
                        that the learner did not know is one tap from its
                        entry (§26 — vocabulary lives in context). */}
                    {face.sentence
                      ? <Linked text={face.w} size={faceSize(face)} />
                      : (
                        <Text style={{ color: t.ink, fontWeight: "600", textAlign: "center", fontSize: faceSize(face) }}>
                          {face.w}
                        </Text>
                      )}
                    <View style={{ marginTop: 10 }}><Speaker text={face.b} device={device} /></View>
                  </>
                ) : face.sentence ? (
                  // Shown on the front already, but as plain text; the linked
                  // copy is what makes its words reachable.
                  <View style={{ alignSelf: "stretch", marginTop: 4 }}>
                    <Linked text={face.w} size={faceSize(face)} />
                  </View>
                ) : null}
                {/* Every meaning the word has, numbered and laid out as a
                    dictionary lays them (§30q) — labels and all. Where there are
                    no senses for a word (2% of the curriculum, and every deck
                    card) the translation stands on its own, which is all there
                    is to show. Four at most here: the card is a card, and the
                    full entry is one press away below. */}
                {face.sentence ? (
                  item.direction === "produce" ? null
                    : <Muted size={16} style={{ marginTop: 10, textAlign: "center" }}>{face.e}</Muted>
                ) : item.direction === "produce" && !senses ? null
                  : senses ? <SenseList senses={senses} size={16} max={4} brief style={{ marginTop: 10 }} />
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
                      <View style={{ flex: 1 }}><Linked text={ex.ru} size={16} /></View>
                      <Speaker text={ex.ru} size={32} />
                    </View>
                    <Muted>{ex.en}</Muted>
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
                {/* This card's own record: how often it has come round and when
                    it comes next. The paradigm, the frequency, every example —
                    the full entry — is one tap away rather than copied here. */}
                {current && current.reps ? (
                  <Muted testID="card-history" size={12} style={{ marginTop: 12 }}>
                    {`${current.reps} ${current.reps === 1 ? "review" : "reviews"}`
                     + (current.lapses ? ` · ${current.lapses} ${current.lapses === 1 ? "lapse" : "lapses"}` : "")}
                  </Muted>
                ) : null}
                {idxOfWord(face.b) >= 0 ? (
                  <Btn kind="ghost" label="Full entry" testID="full-entry"
                       style={{ marginTop: 12 }}
                       onPress={() => navigation.navigate("Word", { word: face.b })} />
                ) : null}
              </>
            )}
          </Card>
          </Animated.View>
        </>
      )}

      <SetPicker visible={picker} onClose={() => setPicker(false)} />
    </Screen>
  );
}
