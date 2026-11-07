/* Russian text whose recognised words open in the inspector — the desktop's
 * `Linked` (native/src/words.js). One click, not two: on a wide screen the
 * entry opens beside the work rather than over it, so there is no glance to
 * put between the word and its entry. `lookup`, `entryOf` and `formsOf` are
 * the phone's own rules, so the same forms are links on both. */

import React, { createContext, useContext, useMemo, useState } from "react";
import { fold, TOKEN } from "@core/util";
import { L, IX, resolveWord, deepFormOf } from "../../../native/src/data.js";

export function lookup(surface) {
  const hit = IX[fold(surface || "")];
  return hit && hit.length ? hit[0] : null;
}

export function entryOf(surface) {
  const deep = deepFormOf(surface);
  const i = lookup(surface);
  if (i !== null && !(deep && fold(deep.word) === fold(surface))) return { w: L[i], key: L[i].b };
  if (!deep) return null;
  const w = resolveWord(deep.word, deep.pos);
  return w ? { w, key: w.b, pos: deep.pos } : null;
}
export const linkable = (surface) => lookup(surface) !== null || deepFormOf(surface) !== null;

export function splitTokens(text) {
  const re = new RegExp(TOKEN.source, "g");
  const out = [];
  let last = 0, m;
  while ((m = re.exec(text || "")) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    const i = lookup(m[0]);
    out.push(i !== null ? { text: m[0], i } : linkable(m[0]) ? { text: m[0], i: -1 } : { text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < (text || "").length) out.push({ text: text.slice(last) });
  return out;
}

const formSets = new WeakMap();
export function formsOf(lemma) {
  if (!lemma) return null;
  if (formSets.has(lemma)) return formSets.get(lemma);
  const out = new Set([fold(lemma.b || ""), fold(lemma.w || "")]);
  for (const tb of lemma.t || []) {
    for (const r of tb.rows || []) {
      for (let c = 1; c < r.length; c++) {
        for (const f of (Array.isArray(r[c]) ? r[c] : [r[c]])) if (f) out.add(fold(f));
      }
    }
  }
  out.delete("");
  formSets.set(lemma, out);
  return out;
}

/* The inspector: which entry is open, and the screens' one way to open one. */
const Ctx = createContext({ open: () => {}, close: () => {}, current: null });
export const useInspector = () => useContext(Ctx);

export function InspectorProvider({ children }) {
  const [current, setCurrent] = useState(null);     // { word, pos, surface } | null
  const value = useMemo(() => ({
    current,
    open: (word, pos, surface) => setCurrent({ word, pos, surface, at: Date.now() }),
    close: () => setCurrent(null),
  }), [current]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function Linked({ text, className = "", mark, hl, style, size }) {
  const { open } = useInspector();
  const own = mark ? formsOf(mark) : null;
  const parts = splitTokens(text || "");
  return (
    <span className={`prose ${className}`} style={{ ...(size ? { fontSize: size } : {}), ...style }} lang="ru">
      {parts.map((p, k) => {
        if (p.i === undefined) return <span key={k}>{p.text}</span>;
        const entry = entryOf(p.text);
        const isMark = (own && own.has(fold(p.text))) || (hl && hl.has(fold(p.text)));
        return (
          <span key={k} className={"lk" + (isMark ? " mark" : "")} role="link" tabIndex={0}
                onClick={(e) => { e.stopPropagation(); if (entry) open(entry.key, entry.pos, p.text); }}
                onKeyDown={(e) => { if (e.key === "Enter" && entry) open(entry.key, entry.pos, p.text); }}>
            {p.text}
          </span>
        );
      })}
    </span>
  );
}
