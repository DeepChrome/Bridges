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
    readLog({ since: now - 30 * DAY }).then((rows) => { if (live) setLog(rows); }).catch(() => { if (live) setLog([]); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const due = dueCards(st.seen, now, st.learnAhead).length;
  const ahead = forecast(st.seen, now);
  const labels = ahead.map((_, k) => (k === 0 ? "Today" : DAYS[new Date(now + k * DAY).getUTCDay()]));
  const retention = log ? retentionOf(log) : null;
  const week = log ? perDay(log, now) : null;
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
