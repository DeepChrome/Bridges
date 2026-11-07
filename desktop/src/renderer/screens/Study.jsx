/* Study — the flashcards, with the keyboard.
 *
 * The session is the phone's (native/src/studycards.js sessionFor on
 * core/queue.js): what is due, the new words allowed, then the day's goal,
 * then on. Space turns the card, 1–4 grade it, Z undoes, S skips, L sets a
 * card aside as low priority. Grading is the phone's rule for rule
 * (screens/Study.js grade): the review row built from the card as it was,
 * FSRS through applyGrade, the day's counts and the goal, a run of Agains
 * resting the word. */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "../session.jsx";
import { useKeys } from "../keys.js";
import { Btn, Bar, Speaker, Ring, Pill, Muted, Kbd } from "../ui.jsx";
import { Linked, useInspector } from "../words.jsx";
import { say } from "../audio.js";
import { applyGrade, reviewRows, preview, schedulerOpts, cardFor, DEFAULT_FRONTS, familiarity } from "@core/scheduler";
import { requeue, dailyFor, rollGoal, spendGoal, noteAnswer, againGap, frontFor, REST_DAYS } from "@core/queue";
import { sessionFor, flagsFor, replacementFor, sittingTally } from "../../../../native/src/studycards.js";
import { L, exactIdx, sensesOf, goalNow, goalOpts, rankOf, dueCount } from "../../../../native/src/data.js";

const GRADES = [
  { g: 1, label: "Again", kind: "bad" }, { g: 2, label: "Hard", kind: "plain" },
  { g: 3, label: "Good", kind: "good" }, { g: 4, label: "Easy", kind: "pri" },
];

export function Study({ sub }) {
  const { st, update } = useSession();
  const { open } = useInspector();
  const [session, setSession] = useState(null);
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(false);
  const [last, setLast] = useState(null);
  const [marks, setMarks] = useState({});
  const [note, setNote] = useState(null);
  const [round, setRound] = useState(null);         // null | "trouble" | "known" | "beyond"
  const missed = useRef({});
  const sitting = useRef(new Set());
  const dealt = useRef(0);

  const deal = (opts = {}) => {
    const s = sessionFor(st, opts);
    dealt.current++;
    setSession(s); setAt(0); setShown(false); setLast(null);
    for (const it of s.items) sitting.current.add(it.word);
    return s;
  };
  useEffect(() => { if (!session) deal(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const items = session ? session.items : [];
  const item = items[at] || null;
  const face = item ? ((session.faces || {})[item.word] || { w: item.word, b: item.word, e: "", sentence: /\s/.test(item.word) }) : null;
  const current = item ? cardFor(st.seen[item.word]) : null;
  const iv = item ? preview(current, Date.now(), schedulerOpts(st)) : null;
  const own = face && !face.sentence ? exactIdx(face.b) : -1;
  const senses = own >= 0 ? sensesOf(own) : null;
  const lemma = own >= 0 ? L[own] : null;
  const flags = flagsFor(st, item);
  const front = item ? item.direction : "recognise";
  const russianUp = front === "produce" ? shown : true;

  // The Russian side reads itself once per card.
  const heard = useRef(new Set());
  useEffect(() => {
    if (!item) return;
    const key = `${dealt.current}:${at}:${item.word}`;
    if (russianUp && !heard.current.has(key)) { heard.current.add(key); say(face.b); }
  }, [at, shown, item && item.word]);   // eslint-disable-line react-hooks/exhaustive-deps

  const grade = (g) => {
    if (!item || !shown) return;
    const now = Date.now();
    const word = item.word, direction = item.direction;
    const rows = reviewRows(st.seen, [{ word, direction, grade: g }], now, "study", schedulerOpts(st));
    const stuck = noteAnswer(st.rest, word, g, now);
    const before = { items, at, entry: st.seen[word], trouble: st.trouble, daily: st.daily, goal: st.goal, row: rows[0], marks, rest: st.rest };
    if (stuck.rested) { const { [word]: _g, ...rest } = marks; setMarks(rest); }
    else setMarks({ ...marks, [word]: g === 1 ? "again" : "done" });
    update((prev) => {
      const r = applyGrade(prev.seen, prev.trouble, word, direction, g, now, schedulerOpts(prev));
      const daily = dailyFor(prev.daily, now);
      return {
        ...prev, seen: r.seen, trouble: r.trouble, rest: noteAnswer(prev.rest, word, g, now).rest,
        daily: { ...daily, reviews: daily.reviews + (item.again || item.kind === "new" ? 0 : 1),
                 new: daily.new + (item.kind === "new" && !item.again ? 1 : 0) },
        goal: item.again ? rollGoal(prev.goal, now, goalOpts(prev)) : spendGoal(rollGoal(prev.goal, now, goalOpts(prev)), 1),
      };
    }, rows);
    setLast(before);
    if (stuck.rested) {
      let next = items.filter((it, k) => k <= at || it.word !== word);
      let faces = session.faces;
      sitting.current.delete(word);
      const rep = replacementFor(st, new Set(next.map((x) => x.word)));
      if (rep) {
        const fronts = st.flash && st.flash.length ? st.flash : DEFAULT_FRONTS;
        next = next.slice(0, at + 1).concat([{ word: rep.word, direction: frontFor(null, fronts, null), card: null, kind: "new", extra: true }], next.slice(at + 1));
        faces = { ...(faces || {}), [rep.word]: rep.face };
      }
      setSession({ ...session, items: next, faces });
      setNote(`Resting «${face.w}» · back in ${REST_DAYS} days`);
      setTimeout(() => setNote(null), 5000);
    } else if (g === 1) {
      const n = (missed.current[word] || 0) + 1;
      missed.current[word] = n;
      setSession({ ...session, items: requeue(items, at, item, againGap(n)) });
    }
    setAt(at + 1); setShown(false);
  };

  const undo = () => {
    if (!last) return;
    update((prev) => ({ ...prev, seen: { ...prev.seen, [last.items[last.at].word]: last.entry }, trouble: last.trouble,
                        daily: last.daily, goal: last.goal, rest: last.rest }),
           [], [{ word: last.row.word, direction: last.row.direction, at: last.row.at }]);
    setSession({ ...session, items: last.items }); setAt(last.at); setShown(true); setMarks(last.marks); setLast(null);
  };
  const skip = () => { if (item) { setAt(at + 1); setShown(false); } };
  const aside = () => {
    if (!item) return;
    update((p) => ({ ...p, lowPriority: { ...(p.lowPriority || {}), [item.word]: Date.now() } }));
    setSession({ ...session, items: items.filter((it, k) => k <= at || it.word !== item.word) });
    setAt(at + 1); setShown(false);
  };

  useKeys({
    " ": () => { if (item && !shown) setShown(true); else if (item) say(face.b); },
    "Enter": () => { if (item && !shown) setShown(true); },
    "1": () => grade(1), "2": () => grade(2), "3": () => grade(3), "4": () => grade(4),
    "z": undo, "ctrl+z": undo, "s": skip, "l": aside, "r": () => { if (item) say(face.b); },
  }, [item, shown, last, session, at, st]);

  // Past the dealt items: deal more, or the end of the day.
  useEffect(() => {
    if (!session || at < items.length) return;
    if (round) { setRound(null); deal(); return; }
    const more = sessionFor(st, {});
    if (more.items.length) { deal(); return; }
    // nothing: the end screen renders below
  }, [at]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!session) return <div className="empty">…</div>;
  const tally = sittingTally(sitting.current, marks, Math.max(0, items.length - at));
  const owed = goalNow(st).owed;

  if (!item) {
    const beyond = sessionFor(st, { beyond: true }).items.length > 0;
    return (
      <div className="pane-inner">
        <h1>Study</h1>
        <div className="card center" style={{ justifyContent: "center" }}>
          <div className="face">
            <div className="hero">{owed ? "Nothing more to deal" : "Daily goal met"}</div>
            <Muted>{tally.done} cards today</Muted>
            <div className="hrow" style={{ marginTop: 20, flexWrap: "wrap", justifyContent: "center" }}>
              {beyond ? <Btn kind="pri" label="Keep going" onClick={() => { setRound("beyond"); deal({ beyond: true }); }} /> : null}
              <Btn label="Trouble words" onClick={() => { setRound("trouble"); deal({ round: "trouble" }); }} />
              <Btn label="Known words" onClick={() => { setRound("known"); deal({ round: "known" }); }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const label = front === "produce" ? "Meaning" : front === "listen" ? "Listen" : "Russian";
  const score = flags.score;
  return (
    <div className="pane-inner">
      <div className="study">
        <div className="top">
          <h1 style={{ margin: 0 }}>Study</h1>
          <div className="spacer" />
          <div className="tally"><b>{tally.done}</b><i>{tally.again}</i><span>{tally.left} left</span></div>
          <div style={{ width: 240 }}><Bar value={items.length ? at / items.length : 0} /></div>
        </div>
        {note ? <div className="notice" style={{ marginTop: 12 }}>{note}</div> : null}
        <div className="card">
          <div className="actions">
            <Pill>{label}</Pill>
            {flags.isNew ? <Pill tone="brand">New</Pill> : null}
            {flags.irregular ? <Pill tone="irregular">irregular</Pill> : null}
            <div className="spacer" />
            {score !== null && score !== undefined ? <Ring score={score} size={34} stroke={3} /> : null}
          </div>
          <div className="face">
            {front === "listen" && !shown ? (
              <Speaker text={face.b} size={64} />
            ) : russianUp ? (
              <>
                <div className="hero" lang="ru">{face.sentence ? <Linked text={face.w} /> : face.w}</div>
                <div className="hrow"><Speaker text={face.b} size={34} />{lemma ? <Muted>{lemma.p !== "other" ? lemma.p : ""}</Muted> : null}</div>
              </>
            ) : (
              <div className="hero" style={{ fontSize: 30 }}>{senses && senses.length ? senses[0].g : (face.e || "").split(/;/)[0]}</div>
            )}
            {!shown ? <Btn kind="pri" label="Show" kbd="Space" onClick={() => setShown(true)} style={{ marginTop: 24 }} /> : null}
          </div>
          {shown ? (
            <div className="back">
              {front !== "produce" ? <div className="meaning">{(face.e || "").split(/;/).slice(0, 2).join("; ")}</div>
                : <div className="hero" lang="ru" style={{ fontSize: 30 }}>{face.w} <Speaker text={face.b} size={30} /></div>}
              {senses && senses.length > 1 ? (
                <ol className="senses" style={{ marginTop: 10 }}>
                  {senses.slice(0, 4).map((s, k) => <li key={k}><span className="n">{k + 1}</span><div className="g">{s.g}</div></li>)}
                </ol>
              ) : null}
              {lemma && (lemma.x || []).length ? (
                <div className="stack" style={{ marginTop: 12 }}>
                  {(lemma.x || []).slice(0, 2).map((x, k) => (
                    <div className="example" key={k}>
                      <div style={{ flex: 1 }}><Linked text={x.ru} mark={lemma} /><div className="en">{x.en}</div></div>
                      <Speaker text={x.ru} size={28} recordedOnly />
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="hrow" style={{ marginTop: 12, gap: 8 }}>
                {lemma ? <Btn kind="ghost" label="More" onClick={() => open(lemma.b, lemma.p)} /> : null}
                <Btn kind="ghost" label="Low priority" kbd="L" onClick={aside} />
                <div className="spacer" />
                {last ? <Btn kind="ghost" label="Undo" kbd="Z" onClick={undo} /> : null}
                <Btn kind="ghost" label="Skip" kbd="S" onClick={skip} />
              </div>
            </div>
          ) : null}
        </div>
        {shown ? (
          <div className="grades">
            {GRADES.map((x) => (
              <Btn key={x.g} kind={x.kind} onClick={() => grade(x.g)}>
                <span>{x.label} <Kbd>{x.g}</Kbd></span>
                <small>{iv && iv[x.g - 1] ? iv[x.g - 1].label : ""}</small>
              </Btn>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
