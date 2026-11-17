/* Why this card came up — the developer's panel on a flashcard (the owner,
 * 2026-11-17: *"a diagnostic panel that's just specific for dev mode when
 * it's deciding which flash card to show, I want to see the justifications
 * for that card spelled out and the raw scores that went into the
 * calculation. Have a small little wrench icon on the card before it flips"*).
 *
 * Nothing here is computed for the panel: the session builder (core/queue.js)
 * stamps every item with `why` as it deals it — which pile the card came
 * from, and for the make-up draw the priority, each weighted part, the draw
 * key and the card's hold — and the panel reads that beside the card the
 * scheduler keeps. Developer mode only (`st.dev`), front of the card only. */

import React from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme, type as T } from "./theme";
import { Sheet, IconButton, Text, Muted } from "./ui";
import { familiarity, retrievability, kindOf, schedulerOpts, DAY } from "@core/scheduler";
import { FILL_WEIGHTS, FILL_SHARPEN, FILL_HOLD_SHARE, FILL_HOLD_MAX_DAYS, FILL_COOLDOWN_DAYS, SINCE_HORIZON_DAYS,
         fillHoldDays } from "@core/queue";
import { rankOf } from "./data";

const WRENCH = "M14.7 6.3a4.5 4.5 0 0 0-5.9 5.9L3 18l3 3 5.8-5.8a4.5 4.5 0 0 0 5.9-5.9l-2.9 2.9-2.1-2.1 2.9-2.9z";

export function WrenchButton({ onPress, testID = "why-card" }) {
  const t = useTheme();
  return (
    <IconButton onPress={onPress} testID={testID} label="Why this card" size={32}>
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={t.ink2}
           strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <Path d={WRENCH} />
      </Svg>
    </IconButton>
  );
}

/* The pile a card came from, in a line. */
const SOURCES = {
  learning: "Learning step due today",
  due: "Due by the schedule",
  new: "New card, within the day's ration",
  next: "New word past the goal",
  fill: "Make-up draw, not due",
  rare: "Make-up draw, low priority",
  round: "A round asked for by name",
  replacement: "In place of a rested word",
};

const days = (ms) => (Number.isFinite(ms) ? (ms / DAY).toFixed(1) : "–");
const num = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : "–");
const whenFrom = (ms, now) => {
  if (!(ms > 0)) return "never";
  const d = (now - ms) / DAY;
  return d >= 0 ? `${d.toFixed(1)} d ago` : `in ${(-d).toFixed(1)} d`;
};

/* Every fact the deal read, as rows. Exported for the test. */
export function whyRows(item, st, now) {
  const why = (item && item.why) || {};
  const card = item && item.card;
  const current = st.seen && st.seen[item.word] ? st.seen[item.word] : null;
  const rank = rankOf(item.word);
  const rows = [];
  const add = (k, v) => rows.push([k, v]);
  add("Source", SOURCES[why.source] || why.source || "unknown");
  if (item.again) add("Again", "back after a miss this sitting");
  if (item.direction) add("Front", item.direction);
  add("Kind", kindOf(card));
  if (card) {
    add("Stability", `${num(card.s, 2)} d`);
    add("Difficulty", num(card.d, 2));
    add("Reps · lapses", `${card.reps || 0} · ${card.lapses || 0}`);
    add("Last answered", whenFrom(card.lastAt, now));
    add("Due", whenFrom(card.dueAt, now));
    add("Interval", `${days(card.dueAt - card.lastAt)} d`);
    add("Retrievability now", num(retrievability(card, now, schedulerOpts(st))));
    const fam = familiarity(card, rank);
    add("Familiarity", fam === null ? "–" : `${fam} (rank ${Number.isFinite(rank) ? rank : "–"})`);
    add("Hold", `${num(fillHoldDays(card), 1)} d (${FILL_HOLD_SHARE} × interval, ${FILL_COOLDOWN_DAYS}–${FILL_HOLD_MAX_DAYS})`);
  }
  if (why.source === "due" || why.source === "learning") {
    if (Number.isFinite(why.urgency)) add("Urgency", `${num(why.urgency)} = (1 − r) / ${num(why.rankWeight, 2)}`);
  }
  if (why.source === "new" && Number.isFinite(why.rank)) add("Rank", String(why.rank));
  if (why.parts) {
    const W = why.weights || FILL_WEIGHTS;
    for (const k of Object.keys(why.parts)) {
      add(`  ${k}`, `${num(why.parts[k])} × ${W[k]} = ${num(why.parts[k] * W[k])}`);
    }
    add("Priority p", num(why.p));
    add("Since", `${num(why.days, 1)} d of ${SINCE_HORIZON_DAYS}`);
    if (why.ordered) add("Order", `from the start, place ${why.key}`);
    else {
      add("Weight", `p^${FILL_SHARPEN}${why.source === "rare" ? " × rare" : ""} = ${num(why.weight, 5)}`);
      add("Draw key", `u^(1/w) = ${num(why.key, 4)}`);
      add("Drawn", `${(why.place || 0) + 1} of ${why.of || "?"}`);
    }
  }
  if (current && current !== card) {
    const c = current.recognise;
    if (c && card && c.lastAt !== card.lastAt) add("Now", `answered ${whenFrom(c.lastAt, now)}, s ${num(c.s, 2)}`);
  }
  return rows;
}

export function WhyCardSheet({ item, st, onClose }) {
  const t = useTheme();
  const now = Date.now();
  const rows = whyRows(item, st, now);
  return (
    <Sheet testID="why-sheet" title="Why this card" onClose={onClose}>
      <Muted testID="why-word" style={{ marginBottom: 10 }}>{item.word}</Muted>
      {rows.map(([k, v], i) => (
        <View key={k + i} testID={`why-row-${i}`}
              style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 5,
                       borderTopWidth: i ? 1 : 0, borderTopColor: t.lineSoft }}>
          <Text style={{ color: t.ink2, fontSize: T.small }}>{k}</Text>
          <Text style={{ color: t.ink, fontSize: T.small, textAlign: "right", flexShrink: 1 }}>{v}</Text>
        </View>
      ))}
    </Sheet>
  );
}
