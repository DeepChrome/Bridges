/* One place that owns the active profile and its learner state.
 *
 * Screens read `st` and call `update(fn)`; the write is coalesced by store.js. Keeping
 * mutation behind a single updater is what stops the async storage from racing the
 * way scattered `save()` calls would.
 *
 * The save runs from an effect on `st`, not inside the updater: React may call an
 * updater lazily or twice, and a side effect there is a write that may or may
 * not happen. Only state the learner changed is written (`dirty`): a loaded
 * profile is not re-saved on the way in, which is what protects an unreadable
 * row (store.js) from being replaced by the defaults shown in its place.
 */

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  DEFAULTS, loadAccounts, saveAccounts, loadState, saveState, flushState, setAside,
  onWriteError, forgetDecks, newId, touchStreak,
} from "./store";

const Ctx = createContext(null);

/* What the learner is told when the save layer fails. Kept short; the banner in
   App.js shows it with the choices that fit. */
export const ERRORS = {
  unreadable: "Your saved progress could not be read. It has been kept aside; "
    + "this is a fresh start unless you restore a backup.",
  write: "Progress could not be saved. Check the phone's storage.",
};

export function SessionProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);       // { kind, text } | null
  const [accounts, setAccounts] = useState({ list: [], active: null });
  const [st, setSt] = useState(DEFAULTS);
  const dirty = useRef(false);

  const adopt = async (id) => {
    const { state, bad } = await loadState(id);
    if (bad) {
      await setAside(id, bad);
      setError({ kind: "unreadable", text: ERRORS.unreadable });
      return state;                                  // shown, not saved
    }
    const touched = touchStreak(state);
    // The streak advanced: that is a change worth writing.
    if (touched !== state) { dirty.current = true; }
    return touched;
  };

  useEffect(() => {
    // Guarded: the load is asynchronous, and setting state on a provider that has
    // already gone away is a real bug, not just a warning — it lands on a detached
    // tree and the next mount can inherit the mess.
    let live = true;
    (async () => {
      try {
        const acc = await loadAccounts();
        if (!live) return;
        setAccounts(acc);
        if (acc.active) {
          const loaded = await adopt(acc.active);
          if (!live) return;
          setSt(loaded);
        }
      } catch (e) {
        if (live) setError({ kind: "boot", text: `Bridges could not start: ${e && e.message}` });
      }
      if (live) setReady(true);
    })();
    const offWrite = onWriteError(() => { if (live) setError({ kind: "write", text: ERRORS.write }); });
    // Leaving the app is when a pending write is most likely to be lost.
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "background" || s === "inactive") flushState();
    });
    return () => { live = false; offWrite(); sub.remove(); flushState(); };
  }, []);

  useEffect(() => {
    if (!ready || !accounts.active || !dirty.current) return;
    saveState(accounts.active, st);
  }, [st, ready, accounts.active]);

  const value = useMemo(() => ({
    ready,
    error,
    accounts,
    account: accounts.list.find((a) => a.id === accounts.active) || null,
    st,

    update(fn) {
      dirty.current = true;
      // The learner has acted on what is shown; from here on it is saved.
      setError((e) => (e && e.kind === "unreadable" ? null : e));
      setSt((prev) => fn(prev));
    },

    clearError() { setError(null); },

    /* Fields on the profile record itself (name, avatar, placement), saved with
       the accounts, not the state. */
    async updateAccount(patch) {
      const acc = { ...accounts, list: accounts.list.map((a) => (a.id === accounts.active ? { ...a, ...patch } : a)) };
      setAccounts(acc);
      await saveAccounts(acc);
    },

    async createProfile(name, avatar) {
      const a = { id: newId(), name: name || "Learner", avatar,
                  created: Math.floor(Date.now() / 86400000), placed: null };
      const acc = { list: accounts.list.concat(a), active: a.id };
      setAccounts(acc);
      await saveAccounts(acc);
      forgetDecks();
      const fresh = touchStreak({ ...DEFAULTS });
      dirty.current = true;
      setSt(fresh);
      saveState(a.id, fresh);
      return a;
    },

    async selectProfile(id) {
      await flushState();
      const acc = { ...accounts, active: id };
      setAccounts(acc);
      await saveAccounts(acc);
      forgetDecks();
      dirty.current = false;
      const loaded = await adopt(id);
      setSt(loaded);
    },

    /* Replace the whole state — a restored backup. Saved at once. */
    restore(state) {
      dirty.current = true;
      setError(null);
      setSt(touchStreak(state));
    },

    async signOut() {
      await flushState();
      const acc = { ...accounts, active: null };
      setAccounts(acc);
      await saveAccounts(acc);
      dirty.current = false;
      setSt(DEFAULTS);
    },
  }), [ready, error, accounts, st]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
