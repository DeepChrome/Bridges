/* Cards: every card the scheduler holds, as a table — the browser Anki
 * users reach for and the phone has no room for. Search, sort by any
 * column, click a row for the entry, tick rows to set them aside or bring
 * them back. Nothing here changes a schedule: low priority takes a card out
 * of the rotation and Restore puts it back where it was (§30co). */

import React, { useMemo, useState } from "react";
import { useSession } from "../session.jsx";
import { useInspector } from "../words.jsx";
import { Btn, Muted, Ring, Pill } from "../ui.jsx";
import { fold, firstSense } from "@core/util";
import { familiarity, cardFor, kindOf, skillScores } from "@core/scheduler";
import { cardKind } from "@core/queue";
import { L, exactIdx, rankOf, isLowPriority } from "../../../../native/src/data.js";
import { SKILLS } from "@core/skills";

const DAY = 86400000;
const when = (ms, now) => {
  if (!ms) return "";
  const d = Math.round((ms - now) / DAY);
  return d < -1 ? `${-d} days ago` : d === -1 ? "yesterday" : d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;
};
const COLS = [["word", "Word"], ["meaning", "Meaning"], ["state", "State"], ["score", "Score"], ["due", "Due"], ["reps", "Reviews"], ["lapses", "Lapses"]];
const PAGE = 300;

export function Cards() {
  const { st, update } = useSession();
  const { open } = useInspector();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ by: "due", dir: 1 });
  const [picked, setPicked] = useState(() => new Set());
  const [onlyAside, setOnlyAside] = useState(false);
  const now = Date.now();

  const rows = useMemo(() => {
    const out = [];
    for (const w in st.seen || {}) {
      const c = cardFor(st.seen[w]);
      if (!c) continue;
      const i = exactIdx(w);
      const lemma = i >= 0 ? L[i] : null;
      const kind = kindOf(c);
      out.push({
        key: w, word: lemma ? lemma.w : w, bare: w, pos: lemma ? lemma.p : null, sentence: cardKind(w) === "sentences",
        meaning: lemma ? firstSense(lemma) : "", state: kind, score: kind === "new" ? null : familiarity(c, rankOf(w)),
        due: c.dueAt || 0, reps: c.reps || 0, lapses: c.lapses || 0, aside: isLowPriority(st, w),
        skills: skillScores(st.seen[w], rankOf(w)),
      });
    }
    return out;
  }, [st.seen, st.lowPriority]);

  const shown = useMemo(() => {
    const needle = fold(q);
    let list = rows.filter((r) => (!onlyAside || r.aside) && (!needle || fold(r.bare).includes(needle) || r.meaning.toLowerCase().includes(q.toLowerCase())));
    const by = sort.by, dir = sort.dir;
    list.sort((a, b) => {
      const x = a[by], y = b[by];
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (typeof x === "string" ? x.localeCompare(y, "ru") : x - y) * dir;
    });
    return list;
  }, [rows, q, sort, onlyAside]);

  const toggle = (key) => setPicked((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const setAside = (on) => {
    const keys = [...picked];
    update((p) => {
      const low = { ...(p.lowPriority || {}) };
      for (const k of keys) { if (on) low[k] = Date.now(); else delete low[k]; }
      return { ...p, lowPriority: low };
    });
    setPicked(new Set());
  };
  const head = (id, name) => (
    <th key={id} style={{ cursor: "pointer", userSelect: "none" }} onClick={() => setSort((s) => ({ by: id, dir: s.by === id ? -s.dir : 1 }))}>
      {name}{sort.by === id ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
    </th>
  );
  return (
    <div className="pane-inner wide" style={{ maxWidth: 1100 }}>
      <div className="hrow">
        <h1 style={{ flex: 1 }}>Cards</h1>
        <Muted>{shown.length} of {rows.length}</Muted>
      </div>
      <div className="hrow" style={{ marginBottom: 12 }}>
        <input className="field sm" style={{ maxWidth: 320 }} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} spellCheck={false} />
        <button type="button" className={"pill" + (onlyAside ? " brand" : "")} style={{ cursor: "pointer" }} onClick={() => setOnlyAside(!onlyAside)}>Low priority only</button>
        <div className="spacer" />
        {picked.size ? (
          <>
            <Muted>{picked.size} selected</Muted>
            <Btn kind="ghost" label="Low priority" onClick={() => setAside(true)} />
            <Btn kind="ghost" label="Restore" onClick={() => setAside(false)} />
          </>
        ) : null}
      </div>
      <table className="forms" style={{ fontSize: "var(--t-body)" }}>
        <thead>
          <tr>
            <th style={{ width: 28 }} />
            {COLS.map(([id, name]) => head(id, name))}
            {SKILLS.map((s) => <th key={s.id} title={s.about}>{s.short}</th>)}
          </tr>
        </thead>
        <tbody>
          {shown.slice(0, PAGE).map((r) => (
            <tr key={r.key} style={{ opacity: r.aside ? .55 : 1, cursor: "pointer" }} onClick={() => { if (!r.sentence) open(r.bare, r.pos); }}>
              <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={picked.has(r.key)} onChange={() => toggle(r.key)} /></td>
              <td lang="ru" style={{ color: "var(--ink)", fontSize: "var(--t-body)" }}>{r.word}{r.aside ? <Pill> aside</Pill> : null}</td>
              <td style={{ color: "var(--ink2)" }}>{r.meaning}</td>
              <td>{r.state}</td>
              <td>{r.score === null ? "" : <Ring score={r.score} size={28} stroke={3} />}</td>
              <td>{r.state === "new" ? "" : when(r.due, now)}</td>
              <td>{r.reps}</td>
              <td>{r.lapses}</td>
              {SKILLS.map((s) => <td key={s.id}>{r.skills && r.skills[s.id] !== undefined && r.skills[s.id] !== null ? r.skills[s.id] : ""}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {shown.length > PAGE ? <Muted style={{ marginTop: 8 }}>Showing the first {PAGE}; search to narrow.</Muted> : null}
      {!rows.length ? <div className="empty">No cards yet</div> : null}
    </div>
  );
}
