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
import { Screen, Muted, SectionLabel, Text, Familiarity, familiarityColor } from "../ui";
import { readLog } from "../store";
import { rankOf, dueCount } from "../data";
import { DAY, dayOf, cardsOf, cardFor, NEW, familiarity, familiarityLabel } from "@core/scheduler";

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

/* **Where the words stand**, in the familiarity score's own levels (the owner,
   2026-09-29: "the statistics are super ugly… make them more visually
   appealing or useful"). The screen used to lead with four bare numbers and
   end on a raw log ("recognise · 3m ago"); the one figure that says whether
   the studying is working is how many words have climbed, so it leads now.
   Read off the same `familiarity` the card and the entry draw, against each
   word's own frequency, so a word is at the same level on all three screens.
   Pure: the rank function comes in, so a test needs no payload. */
export const LEVELS = [
  ["New", null], ["Just met", 10], ["Learning", 32], ["Familiar", 60], ["Strong", 87], ["Mastered", 100],
];
export function mastery(seen, rank) {
  const out = Object.fromEntries(LEVELS.map(([name]) => [name, 0]));
  for (const w in seen || {}) {
    out[familiarityLabel(familiarity(cardFor(seen[w]), rank ? rank(w) : undefined))]++;
  }
  return out;
}

/* One figure, large, with what it is under it. */
function Figure({ value, label, testID }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
      <Text testID={testID} style={{ color: t.ink, fontSize: 24, fontWeight: "800", letterSpacing: -0.5,
                                     minWidth: 44 }}>{value}</Text>
      <Muted size={14}>{label}</Muted>
    </View>
  );
}

/* The words by level as one bar, each level its colour on the familiarity
   scale, and a legend with the counts. A level nobody is at draws nothing. */
function Levels({ counts }) {
  const t = useTheme();
  const total = LEVELS.reduce((a, [name]) => a + counts[name], 0);
  const colour = (score) => (score === null ? t.surface3 : familiarityColor(score, t));
  if (!total) return <Muted>Nothing studied yet</Muted>;
  return (
    <>
      <View testID="levels" style={{ flexDirection: "row", height: 16, borderRadius: 8, overflow: "hidden",
                                     marginTop: 10, backgroundColor: t.surface2 }}>
        {LEVELS.filter(([name]) => counts[name]).map(([name, score]) => (
          <View key={name} testID={`level-${name}`}
                style={{ flex: counts[name], backgroundColor: colour(score) }} />
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 12, rowGap: 8 }}>
        {LEVELS.map(([name, score]) => (
          <View key={name} style={{ width: "50%", flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colour(score) }} />
            <Text style={{ color: t.ink, fontSize: 15, flex: 1 }}>{name}</Text>
            <Text style={{ color: t.ink2, fontSize: 15, fontWeight: "700", marginRight: 16 }}>
              {counts[name].toLocaleString("en-US")}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}

/* A row of bars, tallest to the ceiling of the group; a label under each.
   `hot` is the one bar that is now — today — in full brand colour, the rest
   quieter, so the eye lands where the learner is. */
function Bars({ values, labels, testID, hot }) {
  const t = useTheme();
  const max = Math.max(1, ...values);
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, height: 110, marginTop: 10 }}>
      {values.map((v, i) => (
        <View key={i} style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ color: i === hot ? t.ink : t.ink2, fontSize: 12, fontWeight: i === hot ? "700" : "500" }}>
            {v ? String(v) : ""}
          </Text>
          <View style={{ width: "100%", height: Math.max(3, Math.round(70 * v / max)), marginTop: 3,
                         backgroundColor: !v ? t.surface3 : i === hot ? t.brand : t.brandBg,
                         borderTopLeftRadius: 6, borderTopRightRadius: 6,
                         borderBottomLeftRadius: 2, borderBottomRightRadius: 2 }} />
          <Muted size={11} style={{ marginTop: 5, fontWeight: i === hot ? "700" : "400" }}>{labels[i]}</Muted>
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

  // The same number the Study badge shows, so the two screens agree.
  const due = dueCount(st);
  const ahead = forecast(st.seen, now);
  const labels = ahead.map((_, k) => (k === 0 ? "Today" : DAYS[new Date(now + k * DAY).getUTCDay()]));
  // Retention stays a thirty-day figure; widening the read must not move it.
  const retention = log ? retentionOf(log.filter((r) => r.at >= now - 30 * DAY)) : null;
  const week = log ? perDay(log, now) : null;
  const days = log ? studiedDays(log) : null;
  const run = days ? runOf(days, now) : 0;
  const weekLabels = week ? week.map((_, k) => DAYS[new Date(now - (6 - k) * DAY).getUTCDay()]) : [];
  const levels = mastery(st.seen, rankOf);
  const pct = retention === null ? null : Math.round(retention * 100);

  return (
    <Screen>
      {/* How much sticks, as the same ring the cards carry; beside it the
          three things a learner acts on. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 20, marginTop: 8 }}>
        {pct === null
          ? <View style={{ width: 84, height: 84, borderRadius: 42, borderWidth: 7, borderColor: t.surface3 }} />
          : <Familiarity testID="retention" score={pct} size={84} text={`${pct}%`}
                         label={`Retention ${pct} percent`} />}
        <View style={{ flex: 1, gap: 4 }}>
          <Figure testID="due-today" value={String(due)} label="due today" />
          <Figure value={String(run)} label={run === 1 ? "day in a row" : "days in a row"} />
          <Figure value={week ? String(week.reduce((a, b) => a + b, 0)) : "–"} label="reviews this week" />
        </View>
      </View>
      <Muted size={12} style={{ marginTop: 6 }}>Retention, last 30 days</Muted>

      <SectionLabel style={{ marginTop: 26 }}>Your words</SectionLabel>
      <Levels counts={levels} />

      {/* The run sits on the heading rather than under it: it is what the grid
          says, and saying it twice in two places is how a screen starts
          narrating itself (rule 20.7). */}
      <SectionLabel style={{ marginTop: 26 }}>Coming up</SectionLabel>
      <Bars testID="forecast" values={ahead} labels={labels} hot={0} />

      <SectionLabel style={{ marginTop: 26 }}>Days studied</SectionLabel>
      {days ? <Cal testID="calendar" weeks={calendar(days, now)} /> : <Muted>Loading…</Muted>}

      <SectionLabel style={{ marginTop: 26 }}>This week</SectionLabel>
      {week ? <Bars testID="per-day" values={week} labels={weekLabels} hot={6} /> : <Muted>Loading…</Muted>}
      {/* The raw review log that ended the screen ("recognise · 3m ago") is
          gone: it was the database talking, and every word in it is on the
          flashcards and in the dictionary with more to say. */}
    </Screen>
  );
}
