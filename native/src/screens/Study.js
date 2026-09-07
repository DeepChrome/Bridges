/* Study — flashcards with the four Anki buttons, scheduled by FSRS.
 *
 * A card is a curriculum word or, since 2026-09-07, a card from an imported Anki
 * deck (You → decks). Both key their schedule on the Russian string (rule 20.4),
 * so a deck card that is also a curriculum word shares one memory. */

import React, { useEffect, useState } from "react";
import { View, Text, Modal, ScrollView, Pressable, Alert } from "react-native";
import { useSession } from "../session";
import { useTheme, radius } from "../theme";
import { Screen, Card, Btn, Bar, Pill, Speaker, Muted, List, Row, Senses } from "../ui";
import { L, UN, STAGES, unitUnlocked, idxOfWord } from "../data";
import { Linked } from "../words";
import { importDeck, exportDeck } from "../anki";
import { fsrsReview, fsrsPreview, isTrouble } from "@core/fsrs";
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

/* Only what is ticked. With nothing ticked the queue is empty and the screen says
   so — it used to fall back to the first unit's words, which read as a set of
   common words that could not be switched off (the owner, 2026-09-07). */
export function buildQueue(st, limit) {
  const pool = [];
  const have = new Set();
  const add = (card) => { if (!have.has(card.b)) { have.add(card.b); pool.push(card); } };
  st.sets.forEach((id) => {
    if (id === "__trouble__") {
      troubleWords(st).forEach((w) => {
        const i = idxOfWord(w);
        if (i >= 0) add(cardOf(i));
        else add({ key: "d" + w, w, b: w, e: "" });
      });
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
  const t = today();
  let q = pool.filter((c) => { const s = st.seen[c.b]; return !s || s.due <= t; });
  if (!q.length) q = pool.slice();
  if (limit) {
    q.sort((a, b) => weight(st, b) - weight(st, a));
    q = q.slice(0, limit);
  }
  return q;
}

/* The cards a set holds, for export. */
export function cardsOfSets(st, ids) {
  return buildQueue({ ...st, sets: ids, seen: {} }).map((c) => ({ ru: c.b, en: c.e || "" }));
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

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)",
                     justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: t.bg, borderTopLeftRadius: radius.lg,
                       borderTopRightRadius: radius.lg, padding: 16, maxHeight: "88%" }}>
          <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: t.line,
                         alignSelf: "center", marginBottom: 14 }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8,
                         marginBottom: 12 }}>
            <Text style={{ flex: 1, color: t.ink, fontSize: 17, fontWeight: "600" }}>
              Practise
            </Text>
            <Btn kind="ghost" label="Select all"
                 onPress={() => update((p) => ({
                   ...p, sets: UN.filter((u) => unitUnlocked(p, u)).map((u) => u.id) }))} />
            <Btn kind="ghost" label="Clear"
                 onPress={() => update((p) => ({ ...p, sets: [] }))} />
          </View>
          <ScrollView>
            {troubleWords(st).length ? (
              <View style={{ marginBottom: 18 }}>
                <List>
                  <Row last onPress={() => toggle("__trouble__")}>
                    <Tick on={st.sets.includes("__trouble__")} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.ink, fontSize: 15 }}>Trouble words</Text>
                      <Muted>{troubleWords(st).length + " words"}</Muted>
                    </View>
                  </Row>
                </List>
              </View>
            ) : null}

            <View style={{ marginBottom: 18 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Text style={{ flex: 1, color: t.ink3, fontSize: 11, fontWeight: "600",
                               letterSpacing: 1, textTransform: "uppercase" }}>
                  Your decks
                </Text>
                <Btn kind="ghost" label={busy ? "Working…" : "Import"} disabled={busy}
                     onPress={doImport} />
              </View>
              {(st.decks || []).length ? (
                <List>
                  {(st.decks || []).map((d, k) => (
                    <Row key={d.id} last={k === st.decks.length - 1}
                         onPress={() => toggle("deck:" + d.id)}>
                      <Tick on={st.sets.includes("deck:" + d.id)} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: t.ink, fontSize: 15 }}>{d.name}</Text>
                        <Muted>{d.cards.length + " cards"}</Muted>
                      </View>
                      <Pressable onPress={() => doExport(d.name, ["deck:" + d.id])} hitSlop={8}
                                 accessibilityRole="button" accessibilityLabel={`Export ${d.name}`}>
                        <Pill>export</Pill>
                      </Pressable>
                      <Pressable onPress={() => removeDeck(d)} hitSlop={8} style={{ marginLeft: 6 }}
                                 accessibilityRole="button" accessibilityLabel={`Remove ${d.name}`}>
                        <Pill>remove</Pill>
                      </Pressable>
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
                    <Text style={{ flex: 1, color: t.ink3, fontSize: 11, fontWeight: "600",
                                   letterSpacing: 1, textTransform: "uppercase" }}>
                      {`Chapter ${s.n || i + 1}`}
                    </Text>
                    <Btn kind="ghost" label={on ? "Deselect chapter" : "Select chapter"}
                         onPress={() => update((p) => {
                           const ids = units.map((u) => u.id);
                           return { ...p, sets: on
                             ? p.sets.filter((x) => !ids.includes(x))
                             : p.sets.concat(ids.filter((x) => !p.sets.includes(x))) };
                         })} />
                  </View>
                  <List>
                    {units.map((u, k) => (
                      <Row key={u.id} last={k === units.length - 1}
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
          </ScrollView>
          {st.sets.length ? (
            <Btn label={busy ? "Working…" : "Export selected as an Anki deck"} disabled={busy}
                 style={{ marginTop: 8 }}
                 onPress={() => doExport(selectedNames.length === 1 ? selectedNames[0] : "Bridges", st.sets)} />
          ) : null}
          <Btn kind="pri" label="Done" style={{ marginTop: 8 }} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function Tick({ on }) {
  const t = useTheme();
  return (
    <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2,
                   borderColor: on ? t.good : t.line,
                   backgroundColor: on ? t.good : "transparent",
                   alignItems: "center", justifyContent: "center" }}>
      {on ? <Text style={{ color: t.goodOn, fontWeight: "800", fontSize: 13 }}>✓</Text> : null}
    </View>
  );
}

export default function Study() {
  const { st, update } = useSession();
  const t = useTheme();
  const [picker, setPicker] = useState(false);
  const [queue, setQueue] = useState(() => buildQueue(st));
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(false);

  const rebuild = (limit) => {
    setQueue(buildQueue(st, limit));
    setAt(0);
    setShown(false);
  };
  // The profile arrives after the first render, and a set or a deck can change
  // from the picker: the queue follows what is ticked.
  const setsKey = st.sets.join(",") + "|" + (st.decks || []).map((d) => d.id + d.cards.length).join(",");
  useEffect(() => { rebuild(); }, [setsKey]);

  const names = st.sets.map((id) => id === "__trouble__" ? "Trouble words"
    : id.startsWith("deck:") ? ((st.decks || []).find((d) => "deck:" + d.id === id) || {}).name
    : (UN.find((u) => u.id === id) || {}).name).filter(Boolean);

  const w = queue[at] !== undefined ? queue[at] : null;
  const iv = w ? fsrsPreview(st.seen[w.b], today()) : {};

  const grade = (g) => {
    const word = w.b;
    update((prev) => {
      const card = fsrsReview(prev.seen[word], g, today());
      const trouble = { ...prev.trouble };
      if (isTrouble(card)) trouble[word] = (trouble[word] || 0) + (g === 1 ? 1 : 0);
      else if (g > 2 && trouble[word]) delete trouble[word];
      return { ...prev, seen: { ...prev.seen, [word]: card }, trouble,
               xp: (prev.xp || 0) + (g === 1 ? 0 : 1) };
    });
    if (g === 1) setQueue(queue.concat(queue[at]));
    setAt(at + 1);
    setShown(false);
  };

  return (
    <Screen>
      <List>
        <Row last onPress={() => setPicker(true)}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15 }}>
              {names.length ? (names.length === 1 ? names[0] : `${names.length} sets`)
                            : "Choose what to practise"}
            </Text>
            <Muted>{queue.length ? `${queue.length} cards` : "Nothing selected"}</Muted>
          </View>
          <Pill tone="brand">Change</Pill>
        </Row>
      </List>

      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <Btn label="Shuffle" style={{ flex: 1 }}
             onPress={() => { setQueue(shuffle(queue.slice())); setAt(0); setShown(false); }} />
        <Btn label="Fast 20" style={{ flex: 1 }} onPress={() => rebuild(20)} />
      </View>

      {!w ? (
        <Card style={{ marginTop: 16, alignItems: "center" }}>
          <Text style={{ color: t.ink, fontSize: 16 }}>
            {queue.length ? "Set finished." : "Pick a set to practise."}
          </Text>
          {queue.length ? (
            <Btn kind="pri" label="Go again" style={{ marginTop: 14 }}
                 onPress={() => rebuild()} />
          ) : null}
        </Card>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12,
                         marginTop: 16 }}>
            <View style={{ flex: 1 }}><Bar value={at / queue.length} /></View>
            <Pill>{`${at + 1}/${queue.length}`}</Pill>
          </View>

          <Card style={{ marginTop: 12, alignItems: "center", paddingVertical: 28 }}>
            {!shown && st.dir ? (
              <Text style={{ color: t.ink, fontSize: 22, fontWeight: "600",
                             textAlign: "center" }}>{w.e || "—"}</Text>
            ) : (
              <>
                <Text style={{ color: t.ink, fontSize: w.w.length > 18 ? 24 : 34, fontWeight: "600",
                               textAlign: "center" }}>{w.w}</Text>
                <View style={{ marginTop: 10 }}><Speaker text={w.b} /></View>
              </>
            )}
            {shown ? (
              <>
                <Senses e={w.e} />
                {(w.x || []).slice(0, 3).map((ex, k) => (
                  // The word in use, three ways: the entry reads like a dictionary,
                  // not a gloss (the owner, 2026-09-07).
                  <View key={k} style={{ marginTop: k ? 10 : 14, alignSelf: "stretch",
                                         paddingTop: k ? 10 : 0, borderTopWidth: k ? 1 : 0, borderTopColor: t.lineSoft }}>
                    <Linked text={ex.ru} size={16} />
                    <Muted>{ex.en}</Muted>
                  </View>
                ))}
              </>
            ) : null}
          </Card>

          {!shown ? (
            <Btn kind="pri" label="Show" style={{ marginTop: 14 }}
                 onPress={() => setShown(true)} />
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
                  <Text style={{ fontSize: 10, opacity: 0.75, fontWeight: "500",
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
                 onPress={() => { setAt(at - 1); setShown(true); }} />
            <Btn kind="ghost" label="Skip ▶" style={{ flex: 1 }}
                 onPress={() => { setAt(at + 1); setShown(false); }} />
          </View>
        </>
      )}

      <SetPicker visible={picker} onClose={() => setPicker(false)} />
    </Screen>
  );
}
