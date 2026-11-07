/* The computer's own settings — appearance, phonetic typing, the inspector
   open or shut — kept in settings.json by the main process, not in the
   profile: a display preference is this machine's, not the learner's. */

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { applyTheme } from "./theme.js";
import { configureAudio } from "./audio.js";

const Ctx = createContext({ settings: {}, setSettings: () => {} });
export const useSettings = () => useContext(Ctx);

const DEFAULT_SETTINGS = { appearance: "system", phonetic: true, speed: "normal" };

export function SettingsProvider({ children }) {
  const [settings, set] = useState(DEFAULT_SETTINGS);
  const [system, setSystem] = useState("dark");
  useEffect(() => {
    window.ya.settings.get().then((s) => set({ ...DEFAULT_SETTINGS, ...s }));
    window.ya.app.theme().then(setSystem);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setSystem(mq.matches ? "dark" : "light");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const scheme = settings.appearance === "system" ? system : settings.appearance;
  useEffect(() => { applyTheme(scheme); }, [scheme]);
  useEffect(() => { configureAudio({ speed: settings.speed }); }, [settings.speed]);
  const value = useMemo(() => ({
    settings, scheme,
    setSettings(patch) {
      set((s) => ({ ...s, ...patch }));
      window.ya.settings.set(patch);
    },
  }), [settings, scheme]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
