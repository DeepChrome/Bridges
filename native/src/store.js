/* Learner state on AsyncStorage.
 *
 * Same schema and the same migrations as the web app — a profile exported from one
 * imports into the other. The difference that matters: AsyncStorage is async, so the
 * state is read once at boot into memory and written back through a debounced save
 * rather than synchronously on every keystroke like localStorage allowed.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { today } from "@core/util";

export const SCHEMA_VERSION = 4;
export const ACC_KEY = "rb.accounts";
const stateKey = (id) => "rb.state." + id;

export const DEFAULTS = {
  v: SCHEMA_VERSION,
  dev: true,            // ships on, as on the web
  theme: "auto",
  dir: 0,
  sets: [],
  seen: {},             // word -> FSRS card {s, d, due, last, reps, lapses}
  trouble: {},
  pinned: [],
  unit: {},             // unitId -> {best, done, video, lessons:{i:{v,q}}}
  drills: {},
  name: "",
  xp: 0,
  day: null,
  streak: 0,
};

/* Forward-only, and identical to the web migrations. A save that cannot be read is
   replaced by defaults rather than throwing away a partially readable one. */
const MIGRATIONS = {
  1: (s) => {
    const seen = {};
    for (const w in (s.seen || {})) {
      const old = s.seen[w] || {};
      seen[w] = { s: 0, d: 0, due: old.due || 0, last: 0, reps: old.n || 0, lapses: 0 };
    }
    return { ...s, seen, trouble: {}, pinned: [], v: 2 };
  },
  2: (s) => ({ ...s, v: 3 }),
  3: (s) => {
    const unit = {};
    for (const id in (s.unit || {})) {
      const u = s.unit[id];
      const lessons = {};
      for (const k in (u.lessons || {})) {
        const old = u.lessons[k];
        lessons[k] = typeof old === "number" ? { v: true, q: old } : old;
      }
      unit[id] = { ...u, lessons };
    }
    return { ...s, unit, v: 4 };
  },
};

export function migrate(raw, from) {
  let s = raw, v = from;
  while (v < SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) break;
    s = step(s);
    v = s.v || v + 1;
  }
  return s;
}

export function normalise(raw, assumedVersion) {
  if (!raw || typeof raw !== "object") return { ...DEFAULTS };
  return { ...DEFAULTS, ...migrate(raw, raw.v || assumedVersion || 2), v: SCHEMA_VERSION };
}

/* ---------------------------------------------------------------- profiles */

export async function loadAccounts() {
  try {
    const raw = JSON.parse((await AsyncStorage.getItem(ACC_KEY)) || "null");
    if (raw && Array.isArray(raw.list)) return raw;
  } catch (e) { /* fall through */ }
  return { list: [], active: null };
}

export async function saveAccounts(accounts) {
  try { await AsyncStorage.setItem(ACC_KEY, JSON.stringify(accounts)); } catch (e) {}
}

export function newId() {
  return "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}

export async function loadState(accountId) {
  try {
    const raw = JSON.parse((await AsyncStorage.getItem(stateKey(accountId))) || "null");
    return normalise(raw);
  } catch (e) {
    return { ...DEFAULTS };
  }
}

/* Writes are coalesced: grading a card touches state several times in a frame, and
   AsyncStorage is a real round trip. */
let pending = null, timer = null;
export function saveState(accountId, state) {
  pending = { accountId, state };
  if (timer) return;
  timer = setTimeout(async () => {
    const job = pending;
    timer = null;
    pending = null;
    try {
      await AsyncStorage.setItem(stateKey(job.accountId), JSON.stringify(job.state));
    } catch (e) {}
  }, 250);
}

export async function flushState() {
  if (!pending) return;
  const job = pending;
  clearTimeout(timer);
  timer = null;
  pending = null;
  try {
    await AsyncStorage.setItem(stateKey(job.accountId), JSON.stringify(job.state));
  } catch (e) {}
}

export function touchStreak(state) {
  const t = today();
  if (state.day === t) return state;
  // Imported or migrated state knows the streak but not when it last advanced;
  // adopt it rather than resetting to 1.
  const streak = (state.day === null || state.day === undefined)
    ? (state.streak || 1)
    : (state.day === t - 1 ? (state.streak || 0) + 1 : 1);
  return { ...state, streak, day: t };
}
