/* Opening a profile's database: the one place that knows where the files are.
 *
 * `bridges-<profile>.db` in expo-sqlite's own directory, one per profile, so
 * every table is one learner's and forgetting a profile is forgetting a file.
 * In jest this module is replaced by the in-memory store (jest.setup.js);
 * sqlite.test.js reaches the real one with an opener of its own.
 *
 * A file that cannot be opened is moved aside under a stamped name, every
 * companion file with it, and never deleted (rule 20.4): the caller gets a
 * fresh database and a note saying so, and store.js then stands the older
 * JSON row in if there is one. `deps` is for the tests.
 */

import { openDatabaseAsync, defaultDatabaseDirectory } from "expo-sqlite";
import { File } from "expo-file-system";
import { sqliteRepo } from "./sqlite";

export const dbName = (id) => `bridges-${id}.db`;
const COMPANIONS = ["", "-wal", "-shm", "-journal"];

async function setAside(id) {
  const stamp = Date.now();
  const dir = "file://" + String(defaultDatabaseDirectory || "").replace(/^file:\/\//, "");
  for (const s of COMPANIONS) {
    const f = new File(dir, dbName(id) + s);
    if (f.exists) await f.move(new File(dir, `bridges-${id}.bad-${stamp}.db${s}`));
  }
}

/* -> { repo, recovered }: `recovered` is null, or what went wrong with the
   file that was set aside on the way to this fresh one. */
export async function openRepo(id, deps = {}) {
  const d = { open: (name) => openDatabaseAsync(name), setAside: setAside, ...deps };
  let db = null;
  try {
    db = await d.open(dbName(id));
    return { repo: await sqliteRepo(db), recovered: null };
  } catch (e) {
    if (db) { try { await db.closeAsync(); } catch (e2) { /* it did not open properly; nothing to close */ } }
    await d.setAside(id);
    const repo = await sqliteRepo(await d.open(dbName(id)));
    return { repo: repo, recovered: String((e && e.message) || e) };
  }
}
