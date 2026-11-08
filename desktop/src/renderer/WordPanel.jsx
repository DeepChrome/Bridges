/* The dictionary entry in the inspector: the word, what it is, its meanings
 * with their examples, its tables, where the learner stands with it. The
 * same data the phone's entry reads (native/src/screens/Word.js), laid out
 * for a side panel. */

import React, { useMemo } from "react";
import { L, resolveWord, sensesOf, rankOf, heardIn } from "../../../native/src/data.js";
import { grammarLine, tableLabel } from "@core/forms";
import { familiarity, cardFor, skillScores } from "@core/scheduler";
import { wordFacts, isIrregular } from "@core/facts";
import { SKILLS } from "@core/skills";
import { useSession } from "./session.jsx";
import { Linked, useInspector } from "./words.jsx";
import { Speaker, Pill, Ring, IconButton, ICONS, Btn } from "./ui.jsx";
import { hasRealAudio } from "./audio.js";

function Senses({ senses, gloss, mark }) {
  if (senses && senses.length) {
    return (
      <ol className="senses">
        {senses.map((s, k) => (
          <li key={k}>
            {senses.length > 1 ? <span className="n">{k + 1}</span> : null}
            <div style={{ flex: 1 }}>
              <div className="g">{s.t && s.t.length ? <span className="t">{s.t.join(", ")} </span> : null}{s.g}</div>
              {(s.x || []).map((x, n) => (
                <div className="example" key={n}>
                  <div style={{ flex: 1 }}>
                    <Linked text={x.ru} mark={mark} />
                    <div className="en">{x.en}</div>
                  </div>
                  <Speaker text={x.ru} size={30} recordedOnly />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
    );
  }
  const groups = String(gloss || "").split(/\s*;\s*/).filter(Boolean);
  return (
    <ol className="senses">
      {groups.map((g, k) => <li key={k}>{groups.length > 1 ? <span className="n">{k + 1}</span> : null}<div className="g">{g}</div></li>)}
    </ol>
  );
}

/* A cell's forms; «стол|а́» draws the ending in the brand colour (rules.js Form). */
function Form({ f }) {
  const s = String(f || "");
  const bar = s.indexOf("|");
  if (bar < 0) return <span>{s}</span>;
  return <span>{s.slice(0, bar)}<span className="end">{s.slice(bar + 1)}</span></span>;
}

function FormsTable({ table, mark, speak }) {
  const [br, bc] = mark || [];
  return (
    <table className="forms">
      <thead>
        <tr>{table.columns.map((c, ci) => <th key={ci}>{ci === 0 ? "" : c}</th>)}</tr>
      </thead>
      <tbody>
        {table.rows.map((r, ri) => (
          <tr key={ri}>
            {r.map((cell, ci) => {
              const forms = (Array.isArray(cell) ? cell : [cell]).filter(Boolean);
              const asked = ri === br && (ci === bc || ci === 0);
              return (
                <td key={ci} className={asked ? "asked" : ""}>
                  {forms.map((f, fi) => (
                    <div key={fi} className="hrow" style={{ gap: 6 }}>
                      <Form f={f} />
                      {speak && ci > 0 && hasRealAudio(String(f).replace("|", "")) ? <Speaker text={String(f).replace("|", "")} size={26} recordedOnly /> : null}
                    </div>
                  ))}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function WordPanel({ word, pos, surface, onClose, onVideo }) {
  const { st, update } = useSession();
  const { open } = useInspector();
  const w = useMemo(() => resolveWord(word, pos), [word, pos]);
  if (!w) return <div className="entry"><div className="muted">“{word}” is not in the dictionary.</div></div>;
  const idx = L.indexOf(w);
  const senses = sensesOf(idx);
  const line = grammarLine(w, surface);
  const entry = (st.seen || {})[w.b] || null;
  const score = familiarity(cardFor(entry), rankOf(w.b));
  const skills = entry ? skillScores(entry, rankOf(w.b)) : {};
  const facts = wordFacts(w) || [];
  const heard = heardIn(w.b).slice(0, 4);
  const pinned = (st.pinned || []).includes(w.b);
  const tables = (w.t || []).filter((t) => t && t.rows && t.rows.length);
  return (
    <div className="entry">
      <div className="hrow">
        <div className="word" lang="ru">{w.w}</div>
        <div className="spacer" />
        <Speaker text={w.b} recordedOnly />
        {score !== null ? <Ring score={score} size={40} /> : null}
      </div>
      {line && line.surface ? (
        <div className="sub" style={{ marginTop: 4 }}>
          «{line.surface}» {line.flags && line.flags.length ? "— " + line.flags.join(", ") : ""}
        </div>
      ) : null}
      <div className="tags">
        {(line ? line.facts : []).map((f) => <Pill key={f}>{f}</Pill>)}
        {line && line.partner ? (
          <Pill>{line.partner.label} <button type="button" className="link" onClick={() => open(line.partner.word, "verb")}>{line.partner.word}</button></Pill>
        ) : null}
        {isIrregular(w) ? <Pill tone="irregular">irregular</Pill> : null}
      </div>
      <Senses senses={senses} gloss={w.e} mark={w} />
      {facts.length ? (
        <div className="tags" style={{ marginTop: 12 }}>
          {facts.map((f, k) => <Pill key={k} tone="brand" >{f.label || f.text || String(f)}</Pill>)}
        </div>
      ) : null}
      {entry ? (
        <div className="stack" style={{ marginTop: 14 }}>
          <div className="label" style={{ margin: 0 }}>Scores</div>
          <div className="hrow" style={{ gap: 16, flexWrap: "wrap" }}>
            {SKILLS.map((s) => (
              <div key={s.id} className="hrow" style={{ gap: 6 }} title={s.about}>
                <Ring score={skills[s.id] === undefined ? null : skills[s.id]} size={30} stroke={3} />
                <span className="muted">{s.short}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="hrow" style={{ marginTop: 14, gap: 8 }}>
        <Btn kind="ghost" label={pinned ? "In study" : "Add to study"} disabled={pinned}
             onClick={() => update((p) => ({ ...p, pinned: (p.pinned || []).concat(w.b) }))} />
      </div>
      {tables.length ? (
        <div style={{ marginTop: 10 }}>
          {tables.map((tb, k) => (
            <details key={k} className="fold" open={k === 0}>
              <summary>{tableLabel(tb.title, w.a)}</summary>
              <FormsTable table={tb} speak />
            </details>
          ))}
        </div>
      ) : null}
      {(w.x || []).length ? (
        <details className="fold" open>
          <summary>Examples</summary>
          <div className="stack">
            {(w.x || []).slice(0, 6).map((x, k) => (
              <div className="example" key={k}>
                <div style={{ flex: 1 }}>
                  <Linked text={x.ru} mark={w} />
                  <div className="en">{x.en}</div>
                </div>
                <Speaker text={x.ru} size={30} recordedOnly />
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {heard.length ? (
        <details className="fold">
          <summary>Heard in</summary>
          <div className="stack">
            {heard.map((h) => (
              <button key={h.id} type="button" className="heard" onClick={() => onVideo && onVideo(h, w.b)}
                      title={`Play it at ${Math.floor(h.t / 60000)}:${String(Math.floor(h.t / 1000) % 60).padStart(2, "0")}`}>
                <span className="sub">{h.title}</span> <span className="muted">· «{h.w}»{h.n > 1 ? ` · ${h.n}×` : ""}</span>
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
