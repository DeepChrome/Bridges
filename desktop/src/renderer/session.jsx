/* The active profile and its learner state, as native/src/session.js holds
 * them on the phone: screens read `st` and call `update(fn, rows, undo)`;
 * the save is debounced, diffed against the copy last written, and sent to
 * the main process, which writes it to SQLite and schedules the push. Ops
 * another device pushed arrive on `sync:pulled` and are folded into both
 * copies. */

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULTS, normalise, touchStreak } from "@core/defaults";
import { diff, isEmpty } from "@core/repo";
import { applyOps } from "@core/sync";
import { reconcileCurriculum } from "../../../native/src/data.js";

const Ctx = createContext(null);
export const useSession = () => useContext(Ctx);

export function SessionProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [profiles, setProfiles] = useState({ list: [], active: null });
  const [st, setSt] = useState(DEFAULTS);
  const [error, setError] = useState(null);
  const [syncState, setSyncState] = useState({ state: "idle" });
  const saved = useRef(null);          // the state as the database has it
  const dirty = useRef(false);
  const log = useRef([]);
  const drops = useRef([]);
  const timer = useRef(null);
  const activeRef = useRef(null);

  const adopt = async (id) => {
    const { rows, recovered } = await window.ya.store.load(id);
    if (recovered) setError({ kind: "recovered", text: "Progress was restored from an older copy." });
    const state = rows ? normalise(rows) : { ...DEFAULTS };
    saved.current = rows ? state : null;
    const carried = reconcileCurriculum(state);
    const touched = touchStreak(carried);
    if (touched !== state) dirty.current = true;
    const link = await window.ya.sync.link(id);
    setSyncState(link ? await window.ya.sync.status(id) : { state: "idle" });
    if (link) window.ya.sync.now(id);
    return touched;
  };

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const p = await window.ya.profiles.list();
        if (!live) return;
        setProfiles(p);
        activeRef.current = p.active;
        if (p.active) {
          const loaded = await adopt(p.active);
          if (!live) return;
          setSt(loaded);
        }
      } catch (e) {
        if (live) setError({ kind: "boot", text: `Ya could not start: ${e && e.message}` });
      }
      if (live) setReady(true);
    })();
    const offPulled = window.ya.on("sync:pulled", (id, ops) => {
      if (!live || id !== activeRef.current) return;
      if (saved.current) saved.current = applyOps(saved.current, ops);
      setSt((prev) => applyOps(prev, ops));
    });
    const offStatus = window.ya.on("sync:status", (id, s) => { if (live && id === activeRef.current) setSyncState(s); });
    const flush = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; write(); } };
    window.addEventListener("beforeunload", flush);
    return () => { live = false; offPulled(); offStatus(); window.removeEventListener("beforeunload", flush); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* The save: diffed against the last copy written; one write at a time. */
  const latest = useRef(st);
  latest.current = st;
  const write = async () => {
    const id = activeRef.current;
    if (!id) return;
    const state = latest.current;
    const rows = log.current, gone = drops.current;
    log.current = []; drops.current = [];
    const d = diff(saved.current, state);
    if (isEmpty(d) && !rows.length && !gone.length) return;
    try {
      await window.ya.store.apply(id, d, rows, gone);
      saved.current = state;
    } catch (e) {
      log.current = rows.concat(log.current);
      drops.current = gone.concat(drops.current);
      setError({ kind: "write", text: "Progress could not be saved." });
    }
  };
  useEffect(() => {
    if (!ready || !profiles.active || !dirty.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; write(); }, 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, ready, profiles.active]);

  const value = useMemo(() => ({
    ready, error, profiles, st, syncState,
    account: profiles.list.find((a) => a.id === profiles.active) || null,
    update(fn, rows, undo) {
      dirty.current = true;
      if (rows && rows.length) log.current.push(...rows);
      if (undo && undo.length) drops.current.push(...undo);
      setSt((prev) => fn(prev));
    },
    clearError() { setError(null); },
    async updateAccount(patch) {
      const next = { ...profiles, list: profiles.list.map((a) => (a.id === profiles.active ? { ...a, ...patch } : a)) };
      setProfiles(next);
      await window.ya.profiles.save(next);
    },
    /* A profile made here: `token` is a paired device token (the account is
       the phone's and the first sync pulls it), or none for a profile of this
       computer's own. */
    async createProfile(name, avatar, { id } = {}) {
      const pid = id || (await window.ya.profiles.newId());
      const a = { id: pid, name: name || "Learner", avatar: avatar || "monkeynaut", created: Math.floor(Date.now() / 86400000) };
      const next = { list: profiles.list.concat(a), active: pid };
      setProfiles(next);
      await window.ya.profiles.save(next);
      activeRef.current = pid;
      const loaded = await adopt(pid);
      dirty.current = true;
      setSt(loaded);
      return a;
    },
    async selectProfile(id) {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; await write(); }
      const next = { ...profiles, active: id };
      setProfiles(next);
      await window.ya.profiles.save(next);
      activeRef.current = id;
      dirty.current = false;
      setSt(await adopt(id));
    },
    async signOut() {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; await write(); }
      const next = { ...profiles, active: null };
      setProfiles(next);
      await window.ya.profiles.save(next);
      activeRef.current = null;
      dirty.current = false;
      setSt(DEFAULTS);
    },
  }), [ready, error, profiles, st, syncState]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
