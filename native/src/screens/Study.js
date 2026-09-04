/* Study — flashcards with the four Anki buttons, scheduled by FSRS. */

import React, { useMemo, useState } from "react";
import { View, Text, Modal, ScrollView, Pressable } from "react-native";
import { useSession } from "../session";
import { useTheme, radius } from "../theme";
import { Screen, Card, Btn, Bar, Pill, Speaker, Muted, List, Row } from "../ui";
import { L, UN, STAGES, unitUnlocked, idxOfWord } from "../data";
import { fsrsReview, fsrsPreview, isTrouble } from "@core/fsrs";
import { shuffle, today } from "@core/util";

export function troubleWords(st) {
  const out = [];
  for (const w in st.seen) if (isTrouble(st.seen[w])) out.push(w);
  (st.pinned || []).forEach((w) => { if (!out.includes(w)) out.push(w); });
  return out.sort((a, b) => ((st.seen[b] || {}).lapses || 0) -
                            ((st.seen[a] || {}).lapses || 0));
}

/* Higher is more urgent: banked trouble first, then most overdue, then unseen. */
function weight(st, i) {
  const w = L[i].b;
  const c = st.seen[w];
  let score = 0;
  if (st.trouble[w] || (c && isTrouble(c))) score += 1000;
  if (!c) return score + 50;
  score += Math.max(0, today() - c.due) * 10;
  score += (c.lapses || 0) * 20 + (c.d || 0);
  return score;
}

function buildQueue(st, limit) {
  const ids = st.sets.length ? st.sets : [UN[0].id];
  const pool = [];
  ids.forEach((id) => {
    if (id === "__trouble__") {
      troubleWords(st).forEach((w) => {
        const i = idxOfWord(w);
        if (i >= 0 && !pool.includes(i)) pool.push(i);
      });
      return;
    }
    const u = UN.find((x) => x.id === id);
    if (u) u.w.forEach((i) => { if (!pool.includes(i)) pool.push(i); });
  });
  const t = today();
  let q = pool.filter((i) => { const c = st.seen[L[i].b]; return !c || c.due <= t; });
  if (!q.length) q = pool.slice();
  if (limit) {
    q.sort((a, b) => weight(st, b) - weight(st, a));
    q = q.slice(0, limit);
  }
  return q;
}

function SetPicker({ visible, onClose }) {
  const { st, update } = useSession();
  const t = useTheme();
  const toggle = (id) => update((p) => ({
    ...p,
    sets: p.sets.includes(id) ? p.sets.filter((x) => x !== id) : p.sets.concat(id),
  }));

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
                      {`Stage ${i + 1}`}
                    </Text>
                    <Btn kind="ghost" label={on ? "Deselect stage" : "Select stage"}
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
      {on ? <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>✓</Text> : null}
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

  const names = st.sets.map((id) => id === "__trouble__" ? "Trouble words"
    : (UN.find((u) => u.id === id) || {}).name).filter(Boolean);

  const w = queue[at] !== undefined ? L[queue[at]] : null;
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
                <Text style={{ color: t.ink, fontSize: 34, fontWeight: "600" }}>{w.w}</Text>
                <View style={{ marginTop: 10 }}><Speaker text={w.b} /></View>
              </>
            )}
            {shown ? (
              <>
                <Text style={{ color: t.ink2, fontSize: 15, marginTop: 10,
                               textAlign: "center" }}>{w.e}</Text>
                {w.x && w.x[0] ? (
                  <View style={{ marginTop: 14, alignSelf: "stretch" }}>
                    <Text style={{ color: t.ink, fontSize: 17 }}>{w.x[0].ru}</Text>
                    <Muted>{w.x[0].en}</Muted>
                  </View>
                ) : null}
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
                                      : kind === "pri" ? "#1A1508" : "#fff" }}>
                    {label}
                  </Text>
                  <Text style={{ fontSize: 10, opacity: 0.75, fontWeight: "500",
                                 color: kind === "plain" ? t.ink2
                                      : kind === "pri" ? "#1A1508" : "#fff" }}>
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

      <SetPicker visible={picker} onClose={() => { setPicker(false); rebuild(); }} />
    </Screen>
  );
}
