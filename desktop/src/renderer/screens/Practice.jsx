/* Practice: the grammar drills and a lesson's quiz, through one runner with
 * the keyboard — 1–4 choose, Enter checks and continues, Space replays,
 * H shows the hint, Esc leaves. The questions are core/questions.js's, the
 * same the phone asks (native/src/questions.js binds them to the data); a
 * typed answer is judged by the phone's rule (screens/Run.js Typed: folded,
 * any accepted alternative, one letter off on a long word is half credit),
 * and graded the phone's way (applyGrade by the kind's direction and skill;
 * a form drill moves the forms score alone — §30by).
 *
 * What the desktop does not run yet: the spoken steps — say it aloud, the
 * pronunciation pairs, shadowing, word building — and the listening scene,
 * which need the microphone and the scenario tracks. They are left out of a
 * quiz here (UNSUPPORTED) and the phone still asks them. */

import React, { useEffect, useRef, useState } from "react";
import { useSession } from "../session.jsx";
import { useKeys } from "../keys.js";
import { Btn, Bar, Speaker, Pill, Muted, Kbd, List, Row } from "../ui.jsx";
import { Linked } from "../words.jsx";
import { RuInput } from "../RuInput.jsx";
import { say, cue } from "../audio.js";
import { Q, DRILL_TYPES, DRILL_N } from "../../../../native/src/questions.js";
import { L, unitById, lessonWords, drillPool, knownPool, markComponent, reviewWords, lowPriorityIdx }
  from "../../../../native/src/data.js";
import { applyGrade, reviewRows, schedulerOpts, directionOfKind, gradesCard, gradeSkill, gradeFor } from "@core/scheduler";
import { SKILL_OF_KIND } from "@core/skills";
import { fold, firstSense } from "@core/util";
import { charDistance, compare } from "@core/compare";
import { hintSteps, hintMask } from "@core/hint";
import { touchStreak } from "@core/defaults";

const UNSUPPORTED = new Set(["say", "pair-hear", "pair-say", "shadow", "buildup", "scene", "video"]);
const supported = (qs) => (qs || []).filter((q) => !UNSUPPORTED.has(q.kind));

/* The verdict on a typed answer, as the phone gives it. */
function judgeTyped(q, text) {
  const typed = fold(text);
  if (!typed) return null;
  const want = fold(q.target || q.answer || "");
  if (typed === want) return { right: true, credit: 1 };
  if ((q.alts || []).map(fold).includes(typed)) return { right: true, credit: 1, as: text.trim() };
  if (charDistance(typed, want) === 1 && want.length >= 4) return { right: false, credit: 0.5, note: "One letter off" };
  return { right: false, credit: 0 };
}

function Match({ q, onDone }) {
  const [left] = useState(() => q.pairs.slice().sort(() => Math.random() - 0.5));
  const [right] = useState(() => q.pairs.slice().sort(() => Math.random() - 0.5));
  const [picked, setPicked] = useState(null);
  const [cleared, setCleared] = useState([]);
  const [wrong, setWrong] = useState(null);
  const missed = useRef(0);
  const tap = (side, item) => {
    if (cleared.includes(item.i)) return;
    if (!picked) { setPicked({ side, item }); return; }
    if (picked.side === side) { setPicked({ side, item }); return; }
    if (picked.item.i === item.i) {
      const next = cleared.concat(item.i);
      setCleared(next); setPicked(null);
      if (next.length === q.pairs.length) {
        const credit = Math.max(0, 1 - missed.current / q.pairs.length);
        onDone({ right: missed.current === 0, credit, note: missed.current ? `${missed.current} ${missed.current === 1 ? "miss" : "misses"}` : null });
      }
    } else { missed.current += 1; setWrong(item.i); setTimeout(() => setWrong(null), 400); setPicked(null); }
  };
  const cell = (side, item, label) => {
    const done = cleared.includes(item.i), sel = picked && picked.side === side && picked.item.i === item.i, bad = wrong === item.i;
    return (
      <Btn key={side + item.i} kind={done ? "good" : bad ? "bad" : "plain"} disabled={done} onClick={() => tap(side, item)}
           style={{ justifyContent: "flex-start", minHeight: 50, outline: sel ? "2px solid var(--info)" : "none" }}>
        <span lang={side === "ru" ? "ru" : "en"}>{label}</span>
      </Btn>
    );
  };
  return (
    <div className="cols" style={{ marginTop: 10 }}>
      <div className="stack">{left.map((p) => cell("ru", p, p.ru))}</div>
      <div className="stack">{right.map((p) => cell("en", p, p.en))}</div>
    </div>
  );
}

export function Runner({ questions: given, title, onDone, source = "drill" }) {
  const { st, update } = useSession();
  const [questions] = useState(() => supported(given));
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState(null);
  const [typed, setTyped] = useState("");
  const [verdict, setVerdict] = useState(null);     // { right, credit, note, said }
  const [hint, setHint] = useState(0);
  const tally = useRef({ credit: 0, total: 0, right: 0 });
  const q = questions[at] || null;
  const isTyped = !!(q && (q.typed || q.kind === "type" || q.kind === "hear"));
  const isMatch = !!(q && q.kind === "match");
  const autoplay = q ? (q.autoplay || (q.kind === "listen" ? L[q.i] && L[q.i].b : null) || q.say || null) : null;

  useEffect(() => {
    setPicked(null); setTyped(""); setVerdict(null); setHint(0);
    if (!q) { onDone(tally.current); return; }
    if (autoplay) say(autoplay);
  }, [at]);   // eslint-disable-line react-hooks/exhaustive-deps

  const settle = (v) => {
    if (!q || verdict) return;
    const helped = hint > 0;
    setVerdict(v);
    cue(v.right ? "right" : "wrong");
    tally.current.total += 1;
    tally.current.credit += v.credit;
    if (v.right) tally.current.right += 1;
    // The word asked, graded as the phone grades it; a hint makes a right answer Hard.
    const word = q.i !== undefined && q.i !== null && L[q.i] ? L[q.i].b : null;
    if (word && q.kind !== "hear") {
      const now = Date.now();
      const g = gradeFor(v.right, helped);
      const skill = SKILL_OF_KIND[q.kind];
      if (gradesCard(q.kind)) {
        const direction = directionOfKind(q.kind);
        const rows = reviewRows(st.seen, [{ word, direction, grade: g }], now, q.kind, schedulerOpts(st));
        update((prev) => {
          const r = applyGrade(prev.seen, prev.trouble, word, direction, g, now, schedulerOpts(prev), skill);
          return { ...prev, seen: r.seen, trouble: r.trouble };
        }, rows);
      } else if (skill) {
        update((prev) => ({ ...prev, seen: gradeSkill(prev.seen, word, skill, g, now, schedulerOpts(prev)) }));
      }
    }
    const answer = q.target || q.answer;
    if (answer && q.kind !== "hear" && /[а-яё]/i.test(answer)) say(answer);
  };
  const choose = (k) => {
    if (verdict || !q || !q.options || !q.options[k]) return;
    setPicked(k);
    settle({ right: !!q.options[k].right, credit: q.options[k].right ? 1 : 0 });
  };
  const check = () => {
    if (!q || verdict) return;
    if (q.kind === "hear") {
      const r = compare(typed, q.target);
      const right = r.wer === 0;
      settle({ right, credit: right ? 1 : Math.max(0, 1 - r.wer), said: typed });
      return;
    }
    const v = judgeTyped(q, typed);
    if (v) settle({ ...v, said: typed });
  };
  const next = () => { if (at + 1 >= questions.length) onDone(tally.current); else setAt(at + 1); };

  useKeys({
    "1": () => choose(0), "2": () => choose(1), "3": () => choose(2), "4": () => choose(3),
    "Enter": { fn: () => { if (verdict) next(); else if (isTyped) check(); }, always: true },
    " ": () => { if (autoplay) say(autoplay); },
    "h": () => { if (!verdict) setHint((h) => h + 1); },
    "Escape": () => onDone(tally.current, true),
  }, [q, verdict, typed, hint, at]);

  if (!q) return <div className="empty">Nothing to ask here</div>;
  const answerText = q.target || q.answer || "";
  const steps = answerText && isTyped ? hintSteps(answerText) : [];
  const shownHint = hint && steps.length ? hintMask(answerText, steps[Math.min(hint, steps.length) - 1]) : null;
  const prompt = q.prompt || "";
  const right = verdict && verdict.right;
  return (
    <div className="study">
      <div className="top">
        <h1 style={{ margin: 0 }}>{title}</h1>
        <div className="spacer" />
        <Muted>{at + 1} of {questions.length}</Muted>
        <div style={{ width: 240 }}><Bar value={at / questions.length} /></div>
        <Btn kind="ghost" label="Leave" kbd="Esc" onClick={() => onDone(tally.current, true)} />
      </div>
      <div className="card">
        <div className="actions">
          <Pill>{q.ask || q.kind}</Pill>
          {q.sub ? <Muted>{q.sub}</Muted> : null}
          <div className="spacer" />
          {autoplay ? <Speaker text={autoplay} /> : null}
        </div>
        <div className="face" style={{ justifyContent: "flex-start", paddingTop: 16, flex: "0 0 auto" }}>
          {prompt ? (
            <div className="hero" style={{ fontSize: q.cyr ? (prompt.length > 30 ? 26 : 36) : 26 }} lang={q.cyr ? "ru" : "en"}>
              {q.cyr ? <Linked text={prompt} /> : prompt}
            </div>
          ) : null}
          {q.kind === "hear" && (hint || verdict) ? <Muted>{q.hint}</Muted> : null}
          {shownHint && q.kind !== "hear" ? <div className="ru" style={{ letterSpacing: 3, fontSize: 24 }} lang="ru">{shownHint}</div> : null}
        </div>
        {isMatch ? <Match q={q} onDone={(v) => settle(v)} /> : null}
        {isTyped ? (
          <div style={{ marginTop: 8 }}>
            <RuInput value={typed} onChange={setTyped} onSubmit={() => (verdict ? next() : check())} autoFocus disabled={!!verdict} />
          </div>
        ) : null}
        {!isTyped && !isMatch && q.options ? (
          <div className="cols" style={{ marginTop: 8 }}>
            {q.options.map((o, k) => {
              const kind = verdict ? (o.right ? "good" : picked === k ? "bad" : "plain") : "plain";
              return (
                <Btn key={k} kind={kind} onClick={() => choose(k)} style={{ justifyContent: "flex-start", minHeight: 54 }}>
                  <Kbd>{k + 1}</Kbd><span style={{ marginLeft: 10, fontSize: o.cyr ? 20 : 16 }} lang={o.cyr ? "ru" : "en"}>{o.label}</span>
                </Btn>
              );
            })}
          </div>
        ) : null}
        <div className="hrow" style={{ marginTop: 16 }}>
          {!verdict && (isTyped || q.kind === "hear") ? <Btn kind="ghost" label="Hint" kbd="H" onClick={() => setHint((h) => h + 1)} /> : null}
          <div className="spacer" />
          {verdict ? (
            <>
              <div className={"notice " + (right ? "good" : "bad")} style={{ flex: 1 }}>
                {right ? (verdict.as ? <>Right — also <b lang="ru">{answerText}</b></> : "Right")
                  : <>{verdict.note ? verdict.note + " · " : ""}<b lang="ru">{answerText}</b>{q.reveal && q.reveal !== answerText ? <span className="muted"> · {q.reveal}</span> : null}</>}
              </div>
              <Btn kind="pri" label="Continue" kbd="Enter" onClick={next} />
            </>
          ) : isTyped ? <Btn kind="pri" label="Check" kbd="Enter" disabled={!fold(typed)} onClick={check} /> : null}
        </div>
      </div>
    </div>
  );
}

function Done({ score, title, onBack, onAgain }) {
  const pct = score.total ? Math.round((score.credit / score.total) * 100) : 0;
  return (
    <div className="card center" style={{ justifyContent: "center" }}>
      <div className="face">
        <Muted>{title}</Muted>
        <div className="hero">{pct}%</div>
        <Muted>{score.right} of {score.total} right</Muted>
        <div className="hrow" style={{ marginTop: 20 }}>
          <Btn kind="pri" label="Again" onClick={onAgain} />
          <Btn label="Back" onClick={onBack} />
        </div>
      </div>
    </div>
  );
}

/* A lesson: its words as cards to read, then its quiz. The quiz passed marks
   the lesson as the phone marks it (markComponent, PASS_MARK in core/state.js). */
function Lesson({ unit, index, onBack }) {
  const { st, update } = useSession();
  const u = unitById(unit);
  const words = lessonWords(u, index).map((i) => L[i]);
  const [stage, setStage] = useState("words");
  const [qs, setQs] = useState(null);
  const [score, setScore] = useState(null);
  const startQuiz = () => {
    setQs(Q.quizSteps(u, index, reviewWords(st), st.seen, undefined, lowPriorityIdx(st)));
    setStage("quiz");
  };
  const name = `${u.name} · lesson ${index + 1}`;
  if (stage === "quiz" && qs) {
    return <Runner questions={qs} title={name} source="quiz"
                   onDone={(s, left) => {
                     if (!left && s.total) {
                       const pct = Math.round((s.credit / s.total) * 100);
                       update((p) => touchStreak(markComponent(p, u, index, "quiz", { q: pct })));
                     }
                     setScore(s); setStage("done");
                   }} />;
  }
  if (stage === "done") return <Done score={score} title={name} onBack={onBack} onAgain={startQuiz} />;
  return (
    <div>
      <div className="hrow"><Btn kind="ghost" label="Back" onClick={onBack} /><h1 style={{ margin: 0 }}>{name}</h1></div>
      <div className="cols" style={{ marginTop: 16, alignItems: "start" }}>
        {words.map((w) => (
          <div key={w.b} className="list" style={{ padding: 16 }}>
            <div className="hrow"><span style={{ fontSize: 28, fontWeight: 700 }} lang="ru"><Linked text={w.w} /></span><div className="spacer" /><Speaker text={w.b} /></div>
            <div className="sub" style={{ marginTop: 4 }}>{firstSense(w)}</div>
            {(w.x || []).slice(0, 1).map((x, k) => (
              <div className="example" key={k} style={{ marginTop: 10 }}>
                <div style={{ flex: 1 }}><Linked text={x.ru} mark={w} /><div className="en">{x.en}</div></div>
                <Speaker text={x.ru} size={28} recordedOnly />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="hrow" style={{ marginTop: 20, justifyContent: "flex-end" }}>
        <Btn kind="pri" label="Quiz" onClick={() => { update((p) => markComponent(p, u, index, "vocab")); startQuiz(); }} />
      </div>
    </div>
  );
}

export function Practice({ sub, go }) {
  const { st } = useSession();
  const [run, setRun] = useState(null);           // { type, questions, title }
  const [score, setScore] = useState(null);
  const lesson = sub && sub.lesson;
  const start = (type) => {
    const known = knownPool(st);
    const pool = known.length ? known : drillPool(st);
    const qs = Q.drillQuestions(type.id, DRILL_N, pool, undefined, st.typedDrills !== false);
    setScore(null);
    setRun({ type, questions: qs, title: type.name, key: Date.now() });
  };
  if (lesson) return <div className="pane-inner"><Lesson key={lesson.unit + ":" + lesson.index} unit={lesson.unit} index={lesson.index} onBack={() => go("learn")} /></div>;
  if (run && !score) return <div className="pane-inner"><Runner key={run.key} questions={run.questions} title={run.title} onDone={(s) => setScore(s)} /></div>;
  if (run && score) return <div className="pane-inner"><Done score={score} title={run.title} onBack={() => { setRun(null); setScore(null); }} onAgain={() => start(run.type)} /></div>;
  return (
    <div className="pane-inner">
      <h1>Practice</h1>
      <h2>Grammar</h2>
      <List>
        {DRILL_TYPES.map((d) => (
          <Row key={d.id} onClick={() => start(d)}>
            <div style={{ flex: 1 }}><div>{d.name}</div>{d.sub ? <Muted>{d.sub}</Muted> : null}</div>
          </Row>
        ))}
      </List>
      <Muted style={{ marginTop: 16 }}>Speaking and listening drills are on the phone.</Muted>
    </div>
  );
}
