/* Learn: the course as an outline — chapters down the page, units with their
   lessons and progress, Continue at the top. A lesson opens its words and
   its quiz in the pane (Practice's runner). */

import React from "react";
import { useSession } from "../session.jsx";
import { STAGES, unitProgress, unitUnlocked, lessonCount, lessonWords, lessonDone, nextLesson, L, stageUnlocked, optional }
  from "../../../../native/src/data.js";
import { Btn, Pill, Muted, Row, List } from "../ui.jsx";
import { Linked } from "../words.jsx";

export function Learn({ go }) {
  const { st } = useSession();
  const next = nextLesson(st);
  return (
    <div className="pane-inner">
      <div className="hrow">
        <h1 style={{ flex: 1 }}>Learn</h1>
        {next ? <Btn kind="pri" label={`Continue · ${next.unit.name}`} onClick={() => go("practice", { lesson: { unit: next.unit.id, index: next.index } })} /> : null}
      </div>
      {STAGES.map((s, si) => {
        const openStage = stageUnlocked(st, si);
        const units = [s.core].concat(s.branches);
        return (
          <section key={s.core.id} style={{ opacity: openStage ? 1 : .55 }}>
            <h2>Chapter {s.n} · {s.title}</h2>
            <div className="cols">
              {units.map((u) => {
                const unlocked = unitUnlocked(st, u);
                const n = lessonCount(u);
                const done = Array.from({ length: n }, (_, k) => lessonDone(st, u, k)).filter(Boolean).length;
                return (
                  <div key={u.id} className="list">
                    <Row>
                      <div style={{ flex: 1 }}>
                        <div className="hrow"><b>{u.name}</b>{optional(u) ? <Pill>optional</Pill> : null}{!unlocked ? <Pill>locked</Pill> : null}</div>
                        <Muted>{done} of {n} lessons · {u.w.length} words</Muted>
                      </div>
                      <div style={{ width: 80 }} className="bar"><div style={{ width: `${Math.round(unitProgress(st, u) * 100)}%` }} /></div>
                    </Row>
                    {unlocked ? Array.from({ length: n }, (_, k) => (
                      <Row key={k} onClick={() => go("practice", { lesson: { unit: u.id, index: k } })}>
                        <span className="muted" style={{ width: 22 }}>{k + 1}</span>
                        <div style={{ flex: 1 }} lang="ru">
                          <Linked text={lessonWords(u, k).map((i) => L[i].b).join(" · ")} />
                        </div>
                        {lessonDone(st, u, k) ? <Pill tone="brand">done</Pill> : null}
                      </Row>
                    )) : null}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
