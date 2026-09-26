/* You — profile, progress, the trouble bank, and settings. */

import React, { useEffect, useState } from "react";
import { View, Switch, Alert } from "react-native";
import { useSession } from "../session";
import { DEFAULTS, SETTING_KEYS } from "../store";
import { speechDefault } from "@core/state";
import { useTheme } from "../theme";
import { Screen, List, Row, Btn, Pill, Muted, Avatar, Choice, SectionLabel, Sheet, Text } from "../ui";
import { L, UN, STATS, idxOfWord, lessonCount, lessonDone } from "../data";
import { CUE_NAMES, SPEEDS, previewCue } from "../audio";
import { backupProfile, restoreProfile, shareCrashes } from "../backup";
import { readCrashes, clearCrashes } from "../crash";
import { importDeck } from "../anki";
import { today } from "@core/util";
import { troubleWords, newDeckId } from "./Study";
import Constants from "expo-constants";

/* What build this is, at the foot of Settings. The version is app.json's
   (1.0.0-beta.N while it is a beta), read off the build so it cannot say
   something the binary is not. */
const VERSION = (Constants.expoConfig && Constants.expoConfig.version) || "";
import { tagInfo } from "@core/errortags";
import { cardsOf, dueCards, maxLapses, RETENTION_MIN, RETENTION_MAX } from "@core/scheduler";
import { askPermission } from "../notify";

/* When the reminder may land, as minutes past midnight. Four, not twenty-four:
   the question is which part of the day a learner studies in, and a list long
   enough to scroll turns a two-second decision into a chore. */
export const REMIND_TIMES = [
  { id: 8 * 60, name: "08:00" },
  { id: 13 * 60, name: "13:00" },
  { id: 18 * 60, name: "18:00" },
  { id: 21 * 60, name: "21:00" },
];
export const REMIND_DEFAULT = 18 * 60;

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

/* One figure in a band of four.
 *
 * These were four rounded boxes in a 2×2 grid — the "card, card, card, three
 * statistics" screen §25 names outright, and what the owner meant by blocky
 * squares. A number does not need a container to be read as a number; what it
 * needs is to be the largest thing in its column. The band is separated from
 * the figures beside it by a hairline, not by a box each. */
function Stat({ value, label, first }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", paddingHorizontal: 4,
                   borderLeftWidth: first ? 0 : 1, borderLeftColor: t.lineSoft }}>
      <Text style={{ color: t.ink, fontSize: 26, fontWeight: "800",
                     letterSpacing: -0.5 }}>{value}</Text>
      <Muted size={12} style={{ textAlign: "center", marginTop: 2 }}>{label}</Muted>
    </View>
  );
}


function Settings({ visible, onClose, onLab, onTour, onCredits }) {
  const { st, update, signOut, account, restore } = useSession();
  const t = useTheme();
  /* Only ever set by a refusal from the OS, so it belongs to the sheet and not
     to learner state — there is nothing to remember once the sheet closes. */
  const [remindDenied, setRemindDenied] = useState(false);
  /* Read when the sheet opens rather than held in session state: a crash log
     is not learner state, and putting it there would send it through the save
     path — which is one of the things that can be what broke. */
  const [crashes, setCrashes] = useState([]);
  useEffect(() => {
    if (!visible) return;
    let live = true;
    readCrashes().then((c) => { if (live) setCrashes(c); }).catch(() => {});
    return () => { live = false; };
  }, [visible]);

  /* An .apkg or a text export, moved here from the Study picker (2026-09-22).
     The imported decks are ticked on the way in, so the learner lands back on
     a pile that has them: importing a deck and then having to go and find it
     is two jobs where they asked for one. */
  const [importing, setImporting] = useState(false);
  const doImport = async () => {
    setImporting(true);
    const res = await importDeck();
    setImporting(false);
    if (res.cancelled) return;
    if (res.error) { Alert.alert("Import", res.error); return; }
    const added = res.decks.map((d) => ({ id: newDeckId(), name: d.name, cards: d.cards, added: today() }));
    update((p) => ({ ...p, decks: (p.decks || []).concat(added),
                     sets: p.sets.concat(added.map((d) => "deck:" + d.id)) }));
    const n = added.reduce((a, d) => a + d.cards.length, 0);
    Alert.alert("Imported", `${n} cards in ${added.length} ${added.length === 1 ? "deck" : "decks"}.`);
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Settings"
           footer={<Btn kind="pri" label="Done" style={{ marginTop: 14 }} onPress={onClose} />}>
            {/* What broke, if anything has (src/crash.js) — at the **top**.
                It exists only once there is something to report, so a
                permanent "no problems" line never appears (rule 20.7), and on
                the day it does exist it is the most important thing on the
                screen. Put below the settings it sat under six lists and a
                learner would have to go looking for what they never knew was
                recorded. */}
            {crashes.length ? (
              <View style={{ marginBottom: 16 }}>
                <List>
                  <Row testID="crash-row">
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.bad, fontSize: 15, fontWeight: "600" }}>
                        {crashes.length === 1 ? "1 problem recorded" : `${crashes.length} problems recorded`}
                      </Text>
                      <Muted numberOfLines={2}>{crashes[0].what}</Muted>
                    </View>
                  </Row>
                </List>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  <Btn label="Send the details" style={{ flex: 1 }} testID="crash-share"
                       onPress={async () => {
                         try { await shareCrashes(crashes); }
                         catch (e) { Alert.alert("Problems", "The report could not be written."); }
                       }} />
                  <Btn kind="ghost" label="Clear" style={{ flex: 1 }} testID="crash-clear"
                       onPress={async () => { await clearCrashes(); setCrashes([]); }} />
                </View>
              </View>
            ) : null}
            <List>
              {/* The flashcards' three directions and the new-card ration are
                  on the Study picker now, not here (§30ai): a learner sets them
                  at the moment of starting a session, and named as "Cards:
                  recognise" in a settings sheet they were never found. What
                  stays are the scheduler's other rations and its target
                  (docs/PLAYBOOK.md 2.3). Retention is what the scheduler aims
                  for: higher means more reviews for fewer lapses. */}
              <Row>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15 }}>Reviews a day</Text>
                  <Choice testID="reviews-per-day" value={st.reviewsPerDay || 200} style={{ marginTop: 8 }}
                          options={[50, 100, 200, 500].map((n) => ({ id: n, name: String(n) }))}
                          onPick={(id) => update((p) => ({ ...p, reviewsPerDay: id }))} />
                </View>
              </Row>
              <Row>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15 }}>Retention</Text>
                  <Choice testID="retention" value={st.retention || 0.9} style={{ marginTop: 8 }}
                          options={[0.8, 0.85, 0.9, 0.95].filter((r) => r >= RETENTION_MIN && r <= RETENTION_MAX)
                            .map((r) => ({ id: r, name: `${Math.round(r * 100)} %` }))}
                          onPick={(id) => update((p) => ({ ...p, retention: id }))} />
                </View>
              </Row>
              <Row>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15 }}>Learn ahead</Text>
                  <Choice testID="learn-ahead" value={st.learnAhead === undefined ? 20 : st.learnAhead} style={{ marginTop: 8 }}
                          options={[0, 10, 20, 60].map((n) => ({ id: n, name: n ? `${n} min` : "Off" }))}
                          onPick={(id) => update((p) => ({ ...p, learnAhead: id }))} />
                </View>
              </Row>
              {/* "Write drill answers" sat here until 2026-09-26 and is on the
                  drill's own cog now (Flows.js DrillOptions), where a learner
                  decides it at the moment of starting. What stays here is the
                  one thing that touches every runner: a line from the Worker
                  under a wrong answer saying why. */}
              <Row>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15 }}>Explain wrong answers</Text>
                </View>
                <Switch
                  testID="explain-switch"
                  value={st.explain !== false}
                  onValueChange={(v) => update((p) => ({ ...p, explain: v }))}
                  trackColor={{ true: t.good, false: t.surface3 }}
                />
              </Row>
              <Row>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15 }}>On-screen Russian keyboard</Text>
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
                  <Text style={{ color: t.ink, fontSize: 15 }}>Vibration</Text>
                </View>
                <Switch
                  testID="haptics-switch"
                  value={st.haptics !== false}
                  onValueChange={(v) => update((p) => ({ ...p, haptics: v }))}
                  trackColor={{ true: t.good, false: t.surface3 }}
                />
              </Row>
              <Row>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15 }}>Daily reminder</Text>
                  {Number.isFinite(st.remind) ? (
                    <Choice testID="remind-at" value={st.remind} style={{ marginTop: 8 }}
                            options={REMIND_TIMES}
                            onPick={(id) => update((p) => ({ ...p, remind: id }))} />
                  ) : null}
                  {/* One of rule 20.7's three reasons: without it the switch
                      springs back to off and nothing says why. */}
                  {remindDenied ? <Muted>Notifications are off for Bridges in Android settings</Muted> : null}
                </View>
                <Switch
                  testID="remind-switch"
                  value={Number.isFinite(st.remind)}
                  onValueChange={async (v) => {
                    if (!v) { setRemindDenied(false); update((p) => ({ ...p, remind: null })); return; }
                    /* Asked here, at the switch, and never at launch (§30c). A
                       refusal must leave the control off rather than showing a
                       reminder that cannot arrive. */
                    const ok = await askPermission();
                    setRemindDenied(!ok);
                    if (ok) update((p) => ({ ...p, remind: REMIND_DEFAULT }));
                  }}
                  trackColor={{ true: t.good, false: t.surface3 }}
                />
              </Row>
              {/* "Audio for offline" sat here until 2026-09-19. Every word and
                  sentence a lesson plays is bundled in the app now, so there
                  was nothing left for it to download. */}
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
                  <Choice testID="cue-choice" options={CUE_NAMES} value={st.cue || "bell"} style={{ marginTop: 8 }}
                          onPick={(id) => { previewCue(id); update((p) => ({ ...p, cue: id })); }} />
                </View>
              </Row>
              {/* An obligation, not a feature (rule 20.10): OpenRussian,
                  Tatoeba and Wiktionary each require the credit to travel with
                  the material, and the native app carried none of it until
                  2026-09-17. */}
              <Row testID="open-credits" onPress={() => { onClose(); onCredits(); }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15 }}>Credits</Text>
                </View>
              </Row>
              <Row onPress={() => { onClose(); onTour(); }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15 }}>Show the tour</Text>
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
                        { text: "Restore", style: "destructive", onPress: () => { restore(res.state, res.log); onClose(); } }]);
                   }} />
            </View>
            {/* An Anki deck in. It lived on the Study picker beside the sets
                until 2026-09-22 — a one-off job sitting on the screen a
                learner opens every day to choose what to practise. Here it is
                beside backup and restore, which is the same family: something
                from outside, brought in once. (Export went altogether; the
                owner's call.) The decks themselves are still listed in the
                picker, because ticking one is choosing what to study. */}
            <Btn label={importing ? "Working…" : "Import an Anki deck"} disabled={importing}
                 testID="import-deck" style={{ marginTop: 8 }} onPress={doImport} />
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
                   // only settings and imported decks stay. The review log
                   // stays too: it is a record of what happened, not a
                   // score, and it is what the scheduler learns from.
                   onPress: () => update((p) => ({
                     ...DEFAULTS,
                     ...Object.fromEntries(SETTING_KEYS.map((k) => [k, p[k]])),
                     decks: p.decks || [],
                     speech: speechDefault(),
                   })) }])}
            />
            {/* The corpora and their licences. OpenRussian is CC BY-SA 4.0 and
                Tatoeba CC BY 2.0 FR: naming them is a licence condition, not
                decoration (rule 20.10). The web build has shown this since
                2026-09-04 and the native app — the product — never had it.
                Built from the databases' own meta rows, so it cannot drift from
                what was actually shipped. */}
            {VERSION ? (
              <Muted testID="app-version" size={12} style={{ textAlign: "center", marginTop: 20 }}>
                {`Bridges ${VERSION}${/beta/.test(VERSION) ? " · beta" : ""}`}
              </Muted>
            ) : null}
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

  const learned = Object.values(st.seen).filter((e) => cardsOf(e).some(({ card }) => (card.reps || 0) > 0)).length;
  // Cleared means done — vocabulary met and the quiz passed — not merely attempted.
  const lessons = UN.reduce((a, u) => {
    let n = 0;
    for (let i = 0; i < lessonCount(u); i++) if (lessonDone(st, u, i)) n++;
    return a + n;
  }, 0);
  const due = dueCards(st.seen, Date.now(), st.learnAhead).length;
  const trouble = troubleWords(st);
  const grammar = grammarTrouble(st);
  const openUnit = (unitId) =>
    navigation.navigate("Learn", { screen: "Unit", params: { unitId } });

  return (
    <Screen>
      {/* The person, not a card of the person. This is the top of their own
          screen and there is nothing beside it to be grouped against, so the
          border and fill were doing no work — they only made the learner's name
          look like the first row of a settings list. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Avatar id={account ? account.avatar : "monkeynaut"} size={64} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.ink, fontSize: 24, fontWeight: "700",
                         letterSpacing: -0.4 }}>
            {account ? account.name : "Learner"}
          </Text>
          {account && account.placed ? (
            <Muted>{`Placed at chapter ${account.placed + 1}`}</Muted>
          ) : null}
        </View>
        <Btn kind="ghost" label="Settings" onPress={() => setSettings(true)} />
      </View>

      <View style={{ flexDirection: "row", marginTop: 26, paddingVertical: 4 }}>
        <Stat first value={String(st.streak || 0)} label="day streak" />
        <Stat value={learned.toLocaleString("en-US")} label="words seen" />
        <Stat value={String(lessons)} label="lessons cleared" />
        <Stat value={due.toLocaleString("en-US")} label="due now" />
      </View>
      {/* The numbers behind the band — what is coming, how much sticks, what
          was answered — on a screen of their own (docs/PLAYBOOK.md 2.3). */}
      <Btn kind="ghost" label="Statistics" testID="open-stats" style={{ alignSelf: "center", marginTop: 6 }}
           onPress={() => navigation.navigate("Stats")} />

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
                    <Pill>{`${maxLapses(st.seen[w])}×`}</Pill>
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
                onTour={() => navigation.navigate("Tour")}
                onCredits={() => navigation.navigate("Credits")} />
    </Screen>
  );
}
