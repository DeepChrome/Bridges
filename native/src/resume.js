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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { CURRICULUM } from "./data";
import { expo as APP } from "../app.json";

/* Which build and curriculum a run was dealt under. A deck carries lemma
   indices, which shift on every rebuild (rule 20.4): a run saved on one
   build and resumed on the next would grade other words under the old
   labels. A mismatch is simply not offered. */
const STAMP = () => `${APP.version}|${CURRICULUM || ""}`;

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
   and coming back to it does not ask again. */
export function launchOffer(now = Date.now()) {
  if (offered || !profile) return null;
  offered = true;
  return latestRun(now);
}

/* Tests start each case clean. */
export function resetResume() {
  profile = null;
  runs = {};
  offered = false;
}
