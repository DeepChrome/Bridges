/* The profiles on this computer and the one that is open.
 *
 * `profiles.json` in userData: { list: [{ id, name, avatar, created }],
 * active }. A profile's learning is its database (db.js); this file is only
 * the list. Desktop settings that are the machine's and not the learner's —
 * the Worker address, the install token, window size — sit beside it in
 * `settings.json`.
 */

import { app } from "electron";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { openRepo } from "./db.js";

const dir = () => app.getPath("userData");
const PROFILES = () => join(dir(), "profiles.json");
const SETTINGS = () => join(dir(), "settings.json");

function readJson(file, fallback) {
  try { return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback; } catch (e) { return fallback; }
}
function writeJson(file, value) {
  mkdirSync(dir(), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 1));
}

export function loadProfiles() {
  const p = readJson(PROFILES(), null);
  return p && Array.isArray(p.list) ? p : { list: [], active: null };
}
export function saveProfiles(p) { writeJson(PROFILES(), p); }

export function loadSettings() { return readJson(SETTINGS(), {}); }
export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  writeJson(SETTINGS(), next);
  return next;
}

export const newId = () => "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);

/* One repository open per profile id for the life of the process. */
const open = new Map();
export async function repoFor(id) {
  if (!open.has(id)) open.set(id, openRepo(dir(), id));
  return (await open.get(id)).repo;
}
export async function recoveredNote(id) {
  return open.has(id) ? (await open.get(id)).recovered : null;
}
export async function closeAll() {
  for (const p of open.values()) { try { (await p).repo.close(); } catch (e) { /* closing */ } }
  open.clear();
}
