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

import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Pressable, Alert, Animated } from "react-native";
import { useSession } from "../session";
import { useTheme, radius, type as T } from "../theme";
import { Screen, Card, Btn, Bar, Pill, Speaker, Muted, List, Row, Senses, SenseList, Tick, SectionLabel, Sheet, Stepper, Lift, Text, CogButton,
         Familiarity, familiarityColor } from "../ui";
import { L, UN, STAGES, SPEECH, unitUnlocked, reachedUnits, idxOfWord, sensesOf, rankOf } from "../data";
import { Linked } from "../words";
import { say } from "../audio";
import { tap as buzzTap } from "../haptics";
import { useFlip } from "../motion";
import { applyGrade, reviewRows, preview, schedulerOpts, wanted, troubleWords as troubleBank, DIRECTIONS, DEFAULT_FRONTS, cardFor, familiarity } from "@core/scheduler";
import { isIrregular } from "@core/facts";
import { buildSession, practiceSession, requeue, dailyFor, QUEUE_DEFAULTS, cardKind, kindsOf, CARD_KINDS }
  from "@core/queue";

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
   word for it; `Trouble` is the scheduler's bank (core/scheduler.js
   troubleWords — the worst twenty, judged only once a card has been seen
   enough) or the learner's (pinned). Neither names the word, so both are safe
   on the front — a learner who is told "this one has been hard" before turning
   it over is being told how to pay attention, not what the answer is. */
export function flagsFor(st, item) {
  if (!item) return { isNew: false, trouble: false, score: null };
  const entry = st.seen[item.word];
  return {
    isNew: item.kind === "new",
    trouble: troubleWords(st).includes(item.word),
    /* The word's memory, 0–100 (core/scheduler.js familiarity); null while it
       is new, when the New flag says everything there is to say. */
    score: item.kind === "new" ? null : familiarity(cardFor(entry), rankOf(item.word)),
    /* A word that breaks the rules says so on the back (2026-09-29). */
    irregular: (() => { const i = idxOfWord(item.word); return i >= 0 && isIrregular(L[i]); })(),
  };
}

/* The familiarity ring and its colour live in ui.js now (2026-09-28): the
   dictionary entry draws the same ring for the same number, and a second copy
   here is how the two would come to disagree. Re-exported for the tests that
   import it from here. */
export { familiarityColor, Familiarity };

/* The scheduler's bank, worst first and capped, then whatever the learner
   pinned by hand. */
export function troubleWords(st) {
  const out = troubleBank(st.seen);
  (st.pinned || []).forEach((w) => { if (!out.includes(w)) out.push(w); });
  return out;
}

/* A card as the screen draws it: `b` is the schedule key, `w` the face. */
const cardOf = (i) => ({ key: "w" + i, w: L[i].w, b: L[i].b, e: L[i].e, x: L[i].x });
const deckCard = (c) => ({ key: "d" + c.ru, w: c.ru, b: c.ru, e: c.en, sentence: /\s/.test(c.ru) });

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
   with what they are working on — and then on along the route until there are
   at least SENTENCE_POOL_MIN of them (the owner, 2026-09-24: *"sentences are
   some of the best ways of learning… I'd like to have many many more"*; a
   chapter-1 learner reached about fifty). A sentence from further along has a
   word or two not yet taught, and on a card that is a tap away from its entry —
   the same trade shadowing makes (§30aq). Both pools: a sentence worth hearing
   is worth saying, and the two overlap by design (§30b stores a shared row
   list). */
export const SENTENCE_POOL_MIN = 400;
export function sentencesFor(st) {
  const out = [], have = new Set();
  const units = reachedUnits(st);
  const take = (u) => {
    for (const pool of [SPEECH.listen, SPEECH.speak]) {
      for (const i of (pool || {})[u.id] || []) {
        const row = SPEECH.rows[i];
        if (!row || have.has(row[0])) continue;
        have.add(row[0]);
        out.push(sentenceCard(row));
      }
    }
  };
  for (const u of [...units].reverse()) take(u);
  const reached = new Set(units.map((u) => u.id));
  for (const u of UN) {
    if (out.length >= SENTENCE_POOL_MIN) break;
    if (!reached.has(u.id)) take(u);
  }
  return out;
}

/* A pooled sentence by its own text, built once on first use. */
let sentenceRows = null;
const sentenceRow = (ru) => {
  if (!sentenceRows) {
    sentenceRows = new Map();
    for (const row of SPEECH.rows || []) if (!sentenceRows.has(row[0])) sentenceRows.set(row[0], row);
  }
  return sentenceRows.get(ru) || null;
};
/* An imported deck's card by its Russian: the first deck that carries it. */
const deckCardOf = (st, ru) => {
  for (const d of st.decks || []) {
    const c = d.cards.find((x) => x.ru === ru);
    if (c) return deckCard(c);
  }
  return null;
};

/* Every card the ticked sets hold, one of each. */
export function cardsIn(st, sets, words = []) {
  const pool = [];
  const have = new Set();
  const add = (card) => { if (!have.has(card.b)) { have.add(card.b); pool.push(card); } };
  const byWord = (w) => {
    const i = idxOfWord(w);
    if (i >= 0) { add(cardOf(i)); return; }
    // A card the curriculum does not carry: a pooled sentence or a deck card
    // that is due. The schedule knows it only by its Russian, so its English
    // is looked up where it came from. It used to be left blank, and every
    // due sentence turned over to its Russian again with no meaning under it
    // (the owner, 2026-09-29: "I was expecting English on the other side").
    const row = sentenceRow(w);
    if (row) { add(sentenceCard(row)); return; }
    const dc = deckCardOf(st, w);
    add(dc || { key: "d" + w, w, b: w, e: "", sentence: /\s/.test(w) });
  };
  sets.forEach((id) => {
    if (id === "__trouble__") { troubleWords(st).forEach(byWord); return; }
    if (id === "__sentences__") { sentencesFor(st).forEach(add); return; }
    // Where the learner is on the path: every unit reached so far.
    if (id === "__path__") { reachedUnits(st).forEach((u) => u.w.forEach((i) => add(cardOf(i)))); return; }
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
  words.forEach(byWord);   // a list handed in by word, such as a video's
  return pool;
}

/* Where new cards come from: the ticked sources (the path, chapters, decks),
   and the sentence pool when sentences are chosen — only of the kinds chosen. */
export function sourceCards(st) {
  const kinds = kindsOf(st.cardKinds);
  const ids = (st.sets || []).filter((id) => id !== "__due__" && id !== "__trouble__" && id !== "__sentences__");
  if (kinds.includes("sentences")) ids.push("__sentences__");
  return cardsIn(st, ids).filter((c) => kinds.includes(cardKind(c.b)));
}

/* Every card the session may deal, one of each: everything due of the chosen
   kinds — **whatever is ticked** — then the sources' cards for new ones.
 *
 * The session used to be the ticked sets alone, and "Due today" was a set
 * like any other. The owner, 2026-09-28: the Study badge said about 150 due,
 * and the pile dealt the trouble words he had ticked in the picker and then
 * said "Done for today". The badge counted every due card and the session
 * could not reach them — the stranding §30aa named, from the other side.
 * Anki's rule is the one wanted: what is due is always due, and new cards
 * enter at the day's rate. `dueCount` filters by the same kinds, so the two
 * numbers are one number. */
export function studyCards(st) {
  const kinds = kindsOf(st.cardKinds);
  const due = cardsIn(st, ["__due__"]).filter((c) => kinds.includes(cardKind(c.b)));
  const out = [], have = new Set();
  for (const c of due.concat(sourceCards(st))) if (!have.has(c.b)) { have.add(c.b); out.push(c); }
  return out;
}

/* The session from the learner's state. Exported so a test can ask for the
   same session the screen deals. `round: "trouble"` is the extra round of
   trouble words offered once the day is done; `round: "list"` is a round on
   `words` handed in by another screen — a video's word list before watching
   it (§30bf) — carrying its own faces, since those words need not be in any
   ticked set. */
export function sessionFor(st, { ahead, rng, round, words: list, title } = {}) {
  if (round === "trouble") {
    return practiceSession({ seen: st.seen, words: troubleWords(st), dirs: st.flash || DEFAULT_FRONTS });
  }
  if (round === "list") {
    const cards = cardsIn(st, [], list || []);
    const faces = {};
    for (const c of cards) faces[c.b] = c;
    return { ...practiceSession({ seen: st.seen, words: cards.map((c) => c.b), dirs: st.flash || DEFAULT_FRONTS,
                                  size: cards.length }),
             title, faces };
  }
  const words = studyCards(st).map((c) => c.b);
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

   This is what stops «воспользоваться» opening a beginner's pile (§30ap).

   **A sentence is as common as its rarest word** (the owner, 2026-09-28:
   *"words that are more useful and common should be front loaded. Same with
   simpler sentences… when in doubt, prioritize more common and useful
   words"*). Sentences used to sort after every word and then in the order
   their units were reached — newest first — so the simple ones had no
   advantage at all. Each is ranked now by the least common word in it, with
   a little for length, on the same scale as the words, so «Где книга?» comes
   among the commonest words and a twelve-word sentence with «одолжить» in it
   comes near «одолжить». A word the lexicon does not resolve counts as rare. */
export const RARE_RANK = 5000;
const wordRank = (w) => {
  const r = rankOf(w);
  if (r) return r - 1;
  const i = idxOfWord(w);
  return i >= 0 ? i : RARE_RANK;
};
export const newCardRank = (w) => {
  if (cardKind(w) === "words") {
    const r = wordRank(w);
    // A deck card the curriculum does not carry keeps the order it came in.
    return r === RARE_RANK && idxOfWord(w) < 0 ? Number.MAX_SAFE_INTEGER : r;
  }
  const toks = String(w).match(/[А-Яа-яЁё́-]+/g) || [];
  if (!toks.length) return Number.MAX_SAFE_INTEGER;
  const rarest = Math.max(...toks.map((t) => { const i = idxOfWord(t); return i >= 0 ? i : RARE_RANK; }));
  return rarest + 10 * toks.length;
};

export const newDeckId = () => "k" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);

function SetPicker({ visible, onClose }) {
  const { st, update } = useSession();
  const t = useTheme();
  const toggle = (id) => update((p) => ({
    ...p,
    sets: p.sets.includes(id) ? p.sets.filter((x) => x !== id) : p.sets.concat(id),
  }));
  /* Words, sentences or both. The last one cannot be unticked — a session of
     no kind of card is a session of nothing (§30ac's rule). */
  const kinds = kindsOf(st.cardKinds);
  const toggleKind = (id) => update((p) => {
    const cur = kindsOf(p.cardKinds);
    if (cur.includes(id)) return cur.length === 1 ? p : { ...p, cardKinds: cur.filter((k) => k !== id) };
    return { ...p, cardKinds: CARD_KINDS.filter((k) => k === id || cur.includes(k)) };
  });

  const removeDeck = (d) => Alert.alert(
    "Remove deck", `Remove “${d.name}”? Its cards' review history stays.`,
    [{ text: "Cancel", style: "cancel" },
     { text: "Remove", style: "destructive",
       onPress: () => update((p) => ({ ...p, decks: (p.decks || []).filter((x) => x.id !== d.id),
                                       sets: p.sets.filter((x) => x !== "deck:" + d.id) })) }]);

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <Text style={{ flex: 1, color: t.ink, fontSize: 17, fontWeight: "600" }}>
        Study options
      </Text>
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
            {/* Words, sentences or both (the owner, 2026-09-28). Decides the
                due cards dealt as well as the new ones, and the badge counts
                the same kinds. Sentences are how his own decks are built and
                the unit a word is actually used in (§26). */}
            <View style={{ marginBottom: 18 }}>
              <SectionLabel>Study</SectionLabel>
              <List>
                {[["words", "Words"], ["sentences", "Sentences"]].map(([id, name]) => (
                  <Row key={id} testID={`kind-${id}`} onPress={() => toggleKind(id)}>
                    <Tick on={kinds.includes(id)} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.ink, fontSize: 15 }}>{name}</Text>
                    </View>
                  </Row>
                ))}
              </List>
            </View>
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
            {/* "Voice — As recorded / One voice" stood here until 2026-09-29.
                It existed because the collection's recordings came from four
                readers (§27); since every curriculum word and every pooled
                sentence is one bought voice, the choice had nothing left to
                choose, and the owner could not tell what it did — so it went. */}

            {/* Where new cards come from. What is due is not here: it is in
                every session whatever is ticked (studyCards), so no tick can
                leave the badge promising cards the pile will not deal — which
                is what "Due today" and "Trouble words" as sets did (2026-09-28).
                Your path is the default: the units reached so far. */}
            <View style={{ marginBottom: 18 }}>
              <SectionLabel>New cards from</SectionLabel>
              <List>
                <Row testID="set-path" onPress={() => toggle("__path__")}>
                  <Tick on={st.sets.includes("__path__")} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.ink, fontSize: 15 }}>Your path</Text>
                  </View>
                </Row>
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
function Front({ face, direction }) {
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
        <Speaker text={face.b} size={64} />
      </View>
    );
  }
  return (
    <>
      <Text style={{ color: t.ink, fontWeight: "600", textAlign: "center", fontSize: faceSize(face) }}>
        {face.w}
      </Text>
      <View style={{ marginTop: 10 }}><Speaker text={face.b} /></View>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.sets, st.decks, st.seen, st.cardKinds]);
  // Cards not yet met that the sources could introduce — what "Study ahead" offers.
  const unmet = useMemo(() => sourceCards(st).filter((c) => !st.seen[c.b]).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [st.sets, st.decks, st.seen, st.cardKinds]);
  const trouble = troubleWords(st);

  const dealt = useRef(0);   // which deal this is, for "read once per card"
  const deal = (ahead, round, extra) => {
    dealt.current += 1;
    setSession(sessionFor(st, { ahead, round, ...extra }));
    setAt(0);
    setShown(false); setRevealed(false);
    setLast(null);
  };
  /* The trouble round, asked for from elsewhere — You's trouble sheet. A
     route param rather than a tick in the picker, so it is one round and
     leaves the day's settings as they were. */
  const params = (route && route.params) || {};
  const round = params.round === "trouble" || params.round === "list" ? params.round : null;
  useEffect(() => {
    if (!round || !ready) return;
    dealtKey.current = setsKey;   // the round stands until the settings change
    deal(false, round, { words: params.words, title: params.title });
    navigation.setParams({ round: undefined, words: undefined, title: undefined });
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
    st.newPerDay, st.reviewsPerDay, st.learnAhead, st.retention,
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
  useEffect(() => {
    if (!ready || picker || round || dealtKey.current === setsKey) return;
    dealtKey.current = setsKey;
    deal(false);
  }, [setsKey, ready, picker]);   // eslint-disable-line react-hooks/exhaustive-deps

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
  const senses = face ? sensesOf(idxOfWord(face.b)) : null;
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
    setShown(false); setRevealed(false);
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
    const s = sessionFor(st);
    return s.items.length + s.remaining;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, items.length, st.seen, st.daily, setsKey]);
  /* **The pile goes on until the day is done** (the owner, 2026-09-29: "when
     I finish my review… it randomly says '3 to go'"). A session is dealt
     twenty at a time and the cards just missed come back within minutes, so
     there was a screen between chunks announcing a number nobody had asked
     about. The next chunk is simply dealt; the only stop is the end of the
     day's work. Not after a trouble round, which ends on its own screen. */
  useEffect(() => {
    if (finished && more > 0 && session && !session.practice) deal(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, more]);
  const reviewedToday = dailyFor(st.daily, Date.now()).reviews;

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
        <View style={{ flex: 1 }}>
          <Text testID="study-heading" style={{ color: t.ink, fontSize: 15 }}>{heading}</Text>
          <Muted testID="pile">
            {session && session.practice ? `${items.length} cards`
              : session && (session.due || session.newLeft)
                ? [session.due ? `${session.due} due` : "", session.newLeft ? `${Math.min(session.newLeft, unmet)} new` : ""]
                    .filter(Boolean).join(" · ")
                : "Nothing due"}
          </Muted>
        </View>
        <CogButton testID="study-cog" label="Study options" onPress={() => setPicker(true)} />
      </View>

      {!item ? (
        /* A sentence and its actions, with air around them — not a panel.
           The day's pile first; once it is empty, the day is done and what
           is left is the learner's choice: another round on the trouble words
           (the owner, 2026-09-28), or new cards ahead of schedule. */
        /* The day's goal, met — said as such (the owner, 2026-09-29: "they
           should be congratulated and notified on meeting their daily goal
           and presented with the option of continuing… review trouble words
           or be exposed to new words"). Between chunks nothing is drawn: the
           next one is dealt at once (the effect above). */
        more && !(session && session.practice) ? null : (
        <View style={{ marginTop: 56, alignItems: "center", paddingHorizontal: 24 }}>
          {session && session.practice && finished ? (
            <Text testID="study-state" style={{ color: t.ink, fontSize: T.title, fontWeight: "700", textAlign: "center" }}>
              Round finished.
            </Text>
          ) : reviewedToday ? (
            <>
              <Tick on size={56} />
              <Text testID="study-state"
                    style={{ color: t.ink, fontSize: T.title, fontWeight: "700", textAlign: "center", marginTop: 14 }}>
                Daily goal met
              </Text>
              <Muted testID="study-today" style={{ marginTop: 4 }}>
                {`${reviewedToday} ${reviewedToday === 1 ? "card" : "cards"} today`}
              </Muted>
            </>
          ) : (
            <Text testID="study-state" style={{ color: t.ink, fontSize: T.title, fontWeight: "700", textAlign: "center" }}>
              Nothing due today.
            </Text>
          )}
          {session && session.practice && more ? (
            <Btn kind="pri" testID="continue" label={`Back to today's cards · ${more}`}
                 style={{ marginTop: 20, minWidth: 220 }} onPress={() => deal(false)} />
          ) : null}
          {trouble.length ? (
            <Btn kind={session && session.practice && more ? "plain" : "pri"} testID="trouble-round"
                 style={{ marginTop: 20, minWidth: 220 }}
                 label={`Review trouble words · ${trouble.length}`}
                 onPress={() => deal(false, "trouble")} />
          ) : null}
          {unmet ? (
            <Btn testID="study-ahead" style={{ marginTop: 12, minWidth: 220 }}
                 label="Learn new words" onPress={() => deal(true)} />
          ) : null}
        </View>
        )
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 }}>
            <View style={{ flex: 1 }}><Bar value={at / items.length} /></View>
            <Pill testID="progress">{`${at + 1}/${items.length}`}</Pill>
          </View>

          {/* Once revealed, a tap on the card turns it — back to the front to
              look again, and over once more — while the grade buttons stay. */}
          <Pressable testID="card-turn" accessibilityRole={revealed ? "button" : undefined}
                     accessibilityLabel={revealed ? "Turn the card" : undefined}
                     onPress={revealed ? () => setShown(!shown) : undefined}>
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
              {/* On the back only (the owner, 2026-09-29): the front is the
                  question, and a score beside it is something else to look
                  at before answering. */}
              {flip.face && flags.irregular ? <Pill tone="irregular" testID="flag-irregular">Irregular</Pill> : null}
              {flip.face ? <Familiarity score={flags.score} /> : null}
            </View>
            {blank ? (
              <Muted testID="card-blank" style={{ textAlign: "center" }}>
                This card has no word on it
              </Muted>
            ) : !flip.face ? <Front face={face} direction={item.direction} /> : (
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
                    <View style={{ marginTop: 10 }}><Speaker text={face.b} /></View>
                  </>
                ) : (
                  <>
                    {face.sentence ? (
                      // Shown on the front already, but as plain text; the linked
                      // copy is what makes its words reachable.
                      <View style={{ alignSelf: "stretch", marginTop: 4 }}>
                        <Linked text={face.w} size={faceSize(face)} />
                      </View>
                    ) : null}
                    {/* The Russian can be heard from the back as well as the
                        front (the owner, 2026-09-24) — always the Russian,
                        never the meaning. */}
                    <View style={{ marginTop: 10 }}><Speaker text={face.b} /></View>
                  </>
                )}
                {/* Every meaning the word has, numbered and laid out as a
                    dictionary lays them (§30q) — labels and all. Where there are
                    no senses for a word (2% of the curriculum, and every deck
                    card) the translation stands on its own, which is all there
                    is to show. Four at most here: the card is a card, and the
                    full entry is one press away below. */}
                {/* A sentence's English is the answer on its back, so it reads
                    as one — ink, not a grey footnote under the Russian. */}
                {face.sentence ? (
                  item.direction === "produce" ? null
                    : <Text testID="card-meaning"
                            style={{ color: t.ink, fontSize: 18, marginTop: 12, textAlign: "center" }}>
                        {face.e || "—"}
                      </Text>
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
                {/* "3 reviews · 1 lapse" sat here until 2026-09-24. The count is
                    still kept (it is what the familiarity ring and the trouble
                    bank read); it is not something to show the learner. */}
                {idxOfWord(face.b) >= 0 ? (
                  <Btn kind="ghost" label="Full entry" testID="full-entry"
                       style={{ marginTop: 12 }}
                       onPress={() => navigation.navigate("Word", { word: face.b })} />
                ) : null}
              </>
            )}
          </Card>
          </Animated.View>
          </Pressable>
        </>
      )}

      <SetPicker visible={picker} onClose={() => setPicker(false)} />
    </Screen>
  );
}
