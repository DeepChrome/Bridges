/* Read: paste any Russian — an article, subtitles, a message — and read it
 * with every word a link and the words not yet known marked. The share
 * reported is of *content* words (§30o: counting «и», «в», «не» would make
 * every text look part-known before a real word appeared); it advises and
 * never blocks. The unknown words can be added to study in one click, where
 * the phone's pinned list takes them. The text is kept on this computer
 * only (localStorage), never in the profile. */

import React, { useMemo, useState } from "react";
import { useSession } from "../session.jsx";
import { Btn, Muted, Pill } from "../ui.jsx";
import { splitTokens, entryOf } from "../words.jsx";
import { Linked } from "../words.jsx";
import { fold } from "@core/util";
import { familiarity, cardFor } from "@core/scheduler";
import { rankOf, KNOWN_AT } from "../../../../native/src/data.js";

/* The lemmas not counted: the hundred commonest («и», «в», «не», «я»), met
   from the first screen — core/speech.js's SPEECH_SKIP_TOP, the line below
   which a word is "not a word anyone is learning". Not the quiz's FREE_RANK
   (500): on a beginner's first article «читать» and «книга» are exactly the
   words to count. */
const READ_FREE = 100;

const KEY = "ya.read.text";
const load = () => { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } };
const keep = (s) => { try { localStorage.setItem(KEY, s); } catch (e) { /* a convenience, not state */ } };

/* The words of a text as lemmas, each once, with whether the learner holds it. */
export function readText(text, st) {
  const seen = new Map();
  let content = 0, known = 0;
  for (const p of splitTokens(text)) {
    if (p.i === undefined) continue;
    const e = entryOf(p.text);
    if (!e) continue;
    const key = e.key;
    const rank = rankOf(key);
    const free = !!rank && rank <= READ_FREE;
    const score = familiarity(cardFor((st.seen || {})[key]), rankOf(key));
    const held = score !== null && score >= KNOWN_AT;
    if (!seen.has(key)) {
      seen.set(key, { w: e.w, key, pos: e.pos, score, held, free, n: 0 });
      if (!free) { content++; if (held) known++; }
    }
    seen.get(key).n++;
  }
  return { words: [...seen.values()], content, known, share: content ? known / content : 1 };
}

export function Read() {
  const { st, update } = useSession();
  const [text, setText] = useState(load);
  const [reading, setReading] = useState(!!load());
  const r = useMemo(() => (reading ? readText(text, st) : null), [reading, text, st.seen]);
  const unknown = r ? r.words.filter((w) => !w.free && !w.held && !(st.pinned || []).includes(w.key)) : [];
  const hl = useMemo(() => new Set(unknown.map((w) => fold(w.key))), [unknown]);
  const pct = r ? Math.round(r.share * 100) : 0;
  return (
    <div className="pane-inner wide" style={{ maxWidth: 1080 }}>
      <div className="hrow">
        <h1 style={{ flex: 1 }}>Read</h1>
        {reading ? <Btn kind="ghost" label="Edit text" onClick={() => setReading(false)} /> : null}
      </div>
      {!reading ? (
        <>
          <textarea className="field" style={{ minHeight: 320, fontSize: 18, lineHeight: 1.5, resize: "vertical", userSelect: "text" }}
                    placeholder="Paste Russian here" value={text} onChange={(e) => setText(e.target.value)} lang="ru" spellCheck={false} />
          <div className="hrow" style={{ marginTop: 12, justifyContent: "flex-end" }}>
            <Btn kind="pri" label="Read" disabled={!/[а-яё]/i.test(text)} onClick={() => { keep(text); setReading(true); }} />
          </div>
        </>
      ) : (
        <div className="cols" style={{ gridTemplateColumns: "1fr 300px" }}>
          <div className="prose" style={{ fontSize: 20, lineHeight: 1.65, whiteSpace: "pre-wrap", userSelect: "text" }} lang="ru">
            {text.split(/\n/).map((line, k) => <p key={k} style={{ margin: "0 0 10px" }}><Linked text={line} hl={hl} /></p>)}
          </div>
          <div className="stack">
            <div className="list" style={{ padding: 16 }}>
              <div className="hero" style={{ fontSize: 32 }}>{pct}%</div>
              <Muted>of {r.content} content words known</Muted>
              <div className="bar" style={{ marginTop: 8 }}><div style={{ width: `${pct}%` }} /></div>
            </div>
            <div className="list" style={{ padding: 16 }}>
              <div className="hrow"><b>Not known yet</b><div className="spacer" /><Pill>{unknown.length}</Pill></div>
              <div className="stack" style={{ marginTop: 8, gap: 4, maxHeight: 400, overflow: "auto" }}>
                {unknown.slice(0, 80).map((w) => (
                  <div key={w.key} className="hrow" style={{ gap: 8 }}>
                    <span lang="ru"><Linked text={w.w.w} /></span>
                    <span className="muted" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(w.w.e || "").split(/[,;]/)[0]}</span>
                    {w.n > 1 ? <Muted>×{w.n}</Muted> : null}
                  </div>
                ))}
              </div>
              {unknown.length ? (
                <Btn kind="pri" block label={`Add ${Math.min(unknown.length, 30)} to study`} style={{ marginTop: 12 }}
                     onClick={() => update((p) => ({ ...p, pinned: (p.pinned || []).concat(unknown.slice(0, 30).map((w) => w.key).filter((k) => !(p.pinned || []).includes(k))) }))} />
              ) : <Muted style={{ marginTop: 8 }}>Every word here is yours.</Muted>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
