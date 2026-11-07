/* A field for a Russian answer, on a keyboard that may have no Russian.
 *
 * With phonetic typing on (Settings → Typing; Ctrl+Shift+R flips it for the
 * moment), the letters typed are kept as typed and shown as the Russian they
 * spell (core/typing.js): p-r-i-v-e-t reads «привет» as it is typed, and
 * Backspace takes back one Latin letter. Cyrillic typed with Windows' own
 * layout passes straight through. The value handed up is always the Russian. */

import React, { useEffect, useRef, useState } from "react";
import { typeRu, hasLatin } from "@core/typing";
import { useSettings } from "./settings.js";

export function RuInput({ value, onChange, onSubmit, placeholder = "Russian", autoFocus, disabled, testID, big = true }) {
  const { settings, setSettings } = useSettings();
  const phonetic = settings.phonetic !== false;
  /* The Latin buffer, kept while the field is being typed into. Cleared when
     the value is set from outside (a new question) or the mode changes. */
  const [raw, setRaw] = useState("");
  const ref = useRef(null);
  useEffect(() => { if (!value) setRaw(""); }, [value]);
  useEffect(() => { if (autoFocus && ref.current) ref.current.focus(); }, [autoFocus]);

  const change = (e) => {
    const s = e.target.value;
    if (!phonetic || !hasLatin(s)) { setRaw(""); onChange(s); return; }
    /* The field shows the Russian, so what arrives is Russian-so-far plus the
       new Latin keystrokes at the end; the buffer is what the typist typed. */
    const shown = typeRu(raw);
    let nextRaw;
    if (s.startsWith(shown)) nextRaw = raw + s.slice(shown.length);
    else if (shown.startsWith(s)) nextRaw = raw.slice(0, Math.max(0, raw.length - (shown.length - s.length)));
    else nextRaw = s;
    setRaw(nextRaw);
    onChange(typeRu(nextRaw));
  };
  const key = (e) => {
    if (e.key === "Enter" && onSubmit) { e.preventDefault(); onSubmit(); }
    if (e.key === "r" && e.ctrlKey && e.shiftKey) { e.preventDefault(); setSettings({ phonetic: !phonetic }); setRaw(""); }
  };
  return (
    <div className="hrow" style={{ alignItems: "stretch" }}>
      <input ref={ref} className={"field" + (big ? "" : " sm")} value={value || ""} onChange={change} onKeyDown={key}
             placeholder={placeholder} disabled={disabled} autoComplete="off" spellCheck={false}
             data-testid={testID} lang="ru" />
      <button type="button" className={"iconbtn" + (phonetic ? " on" : "")} style={{ alignSelf: "center" }}
              title={phonetic ? "Phonetic typing on (Ctrl+Shift+R)" : "Phonetic typing off (Ctrl+Shift+R)"}
              onClick={() => { setSettings({ phonetic: !phonetic }); setRaw(""); }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>{phonetic ? "ru" : "RU"}</span>
      </button>
    </div>
  );
}
