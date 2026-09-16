/* Statistics — what is coming, how much sticks, what was answered
   (docs/PLAYBOOK.md 2.3).
 *
 * Due today and the seven-day forecast are read off the cards; retention and
 * the reviews a day come from the review log, which is what the scheduler's
 * optimiser will read too — so a number here is a number it can see. The log
 * arrives from the store a tick after the screen, and the screen says nothing
 * until it has. */

import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { useSession } from "../session";
import { useTheme } from "../theme";
import { Screen, Muted, List, Row, SectionLabel, Pill, Text } from "../ui";
import { readLog } from "../store";
import { L, idxOfWord } from "../data";
import { DAY, dayOf, dueCards, cardsOf, NEW, intervalLabel } from "@core/scheduler";

const GRADE = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* Cards falling due on each of the next seven days; today carries everything
   overdue as well, since that is what today's pile holds. */
export function forecast(seen, now, days = 7) {
  const today = dayOf(now);
  const out = Array.from({ length: days }, () => 0);
  for (const w in seen || {}) {
    for (const { card } of cardsOf(seen[w])) {
      if (card.state === NEW) continue;
      const k = Math.max(0, dayOf(card.dueAt) - today);
      if (k < days) out[k]++;
    }
  }
  return out;
}

/* Share of reviews of cards that had a memory (not a first sight) answered
   with anything but Again — over the rows given. Null with nothing to count. */
export function retentionOf(rows) {
  const had = rows.filter((r) => r.s !== null && r.s !== undefined && r.s > 0);
  if (!had.length) return null;
  return had.filter((r) => r.grade > 1).length / had.length;
}

/* Reviews per day over the last `days`, oldest first. */
export function perDay(rows, now, days = 7) {
  const today = dayOf(now);
  const out = Array.from({ length: days }, () => 0);
  for (const r of rows) {
    const k = today - r.day;
    if (k >= 0 && k < days) out[days - 1 - k]++;
  }
  return out;
}

/* How far back the calendar reaches. Twelve weeks is what fits across a phone
   at a size a finger could point at, and it is long enough that a gap in the
   middle of it means something. */
export const CAL_WEEKS = 12;
/* 12 × 18 + 11 × 3 = 249 dp, inside the 358 dp a 390 dp phone leaves after the
   screen's padding, so the grid never has to wrap or shrink. */
export const CAL_CELL = 18;
export const CAL_GAP = 3;

/* Day number -> how many cards were answered that day. Off the review log,
   which is the only record of *work*: `st.streak` counts attendance, because
   `touchStreak` runs from the session loader and so is stamped by opening the
   app (§30t). A calendar drawn from that would light up on a day nobody
   studied, which is the one thing a calendar like this must not do. */
export function studiedDays(rows) {
  const n = new Map();
  for (const r of rows || []) n.set(r.day, (n.get(r.day) || 0) + 1);
  return n;
}

/* Consecutive days worked, counting back from today. Yesterday still counts as
   the end of a run — the day is not over, and a streak that resets at midnight
   punishes somebody who has not sat down yet. */
export function runOf(counts, now) {
  const today = dayOf(now);
  let d = counts.has(today) ? today : counts.has(today - 1) ? today - 1 : null;
  if (d === null) return 0;
  let n = 0;
  while (counts.has(d)) { n++; d--; }
  return n;
}

/* The grid: `weeks` columns of seven, each column a Sunday-to-Saturday week,
   the last one the week we are in. Days after today are marked rather than
   left at zero — they are not days nobody studied, they have not happened. */
export function calendar(counts, now, weeks = CAL_WEEKS) {
  const today = dayOf(now);
  const sunday = today - new Date(today * DAY).getUTCDay();
  const out = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const start = sunday - w * 7, col = [];
    for (let i = 0; i < 7; i++) {
      const day = start + i;
      col.push({ day, n: counts.get(day) || 0, future: day > today });
    }
    out.push(col);
  }
  return out;
}

/* Four steps, not a gradient. A continuous shade asks the eye to compare two
   blues; four says "none, some, a lot, a big day" and can be read at a glance,
   which is the whole job of the grid. */
function Cal({ weeks, testID }) {
  const t = useTheme();
  /* All three lit steps are the one brand token at three weights, rather than
     three colours picked by eye — §31's rule about never choosing a palette
     value that way, applied to a fill that has no contrast minimum to solve
     against. */
  const cell = (d) => (d.future ? { backgroundColor: "transparent" }
    : d.n === 0 ? { backgroundColor: t.surface2 }
    : d.n < 5 ? { backgroundColor: t.brandBg }
    : d.n < 20 ? { backgroundColor: t.brand, opacity: 0.55 }
    : { backgroundColor: t.brand });
  /* A fixed cell rather than a twelfth of the screen. Stretched to the full
     width the squares come out about 30 dp, which makes the grid 210 dp tall —
     a fifth of the phone, most of it empty, for a figure that is not the point
     of the screen. Twelve weeks at this size is a strip you read at a glance,
     which is all a heat map is for. */
  return (
    <View testID={testID}
          style={{ flexDirection: "row", gap: CAL_GAP, marginTop: 8, justifyContent: "center" }}>
      {weeks.map((col, w) => (
        <View key={w} style={{ gap: CAL_GAP }}>
          {col.map((d) => (
            <View key={d.day} testID={`cal-${d.day}`}
                  style={[{ width: CAL_CELL, height: CAL_CELL, borderRadius: 3 }, cell(d)]} />
          ))}
        </View>
      ))}
    </View>
  );
}

function Figure({ value, label, first }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", paddingHorizontal: 4,
                   borderLeftWidth: first ? 0 : 1, borderLeftColor: t.lineSoft }}>
      <Text style={{ color: t.ink, fontSize: 26, fontWeight: "800", letterSpacing: -0.5 }}>{value}</Text>
      <Muted size={12} style={{ textAlign: "center", marginTop: 2 }}>{label}</Muted>
    </View>
  );
}

/* A row of bars, tallest to the ceiling of the group; a label under each. */
function Bars({ values, labels, testID }) {
  const t = useTheme();
  const max = Math.max(1, ...values);
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: 96, marginTop: 8 }}>
      {values.map((v, i) => (
        <View key={i} style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ color: t.ink2, fontSize: 11 }}>{v ? String(v) : ""}</Text>
          <View style={{ width: "100%", height: Math.max(2, Math.round(60 * v / max)),
                         backgroundColor: v ? t.brand : t.line, borderRadius: 3, marginTop: 2 }} />
          <Muted size={11} style={{ marginTop: 4 }}>{labels[i]}</Muted>
        </View>
      ))}
    </View>
  );
}

export default function Stats() {
  const { st } = useSession();
  const t = useTheme();
  const [log, setLog] = useState(null);
  const now = Date.now();
  useEffect(() => {
    let live = true;
    /* One read, wide enough for the calendar; the shorter windows below are
       filtered out of it rather than fetched again. */
    readLog({ since: now - CAL_WEEKS * 7 * DAY })
      .then((rows) => { if (live) setLog(rows); }).catch(() => { if (live) setLog([]); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const due = dueCards(st.seen, now, st.learnAhead).length;
  const ahead = forecast(st.seen, now);
  const labels = ahead.map((_, k) => (k === 0 ? "Today" : DAYS[new Date(now + k * DAY).getUTCDay()]));
  // Retention stays a thirty-day figure; widening the read must not move it.
  const retention = log ? retentionOf(log.filter((r) => r.at >= now - 30 * DAY)) : null;
  const week = log ? perDay(log, now) : null;
  const days = log ? studiedDays(log) : null;
  const run = days ? runOf(days, now) : 0;
  const weekLabels = week ? week.map((_, k) => DAYS[new Date(now - (6 - k) * DAY).getUTCDay()]) : [];
  const recent = log ? log.slice(-20).reverse() : [];
  const cards = Object.values(st.seen || {}).reduce((a, e) => a + cardsOf(e).length, 0);

  return (
    <Screen>
      <View style={{ flexDirection: "row", marginTop: 8, paddingVertical: 4 }}>
        <Figure first value={String(due)} label="due today" />
        <Figure value={retention === null ? "–" : `${Math.round(retention * 100)} %`} label="retention" />
        <Figure value={week ? String(week.reduce((a, b) => a + b, 0)) : "–"} label="reviews, 7 days" />
        <Figure value={cards.toLocaleString("en-US")} label="cards" />
      </View>

      {/* The run sits on the heading rather than under it: it is what the grid
          says, and saying it twice in two places is how a screen starts
          narrating itself (rule 20.7). */}
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 22 }}>
        <SectionLabel style={{ flex: 1 }}>Days studied</SectionLabel>
        {run ? <Pill testID="run">{run === 1 ? "1 day" : `${run} days`}</Pill> : null}
      </View>
      {days ? <Cal testID="calendar" weeks={calendar(days, now)} /> : <Muted>Loading…</Muted>}

      <SectionLabel style={{ marginTop: 22 }}>Coming up</SectionLabel>
      <Bars testID="forecast" values={ahead} labels={labels} />

      <SectionLabel style={{ marginTop: 22 }}>Answered</SectionLabel>
      {week ? <Bars testID="per-day" values={week} labels={weekLabels} /> : <Muted>Loading…</Muted>}

      <SectionLabel style={{ marginTop: 22 }}>Recent</SectionLabel>
      {!log ? null : !recent.length ? <Muted>Nothing yet</Muted> : (
        <List>
          {recent.map((r) => {
            const i = idxOfWord(r.word);
            const ago = now - r.at;
            return (
              <Row key={`${r.word}|${r.direction}|${r.at}`}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 16 }}>{i >= 0 ? L[i].w : r.word}</Text>
                  <Muted>{`${r.direction} · ${intervalLabel(ago)} ago`}</Muted>
                </View>
                <Pill>{GRADE[r.grade] || String(r.grade)}</Pill>
              </Row>
            );
          })}
        </List>
      )}
    </Screen>
  );
}
