/* Study — flashcards with the four Anki buttons, scheduled by FSRS.
 *
 * A card is a curriculum word or, since 2026-09-07, a card from an imported Anki
 * deck (You → decks). Both key their schedule on the Russian string (rule 20.4),
 * so a deck card that is also a curriculum word shares one memory. */

import React, { useEffect, useState } from "react";
import { View, Pressable, Alert } from "react-native";
import { useSession } from "../session";
import { useTheme, radius, type as T } from "../theme";
import { Screen, Card, Btn, Bar, Pill, Speaker, Muted, List, Row, Senses, SenseList, Tick, SectionLabel, Sheet, Text, TextInput } from "../ui";
import { L, UN, STAGES, unitUnlocked, idxOfWord, sensesOf } from "../data";
import { Linked } from "../words";
import { importDeck, exportDeck } from "../anki";
import { fsrsPreview, isTrouble, applyGrade } from "@core/fsrs";
import { shuffle, today } from "@core/util";

export function troubleWords(st) {
  const out = [];
  for (const w in st.seen) if (isTrouble(st.seen[w])) out.push(w);
  (st.pinned || []).forEach((w) => { if (!out.includes(w)) out.push(w); });
  return out.sort((a, b) => ((st.seen[b] || {}).lapses || 0) -
                            ((st.seen[a] || {}).lapses || 0));
}

/* A card as the screen draws it: `b` is the schedule key, `w` the face. */
const cardOf = (i) => ({ key: "w" + i, w: L[i].w, b: L[i].b, e: L[i].e, x: L[i].x });
const deckCard = (c) => ({ key: "d" + c.ru, w: c.ru, b: c.ru, e: c.en });

/* Higher is more urgent: banked trouble first, then most overdue, then unseen. */
function weight(st, card) {
  const w = card.b;
  const c = st.seen[w];
  let score = 0;
  if (st.trouble[w] || (c && isTrouble(c))) score += 1000;
  if (!c) return score + 50;
  score += Math.max(0, today() - c.due) * 10;
  score += (c.lapses || 0) * 20 + (c.d || 0);
  return score;
}

/* Every card the ticked sets hold, one of each. */
export function cardsIn(st, sets) {
  const pool = [];
  const have = new Set();
  const add = (card) => { if (!have.has(card.b)) { have.add(card.b); pool.push(card); } };
  const byWord = (w) => {
    const i = idxOfWord(w);
    if (i >= 0) add(cardOf(i));
    else add({ key: "d" + w, w, b: w, e: "" });
  };
  sets.forEach((id) => {
    if (id === "__trouble__") { troubleWords(st).forEach(byWord); return; }
    // Everything the scheduler wants today, whichever set it came from — what
    // "Review · N due" on the path opens.
    if (id === "__due__") {
      const t = today();
      for (const w in st.seen) if (st.seen[w].due <= t) byWord(w);
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

/* Only what is ticked. With nothing ticked the queue is empty and the screen says
   so — it used to fall back to the first unit's words, which read as a set of
   common words that could not be switched off (the owner, 2026-09-07). */
export function buildQueue(st, limit, ahead) {
  const pool = cardsIn(st, st.sets);
  const t = today();
  // What is due, and new cards; the whole set only when asked to study ahead —
  // it used to fall through to everything silently, so "nothing due" never showed.
  let q = pool.filter((c) => { const s = st.seen[c.b]; return !s || s.due <= t; });
  if (ahead) q = pool.slice();
  if (limit) {
    q.sort((a, b) => weight(st, b) - weight(st, a));
    q = q.slice(0, limit);
  }
  return q;
}

/* The cards a set holds, for export — every card, due or not. (It used to blank
   `seen` to get past the due filter, which emptied the Trouble set: its words
   are found *through* `seen`.) */
export function cardsOfSets(st, ids) {
  return cardsIn(st, ids).map((c) => ({ ru: c.b, en: c.e || "" }));
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

/* How many cards "For you" deals. Twenty unless the learner says otherwise; an
   empty or nonsense box falls back to twenty rather than to nothing, because a
   pile of zero cards is not a thing anybody asked for. */
export const FOR_YOU_N = 20;
export const pickN = (text) => {
  const n = parseInt(String(text), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 999) : FOR_YOU_N;
};

export default function Study({ navigation }) {
  const { st, update } = useSession();
  const t = useTheme();
  const [picker, setPicker] = useState(false);
  const [howMany, setHowMany] = useState(String(FOR_YOU_N));
  const [queue, setQueue] = useState(() => buildQueue(st));
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(false);
  const [back, setBack] = useState(false);       // reading a card already graded

  const rebuild = (limit, ahead) => {
    setQueue(buildQueue(st, limit, ahead));
    setAt(0);
    setShown(false);
    setBack(false);
  };
  const chosen = cardsIn(st, st.sets).length;      // cards in the sets, due or not
  // The profile arrives after the first render, and a set or a deck can change
  // from the picker: the queue follows what is ticked.
  const setsKey = st.sets.join(",") + "|" + (st.decks || []).map((d) => d.id + d.cards.length).join(",");
  useEffect(() => { rebuild(); }, [setsKey]);

  const names = st.sets.map((id) => id === "__trouble__" ? "Trouble words"
    : id === "__due__" ? "Due today"
    : id.startsWith("deck:") ? ((st.decks || []).find((d) => "deck:" + d.id === id) || {}).name
    : (UN.find((u) => u.id === id) || {}).name).filter(Boolean);

  const w = queue[at] !== undefined ? queue[at] : null;
  const iv = w ? fsrsPreview(st.seen[w.b], today()) : {};
  // A deck card has no lemma behind it and so no entry: `idxOfWord` is -1 and
  // `sensesOf` says nothing, which is the honest answer for a card the learner
  // wrote themselves.
  const senses = w ? sensesOf(idxOfWord(w.b)) : null;

  /* One trouble rule for the cards and the runners (core/fsrs.js applyGrade):
     a card used to clear only on Good or better here and on any recall there,
     so a word could be trouble on the path and not on the cards. */
  const grade = (g) => {
    const word = w.b;
    update((prev) => {
      const r = applyGrade(prev.seen, prev.trouble, word, g, today());
      return { ...prev, seen: r.seen, trouble: r.trouble,
               xp: (prev.xp || 0) + (g === 1 ? 0 : 1) };
    });
    if (g === 1) setQueue(queue.concat(queue[at]));
    setAt(at + 1);
    setShown(false);
    setBack(false);
  };

  return (
    <Screen>
      {/* A summary of what is ticked — so it only exists once something is.
          With nothing chosen it said "Choose what to practise / Nothing
          selected / Change" above an empty state saying "Pick a set to
          practise" with a button saying "Choose what to review": one thought,
          three controls, two of them boxes. The empty state's button is the
          way in; this row is the way back. */}
      {names.length ? (
        <List>
          <Row onPress={() => setPicker(true)}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 15 }}>
                {names.length === 1 ? names[0] : `${names.length} sets`}
              </Text>
              <Muted>{queue.length ? `${queue.length} cards` : `${chosen} cards`}</Muted>
            </View>
            <Btn kind="ghost" label="Change" style={{ paddingHorizontal: 8 }} onPress={() => setPicker(true)} />
          </Row>
        </List>
      ) : null}

      {!w ? (
        /* A sentence and one action, with air around them — not a panel.
           A card groups things that belong together; one line of text and the
           button under it are not a group, and drawing a container round them
           made the empty Study screen read as two grey boxes stacked (§25, and
           the owner on getting away from blocky squares). */
        <View style={{ marginTop: 56, alignItems: "center", paddingHorizontal: 24 }}>
          <Text style={{ color: t.ink, fontSize: T.title, fontWeight: "700",
                         textAlign: "center" }}>
            {queue.length ? "Set finished."
              : chosen ? "Nothing due today." : "Pick a set to practise."}
          </Text>
          {queue.length ? (
            <Btn kind="pri" label="Go again" style={{ marginTop: 20, minWidth: 200 }}
                 onPress={() => rebuild()} />
          ) : chosen ? (
            // The scheduler has nothing to ask; studying ahead is the learner's
            // choice, said as such, not the default.
            <Btn label={`Study ahead · ${chosen} cards`} style={{ marginTop: 20, minWidth: 200 }}
                 onPress={() => rebuild(undefined, true)} />
          ) : (
            <Btn kind="pri" label="Choose what to review" style={{ marginTop: 20, minWidth: 200 }}
                 onPress={() => setPicker(true)} />
          )}
        </View>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12,
                         marginTop: 16 }}>
            <View style={{ flex: 1 }}><Bar value={at / queue.length} /></View>
            <Pill>{`${at + 1}/${queue.length}`}</Pill>
          </View>

          <Card style={{ marginTop: 12, alignItems: "center", paddingVertical: 28 }}>
            {!shown && st.dir ? (
              // English first: the same numbered senses, since the question is
              // "which word means all of these?" and one of nine synonyms is a
              // different question.
              w.e ? <Senses e={w.e} size={20} style={{ marginTop: 0 }} />
                  : <Text style={{ color: t.ink, fontSize: 22, fontWeight: "600" }}>—</Text>
            ) : (
              <>
                {/* The word is the card. At 34 it sat small in the middle of a
                    tall white panel; a flashcard's face should be the largest
                    thing on the screen, and it steps down only when the word is
                    long enough to need the room. */}
                <Text style={{ color: t.ink, fontWeight: "600", textAlign: "center",
                               fontSize: w.w.length > 18 ? 26 : w.w.length > 11 ? 34 : 44 }}>
                  {w.w}
                </Text>
                <View style={{ marginTop: 10 }}><Speaker text={w.b} /></View>
              </>
            )}
            {shown ? (
              <>
                {/* Every meaning the word has, numbered and laid out as a
                    dictionary lays them (§30q) — labels and all. Where there are
                    no senses for a word (2% of the curriculum, and every deck
                    card) the translation stands on its own, which is all there
                    is to show. Four at most here: the card is a card, and the
                    full entry is one press away below. */}
                {senses
                  ? <SenseList senses={senses} size={16} max={4} style={{ marginTop: 10 }} />
                  : <Senses e={w.e} size={16} align="left" style={{ alignSelf: "stretch" }} />}
                {(w.x || []).slice(0, 3).map((ex, k) => (
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
                {(st.mined || {})[w.b] ? (
                  <Pressable
                    testID="from-video"
                    accessibilityRole="button"
                    onPress={() => navigation.navigate("Video", {
                      videoId: st.mined[w.b].v, word: w.b, at: st.mined[w.b].t })}
                    style={{ marginTop: 14, alignSelf: "stretch", paddingTop: 12,
                             borderTopWidth: 1, borderTopColor: t.lineSoft }}
                  >
                    <Muted numberOfLines={2}>{st.mined[w.b].s}</Muted>
                    <Text style={{ color: t.brandInk, fontSize: 13, marginTop: 4 }}>
                      Where you heard it
                    </Text>
                  </Pressable>
                ) : null}
                {/* And the rest of what a dictionary holds — the paradigm, the
                    frequency, every example — is one tap away rather than
                    copied onto the card. A deck card has no entry to open. */}
                {idxOfWord(w.b) >= 0 ? (
                  <Btn kind="ghost" label="Full entry" testID="full-entry"
                       style={{ marginTop: 12 }}
                       onPress={() => navigation.navigate("Word", { word: w.b })} />
                ) : null}
              </>
            ) : null}
          </Card>

          {!shown ? (
            <Btn kind="pri" label="Show" style={{ marginTop: 14 }}
                 onPress={() => setShown(true)} />
          ) : back ? (
            // Looking back at a graded card: read it, do not grade it twice.
            <Btn kind="pri" label="Next" style={{ marginTop: 14 }}
                 onPress={() => { setBack(false); setAt(at + 1); setShown(false); }} />
          ) : (
            <View style={{ flexDirection: "row", gap: 6, marginTop: 14 }}>
              {[[1, "Again", "bad"], [2, "Hard", "plain"],
                [3, "Good", "good"], [4, "Easy", "pri"]].map(([g, label, kind]) => (
                <Pressable
                  key={g}
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
                    {iv[g]}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <Btn kind="ghost" label="◀ Previous" style={{ flex: 1 }}
                 disabled={at === 0}
                 onPress={() => { setAt(at - 1); setShown(true); setBack(true); }} />
            <Btn kind="ghost" label="Skip ▶" style={{ flex: 1 }}
                 onPress={() => { setAt(at + 1); setShown(false); setBack(false); }} />
          </View>
        </>
      )}

      {/* How the pile is dealt, under the pile rather than over it. These three
          sat between the summary row and the card, so a screen whose subject is
          one word had two filled buttons and a number box above it and the card
          began below the halfway mark. They are settings for the session, not
          the session — and nothing to shuffle or cut when there is no queue. */}
      {queue.length ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 22 }}>
          <Btn kind="ghost" label="Shuffle" style={{ flex: 1 }}
               onPress={() => { setQueue(shuffle(queue.slice())); setAt(0); setShown(false); }} />
          {/* "20 most urgent" said what the code does — it sorts by weight and
              cuts. What a learner wants is a short pile picked for them, and how
              short is theirs to say (the owner, 2026-09-11). */}
          <Btn kind="ghost" label="For you" style={{ flex: 1 }} onPress={() => rebuild(pickN(howMany))} />
          <TextInput
            testID="study-n"
            value={howMany}
            onChangeText={(v) => setHowMany(v.replace(/[^0-9]/g, "").slice(0, 3))}
            onBlur={() => setHowMany(String(pickN(howMany)))}
            keyboardType="number-pad"
            selectTextOnFocus
            style={{ width: 58, textAlign: "center", color: t.ink, fontSize: 15,
                     borderWidth: 1, borderColor: t.line, borderRadius: radius.md,
                     backgroundColor: t.surface, paddingVertical: 11 }}
          />
        </View>
      ) : null}

      <SetPicker visible={picker} onClose={() => setPicker(false)} />
    </Screen>
  );
}
