/* One place that owns the active profile and its learner state.
 *
 * Screens read `st` and call `update(fn)`; the write is coalesced by store.js. Keeping
 * mutation behind a single updater is what stops the async storage from racing the
 * way scattered `save()` calls would.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULTS, loadAccounts, saveAccounts, loadState, saveState, flushState,
  newId, touchStreak,
} from "./store";

const Ctx = createContext(null);

export function SessionProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [accounts, setAccounts] = useState({ list: [], active: null });
  const [st, setSt] = useState(DEFAULTS);

  useEffect(() => {
    // Guarded: the load is asynchronous, and setting state on a provider that has
    // already gone away is a real bug, not just a warning — it lands on a detached
    // tree and the next mount can inherit the mess.
    let live = true;
    (async () => {
      const acc = await loadAccounts();
      if (!live) return;
      setAccounts(acc);
      if (acc.active) {
        const loaded = touchStreak(await loadState(acc.active));
        if (!live) return;
        setSt(loaded);
        saveState(acc.active, loaded);
      }
      if (live) setReady(true);
    })();
    return () => { live = false; flushState(); };
  }, []);

  const value = useMemo(() => ({
    ready,
    accounts,
    account: accounts.list.find((a) => a.id === accounts.active) || null,
    st,

    update(fn) {
      setSt((prev) => {
        const next = fn(prev);
        if (accounts.active) saveState(accounts.active, next);
        return next;
      });
    },

    async createProfile(name, avatar) {
      const a = { id: newId(), name: name || "Learner", avatar,
                  created: Math.floor(Date.now() / 86400000), placed: null };
      const acc = { list: accounts.list.concat(a), active: a.id };
      setAccounts(acc);
      await saveAccounts(acc);
      const fresh = touchStreak({ ...DEFAULTS });
      setSt(fresh);
      saveState(a.id, fresh);
      return a;
    },

    async selectProfile(id) {
      const acc = { ...accounts, active: id };
      setAccounts(acc);
      await saveAccounts(acc);
      const loaded = touchStreak(await loadState(id));
      setSt(loaded);
      saveState(id, loaded);
    },

    async signOut() {
      await flushState();
      const acc = { ...accounts, active: null };
      setAccounts(acc);
      await saveAccounts(acc);
      setSt(DEFAULTS);
    },
  }), [ready, accounts, st]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
