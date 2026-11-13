/* A run in progress, kept so it can be picked up again (the owner, 2026-10-02:
 * "during lessons and other activities, there should be a mechanism to save
 * progress so they can continue where they left off… automatically without any
 * sort of save button. Maybe if the app restarts it can prompt them if they'd
 * like to continue where they left off or start again").
 *
 * One AsyncStorage row per profile (`rb.resume.<id>`): per run key, the deck
 * as it was dealt, where the learner had got to, the tally so far, and how to
 * get back to the screen (route, params, a title for the prompt).
 *
 * Not the learner database, for the reason Immerse's place is not (immerse.js):
 * this is the screen's memory. The grades a run has already handed in are in
 * the scheduler the moment they were given; what is kept here is only the
 * question order and the running mark, and losing it costs a restart, never a
 * card. Writes go straight to storage — an answer is seconds apart from the
 * next, and a run must survive the app being killed between two of them. */

import React, { useState } from "react";
import { View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Screen, Btn, Text } from "./ui";
import { type as T } from "./theme";
import { GuidePop } from "./guide";
import { RunCard } from "./resumesheet";
import { CURRICULUM } from "./data";
import { installedBuild } from "./update";

/* Which build and curriculum a run was dealt under. A deck carries lemma
   indices, which shift on every rebuild (rule 20.4): a run saved on one
   build and resumed on the next would grade other words under the old
   labels. A mismatch is simply not offered. The build is the installed
   package's versionName (stamped per build since 2026-11-12); before that it
   was app.json's version, which every local build shared, so only the
   curriculum stamp ever told two builds apart. */
const STAMP = () => `${installedBuild().name}|${CURRICULUM || ""}`;

const KEY = (id) => `rb.resume.${id}`;
/* A run older than this is not "where you left off", it is something you
   left. Kept small too: one run a kind of activity is what anyone resumes. */
export const RESUME_MAX_AGE = 7 * 86400000;
const MAX_RUNS = 12;

let profile = null;
let runs = {};
let offered = false;

export async function loadResume(profileId) {
  if (profileId === profile) return;
  profile = profileId;
  offered = false;                    // each profile is offered its own run once
  runs = {};
  if (!profileId) return;
  try {
    const raw = await AsyncStorage.getItem(KEY(profileId));
    const got = raw ? JSON.parse(raw) : null;
    if (got && typeof got === "object" && profile === profileId) runs = got;
  } catch (e) { /* an unreadable row is nothing to resume, never a crash */ }
}

function write() {
  if (!profile) return;
  AsyncStorage.setItem(KEY(profile), JSON.stringify(runs)).catch(() => {});
}

const fresh = (r, now) => !!r && Array.isArray(r.queue) && r.at > 0
  && r.at < r.queue.length && now - (r.saved || 0) < RESUME_MAX_AGE && r.stamp === STAMP();

/* The saved run under `key`, or null when there is none worth offering. */
export function savedRun(key, now = Date.now()) {
  const r = key ? runs[key] : null;
  return fresh(r, now) ? r : null;
}

export function saveRun(key, snap, now = Date.now()) {
  if (!key || !profile) return;
  const next = { ...runs, [key]: { ...snap, saved: now, stamp: STAMP() } };
  const keep = Object.keys(next).sort((a, b) => next[b].saved - next[a].saved).slice(0, MAX_RUNS);
  runs = Object.fromEntries(keep.map((k) => [k, next[k]]));
  write();
}

export function clearRun(key) {
  if (!key || !runs[key]) return;
  const { [key]: _, ...rest } = runs;
  runs = rest;
  write();
}

/* The newest run worth offering on the way back into the app. */
export function latestRun(now = Date.now()) {
  const list = Object.entries(runs).filter(([, r]) => fresh(r, now) && r.route)
    .sort((a, b) => b[1].saved - a[1].saved);
  return list.length ? { key: list[0][0], ...list[0][1] } : null;
}

/* The run to offer when the app is opened: once a launch, so leaving the path
   and coming back to it does not ask again — and once a run, so a run that
   was offered and passed over is not offered on every launch for a week (the
   owner, 2026-10-29: "every time I open the app, I get a continue where you
   left off prompt… it should only do that if I was halfway through an
   exercise and closed the app"). Every run on the row is stamped `offered`
   when the sheet is shown; `saveRun` rebuilds a run from its snapshot, so one
   more answer in it makes it offerable again. The run itself is kept: opening
   its own screen still asks (useResume), which is where leaving it and coming
   back belongs. */
export function launchOffer(now = Date.now()) {
  if (offered || !profile) return null;
  offered = true;
  const run = latestRun(now);
  if (!run || run.offered) return null;
  runs = Object.fromEntries(Object.entries(runs).map(([k, r]) => [k, { ...r, offered: true }]));
  write();
  return run;
}

/* Tests start each case clean. */
export function resetResume() {
  profile = null;
  runs = {};
  offered = false;
}

/* Whether a flow starts fresh or from where it was left (resume.js). Returns
   `{ restore, prompt }`: while a saved run waits on the learner's choice,
   `prompt` is the screen to show instead of the runner. `params.resume`
   (from the prompt on the way back into the app) means the choice is made. */
/* `onRestart` is what "Start again" leads to before question 1 — a drill's
   options (the owner, 2026-10-04: "If the person says they don't want to
   continue, I'd expect it to prompt them for the question types prior to
   going to question 1"). */
export function useResume(key, params, { onRestart } = {}) {
  const [choice, setChoice] = useState(() => {
    const run = savedRun(key);
    if (!run) return { restore: null };
    return params && params.resume ? { restore: run } : { pending: run };
  });
  const prompt = choice.pending ? (
    <ResumePrompt run={choice.pending}
                  onContinue={() => setChoice({ restore: choice.pending })}
                  onRestart={() => { clearRun(key); setChoice({ restore: null }); if (onRestart) onRestart(); }} />
  ) : null;
  return { restore: choice.restore || null, prompt };
}

export function ResumePrompt({ run, onContinue, onRestart }) {
  return (
    <Screen fill>
      <View testID="resume-prompt"
            style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 }}>
        <GuidePop pose="wave" size={96} style={{ marginBottom: 14 }} />
        <Text style={{ fontSize: T.title, fontWeight: "700", textAlign: "center", marginBottom: 18 }}>
          Pick up where you left off
        </Text>
        <View style={{ alignSelf: "stretch" }}><RunCard run={run} /></View>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Btn kind="ghost" label="Start again" style={{ flex: 1 }} onPress={onRestart} />
        <Btn kind="pri" label="Continue" style={{ flex: 1 }} onPress={onContinue} />
      </View>
    </Screen>
  );
}
