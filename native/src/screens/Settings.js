/* Settings — the sheet off the profile (screens/You.js opens it). */

import React, { useEffect, useState } from "react";
import { View, Switch, Alert, Pressable } from "react-native";
import { useSession } from "../session";
import { DEFAULTS, SETTING_KEYS } from "../store";
import { speechDefault } from "@core/state";
import { useTheme, type as T } from "../theme";
import { setAppearance, useScheme } from "../appearance";
import { List, Row, Btn, Muted, Avatar, Choice, Sheet, Text, Stepper, RowText, ToggleRow } from "../ui";
import { CharacterPicker } from "./Gate";
import { STATS } from "../data";
import { CUE_NAMES, WRONG_NAMES, SPEEDS, previewCue, rightCueOf, wrongCueOf } from "../audio";
import { backupProfile, restoreProfile, shareCrashes } from "../backup";
import { readCrashes, clearCrashes } from "../crash";
import { importDeck } from "../anki";
import { today } from "@core/util";
import { newDeckId } from "../studycards";
import Constants from "expo-constants";
import { QUEUE_DEFAULTS, ALL_DAYS } from "@core/queue";
import { askPermission } from "../notify";
import { APP_NAME } from "../brand";
import { SyncSection } from "../syncui";

/* What build this is, at the foot of Settings. The version is app.json's
   (1.0.0-beta.N while it is a beta), read off the build so it cannot say
   something the binary is not. */
const VERSION = (Constants.expoConfig && Constants.expoConfig.version) || "";

/* When the reminder may land, as minutes past midnight. Four, not twenty-four:
   the question is which part of the day a learner studies in, and a list long
   enough to scroll turns a two-second decision into a chore. */
export const REMIND_TIMES = [
  { id: 8 * 60, name: "08:00" },
  { id: 13 * 60, name: "13:00" },
  { id: 17 * 60, name: "17:00" },
  { id: 21 * 60, name: "21:00" },
];
/* Toward the end of the day, while there is still time to meet the goal (the
   owner, 2026-10-05: "maybe 5pm"). */
export const REMIND_DEFAULT = 17 * 60;

/* The days a learner studies on (core/queue.js isStudyDay): the goal grows
   and the reminder lands on these only. Sunday is 0, as Date counts. */
export const WEEK = [["M", 1], ["T", 2], ["W", 3], ["T", 4], ["F", 5], ["S", 6], ["S", 0]];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function StudyDays({ value, onChange }) {
  const t = useTheme();
  const on = Array.isArray(value) && value.length ? value : ALL_DAYS;
  const flip = (d) => {
    const next = on.includes(d) ? on.filter((x) => x !== d) : on.concat(d);
    // At least one: a week with no study days has no goal to meet.
    if (next.length) onChange(next.length === 7 ? null : next.sort());
  };
  return (
    <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
      {WEEK.map(([label, d]) => {
        const sel = on.includes(d);
        return (
          <Pressable key={d} testID={`study-day-${d}`} onPress={() => flip(d)} hitSlop={4}
                     accessibilityRole="checkbox" accessibilityState={{ checked: sel }}
                     accessibilityLabel={DAY_NAMES[d]}
                     style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, alignItems: "center",
                       justifyContent: "center", borderWidth: 1,
                       borderColor: sel ? t.brand : t.line, backgroundColor: sel ? t.brandBg : "transparent",
                       opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ color: sel ? t.brandInk : t.ink3, fontSize: 14, fontWeight: "700" }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* The picture, changeable (the owner, 2026-09-29): the same characters the
   profile was made with, a tap to open them and a tap to choose. Its own
   component, holding its own open state, so it redraws on its own inside the
   sheet. */
export function PictureSection() {
  const t = useTheme();
  const { account, updateAccount } = useSession();
  const [picking, setPicking] = useState(false);
  return (
    <>
      <List>
        <Row testID="change-picture" onPress={() => setPicking(!picking)}>
          <Avatar id={account ? account.avatar : null} size={36} />
          <RowText title="Picture" bold={false} />
          <Muted>{picking ? "Done" : "Change"}</Muted>
        </Row>
      </List>
      {picking ? (
        <View style={{ marginTop: 12 }}>
          <CharacterPicker value={account ? account.avatar : null}
                           onPick={(id) => { updateAccount({ avatar: id }); }} />
        </View>
      ) : null}
    </>
  );
}

export function Settings({ visible, onClose, onLab, onTour, onCredits, onFeedback }) {
  const { st, update, signOut, account, restore } = useSession();
  const t = useTheme();
  const scheme = useScheme();
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
           footer={<Btn block kind="pri" label="Done" style={{ marginTop: 14 }} onPress={onClose} />}>
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
                      <Text style={{ color: t.bad, fontSize: T.body, fontWeight: "600" }}>
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

            <PictureSection />
            <View style={{ height: 16 }} />
            <List>
              {/* How many new words the flashcards bring in a day — the same
                  setting as the Study picker's, so the two cannot disagree
                  (the owner, 2026-09-29: "maybe a global setting for new words
                  per day?"). Reviews a day, retention and learn-ahead were
                  here and are gone (same day: "those are absurdly long… for
                  now, disable those"); the scheduler keeps its defaults. */}
              <Row>
                <RowText title="New words a day" bold={false} />
                <Stepper testID="settings-new-per-day" label="New words a day" min={0} max={99}
                         value={st.newPerDay === undefined ? QUEUE_DEFAULTS.newPerDay : st.newPerDay}
                         onChange={(n) => update((p) => ({ ...p, newPerDay: n }))} />
              </Row>
              <Row>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: T.body }}>Study days</Text>
                  <StudyDays value={st.studyDays}
                             onChange={(days) => update((p) => ({ ...p, studyDays: days }))} />
                </View>
              </Row>
              {/* "Explain wrong answers" sat here until 2026-10-05; it is a
                  switch in the AI usage sheet now (PlanRow), beside what it
                  spends, with the spoken-answer checks. */}
              {/* The English under the tutor's Russian, in Talk and in the
                  Tutor (the owner, 2026-09-26: "if the user wants, they can
                  disable the English in settings"). One key, `talkEn`; Talk's
                  toolbar EN button writes the same one. */}
              <ToggleRow title="English under the tutor" testID="tutor-en-switch"
                         value={st.talkEn !== false}
                         onValueChange={(v) => update((p) => ({ ...p, talkEn: v }))} />
              <ToggleRow title="On-screen Russian keyboard" testID="osk-switch"
                         value={!!st.osk}
                         onValueChange={(v) => update((p) => ({ ...p, osk: v }))} />
              {/* Light or dark (appearance.js): the phone's setting until this is
                  flipped, then the choice holds. */}
              <ToggleRow title="Dark mode" testID="dark-switch"
                         value={scheme === "dark"}
                         onValueChange={(v) => setAppearance(v ? "dark" : "light")} />
              <ToggleRow title="Vibration" testID="haptics-switch"
                         value={st.haptics !== false}
                         onValueChange={(v) => update((p) => ({ ...p, haptics: v }))} />
              <Row>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: T.body }}>Daily reminder</Text>
                  {Number.isFinite(st.remind) ? (
                    <Choice testID="remind-at" value={st.remind} style={{ marginTop: 8 }}
                            options={REMIND_TIMES}
                            onPick={(id) => update((p) => ({ ...p, remind: id }))} />
                  ) : null}
                  {/* One of rule 20.7's three reasons: without it the switch
                      springs back to off and nothing says why. */}
                  {remindDenied ? <Muted>{`Notifications are off for ${APP_NAME} in Android settings`}</Muted> : null}
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
                  <Text style={{ color: t.ink, fontSize: T.body }}>Reading speed</Text>
                  <Muted>Press a speaker twice for slower</Muted>
                  <Choice testID="speed-choice" options={SPEEDS} value={st.speed || "normal"} style={{ marginTop: 8 }}
                          onPick={(id) => update((p) => ({ ...p, speed: id }))} />
                </View>
              </Row>
              <Row>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: T.body }}>Right-answer sound</Text>
                  <Choice testID="cue-choice" options={CUE_NAMES} value={rightCueOf(st.cue)} style={{ marginTop: 8 }}
                          onPick={(id) => { previewCue(id); update((p) => ({ ...p, cue: id })); }} />
                </View>
              </Row>
              <Row>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: T.body }}>Wrong-answer sound</Text>
                  <Choice testID="wrong-cue-choice" options={WRONG_NAMES} value={wrongCueOf(st.wrongCue)} style={{ marginTop: 8 }}
                          onPick={(id) => { previewCue(id); update((p) => ({ ...p, wrongCue: id })); }} />
                </View>
              </Row>
              {/* An obligation, not a feature (rule 20.10): OpenRussian,
                  Tatoeba and Wiktionary each require the credit to travel with
                  the material, and the native app carried none of it until
                  2026-09-17. The same screen opens on a few lines about the
                  app (2026-10-02). */}
              <Row testID="open-credits" onPress={() => { onClose(); onCredits(); }}>
                <RowText title="About" bold={false} />
              </Row>
              <Row onPress={() => { onClose(); onTour(); }}>
                <RowText title="Show the tour" bold={false} />
              </Row>
              {/* A tester's words, straight to the owner (screens/Feedback.js,
                  POST /v1/report). */}
              <Row testID="send-feedback" onPress={() => { onClose(); onFeedback(); }}>
                <RowText title="Send feedback" bold={false} />
              </Row>
              {/* Last, not first: a new learner's settings sheet should not
                  open on a switch they cannot place. It ships **off** since
                  2026-09-23 (rule 20.9 — a learner walks the path from the
                  top) and lives here so the owner can still unlock the course
                  on his own phone; the comment used to say "ships on" and had
                  been wrong for four days. */}
              <ToggleRow title="Developer mode" sub="All lessons unlocked" testID="dev-switch"
                         value={!!st.dev}
                         onValueChange={(v) => update((p) => ({ ...p, dev: v }))} />
              {st.dev ? (
                // A measuring tool, not a feature: only with developer mode on.
                <Row onPress={() => { onClose(); onLab(); }}>
                  <RowText title="STT Lab" bold={false} />
                </Row>
              ) : null}
            </List>

            {/* This profile on another device (src/syncui.js, 2026-11-07). */}
            <SyncSection />

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
              kind="danger"
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
                {`${APP_NAME} ${VERSION}`}
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
