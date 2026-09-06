/* You — profile, progress, the trouble bank, and settings. */

import React, { useState } from "react";
import { View, Text, Modal, ScrollView, Switch, Alert } from "react-native";
import { useSession } from "../session";
import { useTheme, radius } from "../theme";
import {
  Screen, Card, List, Row, Btn, Pill, Muted, Avatar, Title,
} from "../ui";
import { L, UN, STATS, idxOfWord } from "../data";
import { troubleWords } from "./Study";
import { today } from "@core/util";

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
              <Row last={!st.dev}>
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
  const lessons = Object.values(st.unit)
    .reduce((a, u) => a + Object.keys(u.lessons || {}).length, 0);
  const due = Object.keys(st.seen).filter((w) => st.seen[w].due <= today()).length;
  const trouble = troubleWords(st);
  const level = Math.floor((st.xp || 0) / 100) + 1;

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

      <Settings visible={settings} onClose={() => setSettings(false)}
                onLab={() => navigation.navigate("SttLab")} />
    </Screen>
  );
}
