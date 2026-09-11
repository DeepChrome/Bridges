/* You — profile, progress, the trouble bank, and settings. */

import React, { useEffect, useState } from "react";
import { View, Switch, Alert } from "react-native";
import { useSession } from "../session";
import { DEFAULTS, SETTING_KEYS } from "../store";
import { speechDefault } from "@core/state";
import { useTheme, radius } from "../theme";
import { Screen, Card, List, Row, Btn, Pill, Muted, Avatar, Choice, SectionLabel, Sheet, Text } from "../ui";
import { L, UN, STATS, idxOfWord, lessonCount, lessonDone } from "../data";
import { CUE_NAMES, SPEEDS, previewCue } from "../audio";
import { cacheStats, clearCache } from "../cache";
import { backupProfile, restoreProfile } from "../backup";
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


function Settings({ visible, onClose, onLab, onTour }) {
  const { st, update, signOut, account, restore } = useSession();
  const t = useTheme();
  const [cache, setCache] = useState(() => cacheStats());
  useEffect(() => { if (visible) setCache(cacheStats()); }, [visible]);
  const cacheLine = cache.files
    ? `${cache.files} files, ${(cache.bytes / 1048576).toFixed(1)} MB saved`
    : "nothing saved yet";
  return (
    <Sheet visible={visible} onClose={onClose} title="Settings"
           footer={<Btn kind="pri" label="Done" style={{ marginTop: 14 }} onPress={onClose} />}>
            <List>
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
                  <Text style={{ color: t.ink, fontSize: 15 }}>Audio for offline</Text>
                  <Muted>{`Downloads a unit's recordings when you open it · ${cacheLine}`}</Muted>
                  {cache.files ? (
                    <Btn kind="ghost" label="Clear downloaded audio" style={{ alignSelf: "flex-start", marginTop: 4 }}
                         onPress={() => { clearCache(); setCache(cacheStats()); }} />
                  ) : null}
                </View>
                <Switch
                  testID="offline-switch"
                  value={!!st.offline}
                  onValueChange={(v) => update((p) => ({ ...p, offline: v }))}
                  trackColor={{ true: t.good, false: t.surface3 }}
                />
              </Row>
              <Row>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15 }}>Reading speed</Text>
                  <Muted>Press a speaker twice for slower</Muted>
                  <Choice testID="speed-choice" options={SPEEDS} value={st.speed || "normal"} style={{ marginTop: 8 }}
                          onPick={(id) => update((p) => ({ ...p, speed: id }))} />
                </View>
              </Row>
              <Row>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15 }}>Right-answer sound</Text>
                  <Muted>Tap to hear</Muted>
                  <Choice testID="cue-choice" options={CUE_NAMES} value={st.cue || "bell"} style={{ marginTop: 8 }}
                          onPick={(id) => { previewCue(id); update((p) => ({ ...p, cue: id })); }} />
                </View>
              </Row>
              <Row onPress={() => { onClose(); onTour(); }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15 }}>Show the tour</Text>
                  <Muted>Words, voices and the microphone, in three cards</Muted>
                </View>
              </Row>
              {/* Last, not first: a new learner's settings sheet should not open on
                  a switch they cannot place. It ships on (rule 20.9). */}
              <Row>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15 }}>Developer mode</Text>
                  <Muted>All lessons unlocked</Muted>
                </View>
                <Switch
                  testID="dev-switch"
                  value={!!st.dev}
                  onValueChange={(v) => update((p) => ({ ...p, dev: v }))}
                  trackColor={{ true: t.good, false: t.surface3 }}
                />
              </Row>
              {st.dev ? (
                // A measuring tool, not a feature: only with developer mode on.
                <Row onPress={() => { onClose(); onLab(); }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.ink, fontSize: 15 }}>STT Lab</Text>
                    <Muted>Measure speech recognition on your voice</Muted>
                  </View>
                </Row>
              ) : null}
            </List>

            {/* The schedule off the phone and back: the one thing no rebuild
                can regenerate (ROADMAP P9.10). */}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
              <Btn label="Back up progress" style={{ flex: 1 }}
                   onPress={async () => {
                     try { await backupProfile(st, account); }
                     catch (e) { Alert.alert("Back up", "The backup could not be written."); }
                   }} />
              <Btn label="Restore" style={{ flex: 1 }}
                   onPress={async () => {
                     const res = await restoreProfile();
                     if (res.cancelled) return;
                     if (res.error) { Alert.alert("Restore", res.error); return; }
                     const words = Object.keys(res.state.seen || {}).length;
                     Alert.alert("Restore this backup?",
                       `${res.name ? res.name + ", " : ""}${words} words with a schedule. It replaces this profile's progress.`,
                       [{ text: "Cancel", style: "cancel" },
                        { text: "Restore", style: "destructive", onPress: () => { restore(res.state); onClose(); } }]);
                   }} />
            </View>
            <Btn label="Switch profile" style={{ marginTop: 8 }}
                 onPress={() => { onClose(); signOut(); }} />
            <Btn
              label="Reset progress"
              style={{ marginTop: 8 }}
              onPress={() => Alert.alert(
                "Reset progress",
                "Erase all progress for this profile?",
                [{ text: "Cancel", style: "cancel" },
                 { text: "Erase", style: "destructive",
                   // Everything that is progress goes — the schedule, the
                   // lessons, the speaking record, what was watched — and
                   // only settings and imported decks stay.
                   onPress: () => update((p) => ({
                     ...DEFAULTS,
                     ...Object.fromEntries(SETTING_KEYS.map((k) => [k, p[k]])),
                     speech: speechDefault(),
                   })) }])}
            />
            {/* The corpora and their licences. OpenRussian is CC BY-SA 4.0 and
                Tatoeba CC BY 2.0 FR: naming them is a licence condition, not
                decoration (rule 20.10). The web build has shown this since
                2026-09-04 and the native app — the product — never had it.
                Built from the databases' own meta rows, so it cannot drift from
                what was actually shipped. */}
            <View style={{ marginTop: 20 }}>
              {(STATS.credits || []).map((c) => (
                <Muted key={c.n} size={12} style={{ textAlign: "center" }}>
                  {`${c.n} · ${c.l}`}
                </Muted>
              ))}
              <Muted size={12} style={{ textAlign: "center" }}>
                Photographs from Wikimedia Commons, credited on each word.
              </Muted>
            </View>
            <Muted style={{ textAlign: "center", marginTop: 12 }}>
              {`Built ${STATS.built}`}
            </Muted>
    </Sheet>
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
             (account && account.placed ? ` · placed at chapter ${account.placed + 1}` : "")}
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

      <SectionLabel style={{ marginTop: 22 }}>Trouble words</SectionLabel>
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
              {trouble.slice(0, 12).map((w) => {
                const i = idxOfWord(w);
                return (
                  <Row key={w}>
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

      <SectionLabel style={{ marginTop: 22 }}>Grammar</SectionLabel>
      {!grammar.length ? (
        <Muted>Nothing yet</Muted>
      ) : (
        <List>
          {grammar.map((g) => {
            const unit = g.info.unit ? UN.find((u) => u.id === g.info.unit) : null;
            return (
              <Row key={g.id}
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
                onLab={() => navigation.navigate("SttLab")}
                onTour={() => navigation.navigate("Tour")} />
    </Screen>
  );
}
