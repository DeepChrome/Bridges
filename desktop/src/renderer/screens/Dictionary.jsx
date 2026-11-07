/* The dictionary: a search box with the keyboard in it, results as rows, the
   entry in the inspector. Ctrl+K from anywhere. */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { searchWordsScored, L } from "../../../../native/src/data.js";
import { MATCH } from "@core/search";
import { firstSense } from "@core/util";
import { useSession } from "../session.jsx";
import { useInspector } from "../words.jsx";
import { Ring, Speaker } from "../ui.jsx";
import { familiarity, cardFor } from "@core/scheduler";
import { rankOf } from "../../../../native/src/data.js";

export function Dictionary({ sub }) {
  const { st, update } = useSession();
  const { open } = useInspector();
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.focus(); }, [sub && sub.focus]);
  const hits = useMemo(() => (q.trim().length ? searchWordsScored(q.trim(), 40) : []), [q]);
  const exact = hits.filter((h) => h.score >= MATCH), also = hits.filter((h) => h.score < MATCH);
  const recents = (st.recent || []).slice(0, 12);

  const pick = (w) => {
    open(w.b, w.p);
    update((p) => ({ ...p, recent: [w.b].concat((p.recent || []).filter((x) => x !== w.b)).slice(0, 30) }));
  };
  const key = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(hits.length - 1, c + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    if (e.key === "Enter" && hits[cursor]) pick(hits[cursor].entry);
  };
  const Result = ({ h, k }) => {
    const w = h.entry;
    const score = familiarity(cardFor((st.seen || {})[w.b]), rankOf(w.b));
    return (
      <div className={"row press"} style={k === cursor ? { background: "var(--surface2)" } : undefined} onClick={() => pick(w)}>
        <span className="w" lang="ru">{w.w}</span>
        <span className="e">{w.e}</span>
        <span className="muted">{w.p !== "other" ? w.p : ""}</span>
        {score !== null ? <Ring score={score} size={28} stroke={3} /> : null}
        <Speaker text={w.b} size={30} recordedOnly />
      </div>
    );
  };
  let n = -1;
  return (
    <div className="pane-inner">
      <h1>Dictionary</h1>
      <input ref={ref} className="field" placeholder="Russian or English  (Ctrl+K)" value={q}
             onChange={(e) => { setQ(e.target.value); setCursor(0); }} onKeyDown={key} autoFocus spellCheck={false} />
      {q.trim() ? (
        <div className="results" style={{ marginTop: 16 }}>
          {!hits.length ? <div className="empty">Nothing found</div> : null}
          {exact.length ? <div className="list">{exact.map((h) => { n++; return <Result key={h.entry.b + n} h={h} k={n} />; })}</div> : null}
          {also.length ? (<>
            <div className="label">Also</div>
            <div className="list">{also.map((h) => { n++; return <Result key={h.entry.b + n} h={h} k={n} />; })}</div>
          </>) : null}
        </div>
      ) : recents.length ? (
        <>
          <div className="label">Recent</div>
          <div className="hrow" style={{ flexWrap: "wrap", gap: 8 }}>
            {recents.map((b) => <button key={b} type="button" className="pill" style={{ cursor: "pointer" }} onClick={() => open(b)}>{b}</button>)}
          </div>
        </>
      ) : <div className="empty">Type a word</div>}
    </div>
  );
}
