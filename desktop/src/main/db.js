/* A profile's database on Node's own SQLite (node:sqlite, in Electron's Node
 * since 24), behind the slice of expo-sqlite's async API that core/sqlrepo.js
 * uses — the same adapter shape native/__tests__/sqlite.test.js drives, so
 * the SQL the phone runs is the SQL the desktop runs.
 *
 * One file per profile in Electron's userData directory, `ya-<profile>.db`.
 * A file that will not open is moved aside under a stamped name and never
 * deleted (rule 20.4), and the caller is told.
 */

import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { existsSync, renameSync } from "node:fs";
import { sqliteRepo } from "@core/sqlrepo";

export const dbName = (id) => `ya-${id}.db`;
const COMPANIONS = ["", "-wal", "-shm", "-journal"];

/* expo-sqlite's shape on node:sqlite. Params arrive as an array. */
export function expoLike(file) {
  const db = new DatabaseSync(file);
  const bind = (p) => (p === undefined ? [] : Array.isArray(p) ? p : [p]);
  return {
    async execAsync(sql) { db.exec(sql); },
    async runAsync(sql, params) {
      const r = db.prepare(sql).run(...bind(params));
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowid };
    },
    async getAllAsync(sql, params) { return db.prepare(sql).all(...bind(params)); },
    async getFirstAsync(sql, params) {
      const r = db.prepare(sql).get(...bind(params));
      return r === undefined ? null : r;
    },
    async prepareAsync(sql) {
      const s = db.prepare(sql);
      return { async executeAsync(params) { return s.run(...bind(params)); }, async finalizeAsync() {} };
    },
    async withTransactionAsync(fn) {
      db.exec("BEGIN");
      try { await fn(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
    },
    async closeAsync() { db.close(); },
  };
}

function setAside(dir, id) {
  const stamp = Date.now();
  for (const s of COMPANIONS) {
    const f = join(dir, dbName(id) + s);
    if (existsSync(f)) renameSync(f, join(dir, `ya-${id}.bad-${stamp}.db${s}`));
  }
}

/* -> { repo, recovered }: `recovered` is null, or what went wrong with the
   file that was set aside on the way to this fresh one. */
export async function openRepo(dir, id) {
  const file = join(dir, dbName(id));
  let db = null;
  try {
    db = expoLike(file);
    return { repo: await sqliteRepo(db), recovered: null };
  } catch (e) {
    if (db) { try { await db.closeAsync(); } catch (e2) { /* nothing to close */ } }
    setAside(dir, id);
    const repo = await sqliteRepo(expoLike(file));
    return { repo, recovered: String((e && e.message) || e) };
  }
}
