/* Stats: the figures off the cards and the review log, on a wide screen. */

import React, { useEffect, useState } from "react";
import { useSession } from "../session.jsx";
import { cardFor, kindOf, familiarity, dayOf, isDue } from "@core/scheduler";
import { rankOf, dueCount } from "../../../../native/src/data.js";
import { MASTERED_AT } from "@core/queue";
import { Muted } from "../ui.jsx";

const DAY = 86400000;

export function Stats() {
  const { st, account } = useSession();
  const [log, setLog] = useState([]);
  useEffect(() => { window.ya.store.log(account.id, {}).then(setLog); }, [account.id]);
  let words = 0, learning = 0, mastered = 0;
  const now = Date.now();
  const forecast = Array(7).fill(0);
  for (const w in st.seen || {}) {
    const c = cardFor(st.seen[w]);
    if (!c || kindOf(c) === "new") continue;
    words++;
    const f = familiarity(c, rankOf(w)) || 0;
    if (f >= MASTERED_AT) mastered++; else learning++;
    const d = Math.floor((c.dueAt - now) / DAY);
    if (d >= 0 && d < 7) forecast[d]++;
  }
  const today = dayOf(now);
  const weeks = 12;
  const days = new Map();
  for (const r of log) days.set(r.day, (days.get(r.day) || 0) + 1);
  const cells = [];
  for (let i = weeks * 7 - 1; i >= 0; i--) { const d = today - i; cells.push([d, days.get(d) || 0]); }
  const week = log.filter((r) => r.day > today - 7);
  const again = week.length ? Math.round((week.filter((r) => r.grade === 1).length / week.length) * 100) : 0;
  return (
    <div className="pane-inner">
      <h1>Stats</h1>
      <div className="cols" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        {[["Words learned", words], ["Mastered", mastered], ["Learning", learning], ["Due today", dueCount(st)]].map(([k, v]) => (
          <div key={k} className="list" style={{ padding: 16 }}><div className="hero" style={{ fontSize: 32 }}>{v}</div><Muted>{k}</Muted></div>
        ))}
      </div>
      <h2>Activity</h2>
      <div className="hrow" style={{ gap: 3, alignItems: "flex-start" }}>
        {Array.from({ length: weeks }, (_, wk) => (
          <div key={wk} className="stack" style={{ gap: 3 }}>
            {cells.slice(wk * 7, wk * 7 + 7).map(([d, n]) => (
              <div key={d} title={`${n} reviews`} style={{ width: 14, height: 14, borderRadius: 3,
                background: n === 0 ? "var(--surface3)" : n < 10 ? "var(--good-bg)" : n < 30 ? "var(--good-dim)" : "var(--good)" }} />
            ))}
          </div>
        ))}
      </div>
      <Muted style={{ marginTop: 8 }}>{week.length} reviews this week · {again}% again</Muted>
      <h2>Next seven days</h2>
      <div className="hrow" style={{ alignItems: "flex-end", gap: 8, height: 120 }}>
        {forecast.map((n, i) => {
          const max = Math.max(1, ...forecast);
          return (
            <div key={i} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ height: Math.round((n / max) * 90), background: "var(--brand)", borderRadius: 3, opacity: n ? 1 : .2 }} />
              <Muted>{i === 0 ? "today" : `+${i}`}</Muted>
              <Muted>{n}</Muted>
            </div>
          );
        })}
      </div>
    </div>
  );
}
