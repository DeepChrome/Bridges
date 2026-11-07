/* The repository on SQLite lives in core/sqlrepo.js since 2026-11-07: the
   desktop app runs the same SQL on Node's own SQLite, and a store duplicated
   across the two apps is how they come to disagree (§20a). This is the
   phone's import path for it; db.js is still the one place a file is opened. */

export { sqliteRepo, SCHEMA } from "@core/sqlrepo";
