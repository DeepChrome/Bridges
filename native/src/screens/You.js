/* You — profile, progress, the trouble bank, and settings. */

import React, { useState } from "react";
import { View, Text, Modal, ScrollView, Switch, Alert, Pressable } from "react-native";
import { useSession } from "../session";
import { useTheme, radius } from "../theme";
import {
  Screen, Card, List, Row, Btn, Pill, Muted, Avatar, Title,
} from "../ui";
import { L, UN, STATS, idxOfWord, lessonCount, lessonDone } from "../data";
import { CUE_NAMES, SPEEDS, previewCue } from "../audio";
import { troubleWords } from "./Study";
import { today } from "@core/util";
import { tagInfo } from "@core/errortags";

/* The grammar the learner keeps getting wrong, from the tags the speech feedback
   attaches to attempts (ROADMAP P5.11). Counted in state by recordAttempt; shown
   here most frequent first, each pointing at the unit whose note teaches it. */
export function grammarTrouble(st) {
  const counts = (st.speech && st.speech.tagCounts) || {};
  return Object.keys(counts)
    .map((id) => ({ id, n: counts[id], info: tagInfo(id) }))
    .filter((x) => x.info && x.n > 0)
    .sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
}

function Stat({ value, label }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.surface, borderColor: t.line,
                   borderWidth: 1, borderRadius: radius.md, padding: 13 }}>
      <Text style={{ color: t.ink, fontSize: 22, fontWeight: "700" }}>{value}</Text>
      <Muted size={12}>{label}</Muted>
    </View>
  );
}

/* A row of choices, one lit. */
function Choice({ options, value, onPick, testID }) {
  const t = useTheme();
  return (
    <View testID={testID} style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} onPress={() => onPick(o.id)} accessibilityRole="button"
                     accessibilityState={{ selected: on }}
                     style={{ borderWidth: 1, borderColor: on ? t.brand : t.line,
                              backgroundColor: on ? t.brandBg : t.surface, borderRadius: 99,
                              paddingHorizontal: 13, paddingVertical: 8, minHeight: 36 }}>
            <Text style={{ color: on ? t.brandInk : t.ink2, fontSize: 14 }}>{o.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Settings({ visible, onClose, onLab }) {
  const { st, update, signOut } = useSession();
  const t = useTheme();
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)",
                     justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: t.bg, borderTopLeftRadius: radius.lg,
                       borderTopRightRadius: radius.lg, padding: 16, maxHeight: "85%" }}>
          <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: t.line,
                         alignSelf: "center", marginBottom: 14 }} />
          <Text style={{ color: t.ink, fontSize: 17, fontWeight: "600",
                         marginBottom: 14 }}>Settings</Text>
          <ScrollView>
            <List>
              <Row>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15 }}>Developer mode</Text>
                  <Muted>All lessons unlocked</Muted>
                </View>
                <Switch
                  value={!!st.dev}
                  onValueChange={(v) => update((p) => ({ ...p, dev: v }))}
                  trackColor={{ true: t.good, false: t.surface3 }}
                />
              </Row>
              <Row>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15 }}>Card side</Text>
                  <Muted>{st.dir ? "English first" : "Russian first"}</Muted>
                </View>
                <Switch
                  value={!!st.dir}
                  onValueChange={(v) => update((p) => ({ ...p, dir: v ? 1 : 0 }))}
                  trackColor={{ true: t.good, false: t.surface3 }}
                />
              </Row>
              <Row>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15 }}>Russian keyboard</Text>
                  <Muted>On screen, for typed answers</Muted>
                </View>
                <Switch
                  testID="osk-switch"
                  value={!!st.osk}
                  onValueChange={(v) => update((p) => ({ ...p, osk: v }))}
                  trackColor={{ true: t.good, false: t.surface3 }}
                />
              </Row>
              <Row>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15 }}>Reading speed</Text>
                  <Muted>Press a speaker twice for slower</Muted>
                  <Choice testID="speed-choice" options={SPEEDS} value={st.speed || "normal"}
                          onPick={(id) => update((p) => ({ ...p, speed: id }))} />
                </View>
              </Row>
              <Row last={!st.dev}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15 }}>Right-answer sound</Text>
                  <Muted>Tap to hear</Muted>
                  <Choice testID="cue-choice" options={CUE_NAMES} value={st.cue || "bell"}
                          onPick={(id) => { previewCue(id); update((p) => ({ ...p, cue: id })); }} />
                </View>
              </Row>
              {st.dev ? (
                // A measuring tool, not a feature: only with developer mode on.
                <Row last onPress={() => { onClose(); onLab(); }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.ink, fontSize: 15 }}>STT Lab</Text>
                    <Muted>Measure speech recognition on your voice</Muted>
                  </View>
                </Row>
              ) : null}
            </List>

            <Btn label="Switch profile" style={{ marginTop: 16 }}
                 onPress={() => { onClose(); signOut(); }} />
            <Btn
              label="Reset progress"
              style={{ marginTop: 8 }}
              onPress={() => Alert.alert(
                "Reset progress",
                "Erase all progress for this profile?",
                [{ text: "Cancel", style: "cancel" },
                 { text: "Erase", style: "destructive",
                   onPress: () => update((p) => ({
                     ...p, seen: {}, trouble: {}, pinned: [], unit: {}, drills: {},
                     xp: 0, streak: 0, day: null,
                   })) }])}
            />
            <Muted style={{ textAlign: "center", marginTop: 16 }}>
              {`Built ${STATS.built}`}
            </Muted>
          </ScrollView>
          <Btn kind="pri" label="Done" style={{ marginTop: 14 }} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

export default function You({ navigation }) {
  const { st, account, update } = useSession();
  const t = useTheme();
  const [settings, setSettings] = useState(false);

  const learned = Object.values(st.seen).filter((c) => (c.reps || 0) > 0).length;
  // Cleared means done — vocabulary met and the quiz passed — not merely attempted.
  const lessons = UN.reduce((a, u) => {
    let n = 0;
    for (let i = 0; i < lessonCount(u); i++) if (lessonDone(st, u, i)) n++;
    return a + n;
  }, 0);
  const due = Object.keys(st.seen).filter((w) => st.seen[w].due <= today()).length;
  const trouble = troubleWords(st);
  const grammar = grammarTrouble(st);
  const level = Math.floor((st.xp || 0) / 100) + 1;
  const openUnit = (unitId) =>
    navigation.navigate("Learn", { screen: "Unit", params: { unitId } });

  return (
    <Screen>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Avatar id={account ? account.avatar : "monkeynaut"} size={52} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.ink, fontSize: 17, fontWeight: "600" }}>
            {account ? account.name : "Learner"}
          </Text>
          <Muted>
            {`Level ${level} · ${(st.xp || 0).toLocaleString("en-US")} XP` +
             (account && account.placed ? ` · placed at stage ${account.placed}` : "")}
          </Muted>
        </View>
        <Btn kind="ghost" label="Settings" onPress={() => setSettings(true)} />
      </Card>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
        <Stat value={String(st.streak || 0)} label="day streak" />
        <Stat value={learned.toLocaleString("en-US")} label="words seen" />
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
        <Stat value={String(lessons)} label="lessons cleared" />
        <Stat value={due.toLocaleString("en-US")} label="due now" />
      </View>

      <Text style={{ color: t.ink3, fontSize: 11, fontWeight: "600", letterSpacing: 1,
                     textTransform: "uppercase", marginTop: 22, marginBottom: 9 }}>
        Trouble words
      </Text>
      {!trouble.length ? (
        // A label, not a paragraph centred in a card: the card built a tall empty box
        // around one sentence and pushed everything below it off the screen.
        <Muted>Nothing yet</Muted>
      ) : (
        <>
          <Btn
            kind="pri"
            label={`Review ${trouble.length} trouble ${trouble.length === 1 ? "word" : "words"}`}
            onPress={() => {
              update((p) => ({ ...p, sets: ["__trouble__"] }));
              navigation.navigate("Study");
            }}
          />
          <View style={{ marginTop: 10 }}>
            <List>
              {trouble.slice(0, 12).map((w, k) => {
                const i = idxOfWord(w);
                return (
                  <Row key={w} last={k === Math.min(12, trouble.length) - 1}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.ink, fontSize: 16 }}>
                        {i >= 0 ? L[i].w : w}
                      </Text>
                      {i >= 0 ? <Muted>{L[i].e}</Muted> : null}
                    </View>
                    <Pill>{`${(st.seen[w] || {}).lapses || 0}×`}</Pill>
                  </Row>
                );
              })}
            </List>
          </View>
        </>
      )}

      <Text style={{ color: t.ink3, fontSize: 11, fontWeight: "600", letterSpacing: 1,
                     textTransform: "uppercase", marginTop: 22, marginBottom: 9 }}>
        Grammar
      </Text>
      {!grammar.length ? (
        <Muted>Nothing yet</Muted>
      ) : (
        <List>
          {grammar.map((g, k) => {
            const unit = g.info.unit ? UN.find((u) => u.id === g.info.unit) : null;
            return (
              <Row key={g.id} last={k === grammar.length - 1}
                   onPress={unit ? () => openUnit(unit.id) : undefined}
                   disabled={!unit}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15 }}>{g.info.en}</Text>
                  {unit ? <Muted>{unit.name}</Muted> : null}
                </View>
                <Pill>{`${g.n}×`}</Pill>
              </Row>
            );
          })}
        </List>
      )}

      <Settings visible={settings} onClose={() => setSettings(false)}
                onLab={() => navigation.navigate("SttLab")} />
    </Screen>
  );
}
