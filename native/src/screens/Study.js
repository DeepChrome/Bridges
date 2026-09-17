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
import { Screen, Card, Btn, Bar, Pill, Speaker, Muted, List, Row, Senses, SenseList, Tick, SectionLabel, Sheet, Text } from "../ui";
import { L, UN, STAGES, SPEECH, unitUnlocked, reachedUnits, idxOfWord, sensesOf } from "../data";
import { Linked } from "../words";
import { importDeck, exportDeck } from "../anki";
import { say } from "../audio";
import { tap as buzzTap } from "../haptics";
import { useFlip } from "../motion";
import { applyGrade, reviewRows, preview, schedulerOpts, wanted, wordTrouble, maxLapses, DIRECTIONS } from "@core/scheduler";
import { buildSession, requeue, bury, dailyFor } from "@core/queue";
import { today } from "@core/util";

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

/* The cards a set holds, for export — every card, due or not. (It used to blank
   `seen` to get past the due filter, which emptied the Trouble set: its words
   are found *through* `seen`.) */
export function cardsOfSets(st, ids) {
  return cardsIn(st, ids).map((c) => ({ ru: c.b, en: c.e || "" }));
}

/* The session for what is ticked, from the learner's state. Exported so a test
   can ask for the same session the screen deals. */
export function sessionFor(st, { ahead, rng } = {}) {
  const words = cardsIn(st, st.sets).map((c) => c.b);
  return buildSession({
    seen: st.seen, words, dirs: st.flash || DIRECTIONS, now: Date.now(), daily: st.daily, rng, ahead,
    opts: { newPerDay: st.newPerDay, reviewsPerDay: st.reviewsPerDay, learnAhead: st.learnAhead,
            scheduler: schedulerOpts(st) },
  });
}

export const newDeckId = () => "k" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);

function SetPicker({ visible, onClose }) {
  const { st, update } = useSession();
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const toggle = (id) => update((p) => ({
    ...p,
    sets: p.sets.includes(id) ? p.sets.filter((x) => x !== id) : p.sets.concat(id),
  }));
  const dueCount = cardsIn(st, ["__due__"]).length;
  const sentenceCount = sentencesFor(st).length;

  const doImport = async () => {
    setBusy(true);
    const res = await importDeck();
    setBusy(false);
    if (res.cancelled) return;
    if (res.error) { Alert.alert("Import", res.error); return; }
    const added = res.decks.map((d) => ({ id: newDeckId(), name: d.name, cards: d.cards, added: today() }));
    update((p) => ({ ...p, decks: (p.decks || []).concat(added),
                     sets: p.sets.concat(added.map((d) => "deck:" + d.id)) }));
    const n = added.reduce((a, d) => a + d.cards.length, 0);
    Alert.alert("Imported", `${n} cards in ${added.length} ${added.length === 1 ? "deck" : "decks"}.`);
  };

  const doExport = async (name, ids) => {
    const cards = cardsOfSets(st, ids);
    if (!cards.length) { Alert.alert("Export", "Nothing to export."); return; }
    setBusy(true);
    try {
      await exportDeck(name, cards);
    } catch (e) {
      Alert.alert("Export", "The deck could not be written.");
    }
    setBusy(false);
  };

  const removeDeck = (d) => Alert.alert(
    "Remove deck", `Remove “${d.name}”? Its cards' review history stays.`,
    [{ text: "Cancel", style: "cancel" },
     { text: "Remove", style: "destructive",
       onPress: () => update((p) => ({ ...p, decks: (p.decks || []).filter((x) => x.id !== d.id),
                                       sets: p.sets.filter((x) => x !== "deck:" + d.id) })) }]);

  const selectedNames = st.sets.map((id) => id === "__trouble__" ? "Trouble words"
    : id.startsWith("deck:") ? ((st.decks || []).find((d) => "deck:" + d.id === id) || {}).name
    : (UN.find((u) => u.id === id) || {}).name).filter(Boolean);

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <Text style={{ flex: 1, color: t.ink, fontSize: 17, fontWeight: "600" }}>
        Practise
      </Text>
      <Btn kind="ghost" label="Select all"
           onPress={() => update((p) => ({
             ...p, sets: UN.filter((u) => unitUnlocked(p, u)).map((u) => u.id) }))} />
      <Btn kind="ghost" label="Clear"
           onPress={() => update((p) => ({ ...p, sets: [] }))} />
    </View>
  );
  const footer = (
    <>
      {st.sets.length ? (
        <Btn label={busy ? "Working…" : "Export selected as an Anki deck"} disabled={busy}
             style={{ marginTop: 8 }}
             onPress={() => doExport(selectedNames.length === 1 ? selectedNames[0] : "Bridges", st.sets)} />
      ) : null}
      <Btn kind="pri" label="Done" style={{ marginTop: 8 }} onPress={onClose} />
    </>
  );

  return (
    <Sheet visible={visible} onClose={onClose} header={header} footer={footer} maxHeight="88%">
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

            <View style={{ marginBottom: 18 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <SectionLabel style={{ flex: 1, marginBottom: 0 }}>Your decks</SectionLabel>
                <Btn kind="ghost" label={busy ? "Working…" : "Import"} disabled={busy}
                     onPress={doImport} />
              </View>
              {(st.decks || []).length ? (
                <List>
                  {(st.decks || []).map((d) => (
                    <Row key={d.id}
                         onPress={() => toggle("deck:" + d.id)}>
                      <Tick on={st.sets.includes("deck:" + d.id)} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: t.ink, fontSize: 15 }}>{d.name}</Text>
                        <Muted>{d.cards.length + " cards"}</Muted>
                      </View>
                      <Btn kind="ghost" label="Export" onPress={() => doExport(d.name, ["deck:" + d.id])}
                           style={{ paddingHorizontal: 8 }} />
                      <Btn kind="ghost" label="Remove" onPress={() => removeDeck(d)}
                           style={{ paddingHorizontal: 8 }} />
                    </Row>
                  ))}
                </List>
              ) : (
                <Muted>Import an Anki deck (.apkg) or its text export.</Muted>
              )}
            </View>

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

export default function Study({ navigation }) {
  const { st, update } = useSession();
  const t = useTheme();
  const [picker, setPicker] = useState(false);
  const [session, setSession] = useState(null);   // core/queue.js buildSession
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(false);
  const [last, setLast] = useState(null);         // the answer just given, for Undo

  const faces = useMemo(() => {
    const m = {};
    for (const c of cardsIn(st, st.sets)) m[c.b] = c;
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.sets, st.decks, st.seen === undefined]);
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
  const setsKey = st.sets.join(",") + "|" + (st.decks || []).map((d) => d.id + d.cards.length).join(",")
    + "|" + (st.flash || []).join(",");
  useEffect(() => { deal(false); }, [setsKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  const names = st.sets.map((id) => id === "__trouble__" ? "Trouble words"
    : id === "__due__" ? "Due today"
    : id.startsWith("deck:") ? ((st.decks || []).find((d) => "deck:" + d.id === id) || {}).name
    : (UN.find((u) => u.id === id) || {}).name).filter(Boolean);

  const items = session ? session.items : [];
  const item = items[at] || null;
  const face = item ? faces[item.word] : null;
  // The card as it stands now — a re-queued Again is not the card it was
  // when the session was dealt.
  const current = item ? ((st.seen[item.word] || {})[item.direction] || null) : null;
  const iv = item ? preview(current, Date.now(), schedulerOpts(st)) : null;
  const senses = face ? sensesOf(idxOfWord(face.b)) : null;
  const flip = useFlip(shown, at);

  /* The Russian side reads itself out: on arrival when it is the front, on
     the turn when it is the back, and a listening card is the recording. A
     tap on the speaker plays it again (audio.js). */
  useEffect(() => {
    if (!item || !face) return;
    const russianShowing = item.direction === "produce" ? shown : !shown;
    if (russianShowing) say(face.b, { repeat: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, shown]);

  const grade = (g) => {
    /* The weight of the button, not a verdict. Nothing here is right or wrong
       — the learner is reporting how it went, and a phone that buzzed "wrong"
       at an honest Again would be arguing with them. */
    buzzTap();
    const now = Date.now();
    const word = item.word, direction = item.direction;
    const rows = reviewRows(st.seen, [{ word, direction, grade: g }], now, "study", schedulerOpts(st));
    const before = { items: items, at, prev: current, trouble: st.trouble, xp: st.xp, daily: st.daily,
                     row: rows[0] };
    update((prev) => {
      const r = applyGrade(prev.seen, prev.trouble, word, direction, g, now, schedulerOpts(prev));
      const daily = dailyFor(prev.daily, now);
      return {
        ...prev, seen: r.seen, trouble: r.trouble,
        xp: (prev.xp || 0) + (g === 1 ? 0 : 1),
        daily: { ...daily, reviews: daily.reviews + 1,
                 new: daily.new + (item.kind === "new" && !item.again ? 1 : 0) },
      };
    }, rows);
    setLast(before);
    let next = bury(items, at, word, direction);
    if (g === 1) next = requeue(next, at, item);
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
      const entry = { ...(p.seen[row.word] || {}) };
      if (prev) entry[row.direction] = prev; else delete entry[row.direction];
      const seen = { ...p.seen };
      if (Object.keys(entry).length) seen[row.word] = entry; else delete seen[row.word];
      return { ...p, seen, trouble: last.trouble, xp: last.xp, daily: last.daily };
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
          {[[1, "Again", "bad"], [2, "Hard", "plain"],
            [3, "Good", "good"], [4, "Easy", "pri"]].map(([g, label, kind]) => (
            <Pressable
              key={g}
              testID={`grade-${g}`}
              accessibilityRole="button"
              onPress={() => grade(g)}
              style={{ flex: 1, alignItems: "center", paddingVertical: 11,
                       borderRadius: radius.md, borderWidth: 1, borderBottomWidth: 3,
                       borderColor: kind === "bad" ? t.badDim : kind === "good" ? t.goodDim
                                  : kind === "pri" ? t.brandDim : t.line,
                       backgroundColor: kind === "bad" ? t.bad : kind === "good" ? t.good
                                      : kind === "pri" ? t.brand : t.surface }}
            >
              <Text style={{ fontWeight: "600", fontSize: 13,
                             color: kind === "plain" ? t.ink
                                  : kind === "pri" ? t.brandOn
                                  : kind === "good" ? t.goodOn : t.badOn }}>
                {label}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: "500",
                             color: kind === "plain" ? t.ink2
                                  : kind === "pri" ? t.brandOn
                                  : kind === "good" ? t.goodOn : t.badOn }}>
                {iv[g].label}
              </Text>
            </Pressable>
          ))}
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
              : chosen ? "Nothing due today." : "Pick a set to practise."}
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
            {!flip.face ? <Front face={face} direction={item.direction} /> : (
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
                    <Linked text={ex.ru} size={16} />
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
