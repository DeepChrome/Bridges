/* Statistics — what is coming, how much sticks, what was answered
   (docs/PLAYBOOK.md 2.3).
 *
 * Due today and the seven-day forecast are read off the cards; retention and
 * the reviews a day come from the review log, which is what the scheduler's
 * optimiser will read too — so a number here is a number it can see. The log
 * arrives from the store a tick after the screen, and the screen says nothing
 * until it has.
 *
 * **Every figure and every bar explains itself on a tap, and nowhere else**
 * (the owner, 2026-11-19: *"Stats page has potential but it's not self
 * explanatory. For example, coming up today 426… what does that mean… Make
 * the option to click the bar and get a tooltip… Make the graphics more
 * interactive where the user can click things and get more details (concisely
 * explained)"*). A `Bubble` (ui.js) holds the one or two lines; the screen
 * itself carries labels only (rule 20.7). */

import React, { useEffect, useMemo, useState } from "react";
import { View, Pressable } from "react-native";
import { useSession } from "../session";
import { useTheme, type as T } from "../theme";
import { Screen, Muted, SectionLabel, Text, Familiarity, familiarityColor, Sheet, Bubble, List, Row, RowText, Thumb } from "../ui";
import { readLog } from "../store";
import { rankOf, dueCount, UN, exactIdx, grammarNoteOf } from "../data";
import { DAY, dayOf, cardsOf, cardFor, NEW, familiarity, familiarityLabel } from "@core/scheduler";
import { goalPerDay } from "@core/queue";

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

/* How far back the screen reads the log: a year, so the calendar can be paged
   back through the months worked. */
const LOG_DAYS = 400;

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

/* **The month, as a calendar of what was studied** (the owner, 2026-10-02:
   "a calendar format and on that day's block it can just say the general
   thing studied (Food and Drink) or (dative case) almost like an outlook
   calendar and then maybe a rough estimate of time spent studying").
 *
 * Off the review log, for the reason the old heat grid was (§30t): the log is
 * the record of work, `st.streak` the record of opening the app.
 *
 * **The time is an estimate and says so.** The log holds one row per graded
 * answer, so a sitting is the run of answers no more than `SITTING_GAP` apart:
 * the gaps inside it are counted, each capped (a learner reading an entry for
 * ten minutes between two answers was not answering for ten minutes), and
 * each sitting is given `SITTING_LEAD` for the reading before its first
 * answer. Videos and listening grade nothing and are not in it. */
export const SITTING_GAP = 10 * 60000;
const ANSWER_CAP = 3 * 60000;
const SITTING_LEAD = 60000;

/* Day number -> { n, minutes, topic, topics, counts }. `topicOf(row)` names
   what a row was about ("Food & Drink", "Dative case"), or null; the day's
   topic is the one named most, `topics` all of them most first, and `counts`
   the answers each had — the day's sheet lists them with their numbers rather
   than as bare names (the owner, 2026-11-19: "see how ugly that information
   at the bottom is"). Pure, so a test needs no payload. */
export function dayReport(rows, topicOf) {
  const byDay = new Map();
  for (const r of rows || []) {
    if (!byDay.has(r.day)) byDay.set(r.day, []);
    byDay.get(r.day).push(r);
  }
  const out = new Map();
  for (const [day, list] of byDay) {
    list.sort((a, b) => a.at - b.at);
    let ms = SITTING_LEAD;
    const topics = new Map();
    list.forEach((r, k) => {
      if (k) {
        const gap = r.at - list[k - 1].at;
        ms += gap > SITTING_GAP ? SITTING_LEAD : Math.min(gap, ANSWER_CAP);
      }
      const name = topicOf ? topicOf(r) : null;
      if (name) topics.set(name, (topics.get(name) || 0) + 1);
    });
    const sorted = [...topics].sort((a, b) => b[1] - a[1]);
    out.set(day, { n: list.length, minutes: Math.max(1, Math.round(ms / 60000)),
                   topic: sorted.length ? sorted[0][0] : null,
                   topics: sorted.map(([name]) => name),
                   counts: sorted.map(([name, n]) => ({ name, n })) });
  }
  return out;
}

/* The weeks of one month, Sunday first: each cell the scheduler's day number
   for that date, or null outside the month. Built from local noon on each
   date, which is inside the scheduler's day whatever the 4 am rollover. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: first }, () => null);
  for (let d = 1; d <= days; d++) {
    const ms = new Date(year, month, d, 12).getTime();
    cells.push({ date: d, ms, day: dayOf(ms) });
  }
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let k = 0; k < cells.length; k += 7) weeks.push(cells.slice(k, k + 7));
  return weeks;
}

/* What a row was about. A drill or the chapter's grammar question is about
   its grammar point — the unit's own rule card, so it reads "Dative case"
   rather than "Cases" where the card says so; everything else is the unit
   that teaches the word. */
const GRAMMAR_KINDS = { cases: "Cases", conjugation: "Conjugation", aspect: "Aspect",
                        agreement: "Adjective agreement", form: "Grammar", stress: "Stress" };
let unitOfIdx = null;
function unitOfWord(word) {
  if (!unitOfIdx) {
    unitOfIdx = new Map();
    for (const u of UN) for (const i of u.w) if (!unitOfIdx.has(i)) unitOfIdx.set(i, u);
  }
  const i = exactIdx(word);
  return i >= 0 ? unitOfIdx.get(i) || null : null;
}
function topicOfRow(r) {
  const u = unitOfWord(r.word);
  if (GRAMMAR_KINDS[r.source]) {
    const g = u ? grammarNoteOf(u) : null;
    return (r.source !== "stress" && g && g.title) || GRAMMAR_KINDS[r.source];
  }
  if (u) return u.name;
  return /\s/.test(r.word) ? "Sentences" : null;
}
/* The unit icon a topic row carries, where the topic is a unit. */
const iconOfTopic = (name) => { const u = UN.find((x) => x.name === name); return u ? u.id : "stats"; };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
                "August", "September", "October", "November", "December"];
const fmtTime = (m) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`);

function MonthCal({ report, now, onDay }) {
  const t = useTheme();
  const [shift, setShift] = useState(0);
  const base = new Date(now);
  const at = new Date(base.getFullYear(), base.getMonth() + shift, 1);
  const weeks = monthGrid(at.getFullYear(), at.getMonth());
  const today = dayOf(now);
  let total = 0, studied = 0;
  for (const w of weeks) for (const c of w) {
    const d = c && report.get(c.day);
    if (d) { total += d.minutes; studied++; }
  }
  return (
    <View testID="calendar">
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
        <Pressable testID="cal-prev" accessibilityRole="button" accessibilityLabel="Previous month"
                   hitSlop={8} onPress={() => setShift(shift - 1)}
                   style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: t.ink2, fontSize: 22 }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text testID="cal-month" style={{ color: t.ink, fontSize: 17, fontWeight: "700" }}>
            {`${MONTHS[at.getMonth()]} ${at.getFullYear()}`}
          </Text>
          <Muted size={12}>{studied ? `${studied} ${studied === 1 ? "day" : "days"} · ~${fmtTime(total)}` : " "}</Muted>
        </View>
        <Pressable testID="cal-next" accessibilityRole="button" accessibilityLabel="Next month"
                   hitSlop={8} onPress={shift < 0 ? () => setShift(shift + 1) : undefined}
                   style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center",
                            opacity: shift < 0 ? 1 : 0.3 }}>
          <Text style={{ color: t.ink2, fontSize: 22 }}>›</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", marginTop: 4 }}>
        {DAYS.map((d) => (
          <Muted key={d} size={11} style={{ flex: 1, textAlign: "center" }}>{d[0]}</Muted>
        ))}
      </View>
      {weeks.map((w, k) => (
        <View key={k} style={{ flexDirection: "row", gap: 3, marginTop: 3 }}>
          {w.map((c, j) => {
            if (!c) return <View key={j} style={{ flex: 1 }} />;
            const d = report.get(c.day);
            const isToday = c.day === today;
            return (
              <Pressable key={j} testID={`cal-${c.day}`} disabled={!d} onPress={d ? () => onDay(c, d) : undefined}
                         accessibilityRole={d ? "button" : undefined}
                         accessibilityLabel={d ? `${MONTHS[at.getMonth()]} ${c.date}, ${d.topic || "studied"}, about ${fmtTime(d.minutes)}` : undefined}
                         style={{ flex: 1, minHeight: 62, borderRadius: 6, padding: 3,
                                  backgroundColor: d ? t.brandBg : c.day > today ? "transparent" : t.surface2,
                                  borderWidth: isToday ? 1.5 : 0, borderColor: t.brand }}>
                <Text style={{ color: d ? t.brandInk : t.ink3, fontSize: 11, fontWeight: isToday ? "700" : "500" }}>
                  {c.date}
                </Text>
                {d ? (
                  <>
                    <Text numberOfLines={2} style={{ color: t.ink, fontSize: 9, lineHeight: 11, marginTop: 1 }}>
                      {d.topic || "Review"}
                    </Text>
                    <Text style={{ color: t.brandInk, fontSize: 9, fontWeight: "700", marginTop: "auto" }}>
                      {fmtTime(d.minutes)}
                    </Text>
                  </>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/* **Where the words stand**, in the familiarity score's own levels (the owner,
   2026-09-29: "the statistics are super ugly… make them more visually
   appealing or useful"). Read off the same `familiarity` the card and the
   entry draw, against each word's own frequency, so a word is at the same
   level on all three screens. Pure: the rank function comes in. */
export const LEVELS = [
  ["New", null], ["Just met", 10], ["Learning", 32], ["Familiar", 60], ["Strong", 87], ["Mastered", 100],
];
/* What each level means, in a line, for the bubble. */
const LEVEL_MEANS = {
  New: "Met, not yet answered",
  "Just met": "Answered a few times; score under 20",
  Learning: "Coming back often; score 20 to 45",
  Familiar: "Held for days; score 45 to 75",
  Strong: "Held for weeks; score 75 to 95",
  Mastered: "Held for months; score 95 and up",
};
export function mastery(seen, rank) {
  const out = Object.fromEntries(LEVELS.map(([name]) => [name, 0]));
  for (const w in seen || {}) {
    out[familiarityLabel(familiarity(cardFor(seen[w]), rank ? rank(w) : undefined))]++;
  }
  return out;
}

/* One figure, large, with what it is under it; a tap says more (`onPress`). */
function Figure({ value, label, testID, onPress }) {
  const t = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole={onPress ? "button" : undefined}
               style={({ pressed }) => ({ flexDirection: "row", alignItems: "baseline", gap: 8, opacity: pressed ? 0.6 : 1 })}>
      <Text testID={testID ? `${testID}-value` : undefined}
            style={{ color: t.ink, fontSize: 24, fontWeight: "700", letterSpacing: -0.5, minWidth: 44 }}>{value}</Text>
      <Muted size={14}>{label}</Muted>
    </Pressable>
  );
}

/* The words by level as one bar, each level its colour on the familiarity
   scale, and a legend with the counts; a level tapped says what it means. */
function Levels({ counts, onLevel }) {
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
          <Pressable key={name} testID={`level-row-${name}`} accessibilityRole="button"
                     onPress={() => onLevel(name, counts[name])}
                     style={({ pressed }) => ({ width: "50%", flexDirection: "row", alignItems: "center", gap: 8,
                                                opacity: pressed ? 0.6 : 1 })}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colour(score) }} />
            <Text style={{ color: t.ink, fontSize: T.body, flex: 1 }}>{name}</Text>
            <Text style={{ color: t.ink2, fontSize: T.body, fontWeight: "700", marginRight: 16 }}>
              {counts[name].toLocaleString("en-US")}
            </Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}

/* A row of bars, tallest to the ceiling of the group; a label under each.
   `hot` is the one bar that is now — today — in full brand colour, the rest
   quieter, so the eye lands where the learner is. A bar is a button: `onBar(i)`
   opens its line. */
function Bars({ values, labels, testID, hot, onBar }) {
  const t = useTheme();
  const max = Math.max(1, ...values);
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, height: 110, marginTop: 10 }}>
      {values.map((v, i) => (
        <Pressable key={i} testID={`${testID}-${i}`} accessibilityRole="button" onPress={() => onBar(i)}
                   accessibilityLabel={`${labels[i]}: ${v}`}
                   style={({ pressed }) => ({ flex: 1, alignItems: "center", opacity: pressed ? 0.6 : 1 })}>
          <Text style={{ color: i === hot ? t.ink : t.ink2, fontSize: 12, fontWeight: i === hot ? "700" : "500" }}>
            {v ? String(v) : ""}
          </Text>
          <View style={{ width: "100%", height: Math.max(3, Math.round(70 * v / max)), marginTop: 3,
                         backgroundColor: !v ? t.surface3 : i === hot ? t.brand : t.brandBg,
                         borderTopLeftRadius: 6, borderTopRightRadius: 6,
                         borderBottomLeftRadius: 2, borderBottomRightRadius: 2 }} />
          <Muted size={11} style={{ marginTop: 5, fontWeight: i === hot ? "700" : "400" }}>{labels[i]}</Muted>
        </Pressable>
      ))}
    </View>
  );
}

/* The one or two lines behind a tap: a figure large, what it is under it. */
function Explain({ tip, onClose }) {
  const t = useTheme();
  if (!tip) return null;
  return (
    <Bubble testID="stats-tip" title={tip.title} onClose={onClose}>
      {tip.value !== undefined ? (
        <Text testID="stats-tip-value" style={{ color: t.ink, fontSize: 34, fontWeight: "700", letterSpacing: -0.5 }}>{tip.value}</Text>
      ) : null}
      {tip.lines.map((line, k) => (
        <Text key={k} testID={`stats-tip-line-${k}`} style={{ color: k ? t.ink2 : t.ink, fontSize: T.body, lineHeight: 23, marginTop: k ? 4 : 8 }}>
          {line}
        </Text>
      ))}
    </Bubble>
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
    readLog({ since: now - LOG_DAYS * DAY })
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
  const report = useMemo(() => (log ? dayReport(log, topicOfRow) : null), [log]);
  const [open, setOpen] = useState(null);           // { c, d } of the day tapped
  const [tip, setTip] = useState(null);             // { title, value?, lines }
  const weekTotal = week ? week.reduce((a, b) => a + b, 0) : null;
  const perDayGoal = goalPerDay(st.newPerDay);

  return (
    <Screen>
      {/* How much sticks, as the same ring the cards carry; beside it the
          three things a learner acts on. Each is a tap from its meaning. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 20, marginTop: 8 }}>
        <Pressable testID="retention-figure" accessibilityRole="button"
                   onPress={() => setTip({ title: "Retention", value: pct === null ? "–" : `${pct}%`,
                     lines: ["Of the cards you had learned and reviewed in the last 30 days, the share you remembered.",
                             "Anything but Again counts as remembered."] })}>
          {pct === null
            ? <View style={{ width: 84, height: 84, borderRadius: 42, borderWidth: 7, borderColor: t.surface3 }} />
            : <Familiarity testID="retention" score={pct} size={84} text={`${pct}%`}
                           label={`Retention ${pct} percent`} />}
        </Pressable>
        <View style={{ flex: 1, gap: 4 }}>
          <Figure testID="due-today" value={String(due)} label="to go today"
                  onPress={() => setTip({ title: "To go today", value: String(due),
                    lines: [`Your daily review: ${perDayGoal} cards a study day, plus any new words from today's lessons and videos.`,
                            "A day skipped carries over."] })} />
          <Figure testID="run-figure" value={String(run)} label={run === 1 ? "day in a row" : "days in a row"}
                  onPress={() => setTip({ title: "Days in a row", value: String(run),
                    lines: ["Days with at least one card answered, counting back from today.",
                            "Yesterday still counts until today is done."] })} />
          <Figure testID="week-figure" value={weekTotal === null ? "–" : String(weekTotal)} label="reviews this week"
                  onPress={() => setTip({ title: "Reviews this week", value: weekTotal === null ? "–" : String(weekTotal),
                    lines: ["Cards answered in the last seven days, in lessons, drills and the review."] })} />
        </View>
      </View>

      {/* The days studied lead: tapping the streak is how this screen is
          reached (You.js), and the streak is a claim about days. */}
      <SectionLabel style={{ marginTop: 26 }}>Days studied</SectionLabel>
      {report ? <MonthCal report={report} now={now} onDay={(c, d) => setOpen({ c, d })} />
              : <Muted>Loading…</Muted>}
      {open ? (
        <Sheet testID="day-sheet" title={new Date(open.c.ms).toLocaleDateString("en-US",
                 { weekday: "long", month: "long", day: "numeric" })}
               onClose={() => setOpen(null)}>
          <View style={{ flexDirection: "row", gap: 24, marginBottom: 14 }}>
            <Figure value={`~${fmtTime(open.d.minutes)}`} label="studying" />
            <Figure value={String(open.d.n)} label={open.d.n === 1 ? "answer" : "answers"} />
          </View>
          {/* What the day was about, as rows with their counts — not a list of
              names (the owner, 2026-11-19: "a blob of text"). */}
          {open.d.counts.length ? (
            <List>
              {open.d.counts.slice(0, 8).map(({ name, n }) => (
                <Row key={name} testID={`day-topic-${name}`}>
                  <Thumb id={iconOfTopic(name)} tone="brand" />
                  <RowText title={name} bold={false} />
                  <Muted>{String(n)}</Muted>
                </Row>
              ))}
            </List>
          ) : null}
        </Sheet>
      ) : null}

      <SectionLabel style={{ marginTop: 26 }}>Your words</SectionLabel>
      <Levels counts={levels}
              onLevel={(name, n) => setTip({ title: name, value: String(n), lines: [LEVEL_MEANS[name] || ""] })} />

      {/* Due by the schedule, a bar a day. Today's holds everything overdue,
          which is why it towers: the review takes it on at the day's pace. */}
      <SectionLabel style={{ marginTop: 26 }}>Due by day</SectionLabel>
      <Bars testID="forecast" values={ahead} labels={labels} hot={0}
            onBar={(i) => setTip(i === 0
              ? { title: "Due today", value: String(ahead[0]),
                  lines: ["Cards the schedule says are due now, overdue ones included.",
                          `Your review deals ${perDayGoal} a study day; the rest wait their turn.`] }
              : { title: `Due ${labels[i]}`, value: String(ahead[i]),
                  lines: ["Cards whose next review falls on that day."] })} />

      <SectionLabel style={{ marginTop: 26 }}>Cards answered</SectionLabel>
      {week ? (
        <Bars testID="week" values={week} labels={weekLabels} hot={6}
              onBar={(i) => setTip({ title: i === 6 ? "Today" : weekLabels[i], value: String(week[i]),
                lines: ["Cards answered that day, in lessons, drills and the review."] })} />
      ) : <Muted>Loading…</Muted>}
      <Explain tip={tip} onClose={() => setTip(null)} />
    </Screen>
  );
}
