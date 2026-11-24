/* You — profile, progress and the trouble bank; Settings is screens/Settings.js. */

import React, { useEffect, useState } from "react";
import { View, Switch, Pressable } from "react-native";
import { useSession } from "../session";
import { useTheme, radius, type as T } from "../theme";
import { Screen, List, Row, Btn, Pill, Muted, Avatar, SectionLabel, Sheet, Text, Thumb, RowText } from "../ui";
import { plan as askPlan, setPlan } from "../lib/feedback";
import { PLANS, PLAN_NAMES, ALLOWANCE_LINES, planOf } from "@core/plans";
import { L, UN, STAGES, idxOfWord, lessonCount, lessonDone, lessonWords, dueCount, chapterOf } from "../data";
import { troubleWords } from "../studycards";
import { tagInfo } from "@core/errortags";
import { maxLapses, cardFor, REVIEW } from "@core/scheduler";
import { Settings } from "./Settings";

/* The grammar the learner keeps getting wrong, from the tags the speech feedback
   attaches to attempts (ROADMAP P5.11). Counted in state by recordAttempt; shown
   here most frequent first, each pointing at the unit whose note teaches it. */
export function grammarTrouble(st) {
  const counts = (st.speech && st.speech.tagCounts) || {};
  return Object.keys(counts)
    .map((id) => ({ id, n: counts[id], info: tagInfo(id) }))
    .filter((x) => x.info && x.n > 0)
    .sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
}

/* What the learner has, and what they should have by now (the owner,
   2026-10-03: "words learned and lessons cleared can also be clickable and
   show all completed words… at the top, there can be a recommendation for
   where the holes are (something they should have learned by that point)").
 *
 * A word is learned once its card has left the learning steps (the "words
 * learned" figure). A gap is a word of a lesson the learner has finished that
 * is not learned yet — never answered, still on its steps, or forgotten — in
 * route order, so the first gaps are the oldest. Exported for the test. */
/* `cardFor` is null for an entry that holds skill slots and no card — a word
   a form drill graded before any meaning question did (core/scheduler.js
   gradeSkill). Reading `.state` off it crashed the profile screen on the
   owner's phone (2026-11-17). */
const inReview = (entry) => { const c = cardFor(entry); return !!c && c.state === REVIEW; };
const isLearned = (st, b) => !!(st.seen && st.seen[b]) && inReview(st.seen[b]);
export function learnedByUnit(st) {
  const out = [], placed = new Set();
  for (const u of UN) {
    const words = (u.w || []).filter((i) => L[i] && isLearned(st, L[i].b));
    words.forEach((i) => placed.add(L[i].b));
    if (words.length) out.push({ unit: u, words });
  }
  // Learned outside the course: a deck's cards, a word added from a video.
  const other = Object.keys(st.seen || {}).filter((b) => !/\s/.test(b) && !placed.has(b) && isLearned(st, b));
  return { units: out, other };
}
export function gapsOf(st) {
  const out = [];
  for (const u of UN) {
    for (let k = 0; k < lessonCount(u); k++) {
      if (!lessonDone(st, u, k)) continue;
      for (const i of lessonWords(u, k)) if (L[i] && !isLearned(st, L[i].b)) out.push(i);
    }
  }
  return out;
}
export function finishedLessons(st) {
  return UN.map((u) => {
    const done = [];
    for (let k = 0; k < lessonCount(u); k++) if (lessonDone(st, u, k)) done.push(k + 1);
    return { unit: u, done, of: lessonCount(u) };
  }).filter((x) => x.done.length);
}

/* One figure in a band of four.
 *
 * These were four rounded boxes in a 2×2 grid — the "card, card, card, three
 * statistics" screen §25 names outright, and what the owner meant by blocky
 * squares. A number does not need a container to be read as a number; what it
 * needs is to be the largest thing in its column. The band is separated from
 * the figures beside it by a hairline, not by a box each. */
/* `onPress` makes a figure the way to what it counts — "cards to review"
   opens Study, which deals exactly those cards. */
function Stat({ value, label, first, onPress, testID }) {
  const t = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} disabled={!onPress}
               accessibilityRole={onPress ? "button" : undefined}
               style={{ flex: 1, alignItems: "center", paddingHorizontal: 4,
                        borderLeftWidth: first ? 0 : 1, borderLeftColor: t.lineSoft }}>
      <Text style={{ color: onPress ? t.brandInk : t.ink, fontSize: 26, fontWeight: "700",
                     letterSpacing: -0.5 }}>{value}</Text>
      <Muted size={12} style={{ textAlign: "center", marginTop: 2 }}>{label}</Muted>
    </Pressable>
  );
}


/* One tile of the profile: what it is, how many, and a tap for the detail.
 *
 * The profile used to run the trouble words and the grammar as two long lists
 * straight down the screen (the owner, 2026-09-28: *"it's ugly with trouble
 * words… hide those personalized feedback in some tiles"*). A list of twelve
 * words is detail, not a summary, and it pushed everything after it off the
 * phone. Each tile is the summary — a number — and the list opens in a sheet
 * when it is wanted. Two to a row, so four read at a glance. */
function Tile({ icon, tone, count, label, onPress, testID }) {
  const t = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button"
               accessibilityLabel={count === undefined ? label : `${label}: ${count}`}
               style={({ pressed }) => ({ flexBasis: "47%", flexGrow: 1, padding: 14, gap: 10,
                 borderRadius: radius.lg, backgroundColor: t.surface, borderWidth: 1,
                 borderColor: t.line, opacity: pressed ? 0.7 : 1 })}>
      <Thumb id={icon} tone={tone} />
      {/* A tile without a number (Statistics — the band above already shows
          the obvious one) carries its name where the number would be, so the
          four still read as one row of like things. */}
      {count === undefined ? (
        <Text style={{ color: t.ink, fontSize: T.head, fontWeight: "700" }}>{label}</Text>
      ) : (
        <View>
          <Text style={{ color: t.ink, fontSize: T.title, fontWeight: "700", letterSpacing: -0.4 }}>
            {count}
          </Text>
          <Muted>{label}</Muted>
        </View>
      )}
    </Pressable>
  );
}

/* When the day's allowance renews, in the learner's own clock. The Worker's
   counters roll at 00:00 UTC (§30d) — the afternoon in Los Angeles — so
   "midnight" would be false for most of the people reading it. */
export function renewsAt(now = new Date()) {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/* The plan, and today's use of it (core/plans.js). One quiet row on the
   profile — the plan's name, a tap for the rest — and a small sheet saying
   what is left of each allowance today (the owner, 2026-09-30: "they just
   click something like 'premium usage' and they get a little popup"). It
   used to be a titled section of four rows with Premium's numbers and price
   beside each, which is a sales page, not a profile. Asked of the Worker —
   the one that counts — on arrival, on every return to the profile, and when
   the sheet opens; drawn from the plan table alone when it cannot be
   reached. Its own component, holding its own open state, so the sheet
   redraws (§30be). */
/* The allowances spent without the learner asking, each with its own switch
   in the sheet (the owner, 2026-10-05: "if they want to save all AI credit
   for conversations, they could disable all other AI usage"). Conversation
   and translation are spent only by opening those screens, so they need
   none, and nor do questions to Teddy, which are asked (2026-10-08: wrong
   answers are no longer explained unasked). The value is the learner-state
   key that turns the use off. */
const AUTO_SPEND = { feedback: "sayFeedback" };

function PlanRow({ navigation }) {
  const t = useTheme();
  const { st, update } = useSession();
  const [info, setInfo] = useState(null);
  const [open, setOpen] = useState(false);
  const live = React.useRef(true);
  const ask = React.useCallback(
    () => askPlan().then((r) => { if (live.current) setInfo(r && r.ok ? r : null); }).catch(() => {}), []);
  useEffect(() => {
    live.current = true;
    ask();
    const off = navigation && navigation.addListener ? navigation.addListener("focus", ask) : null;
    return () => { live.current = false; if (typeof off === "function") off(); };
  }, [navigation, ask]);
  const plan = info ? info.plan : "free";
  const unlimited = plan === "owner" || plan === "custom";
  const caps = info && info.caps ? info.caps : PLANS[planOf(plan)];
  const name = unlimited ? "Unlimited" : PLAN_NAMES[planOf(plan)];
  /* The beta's own Premium switch (2026-10-01). Drawn only when the Worker
     says this install may choose (`selfServe`), so it is never a control that
     does nothing. What comes back is the Worker's answer, not the wish. */
  const [switching, setSwitching] = useState(false);
  const choose = async (premium) => {
    setSwitching(true);
    const r = await setPlan(premium ? "premium" : "free").catch(() => null);
    if (live.current) {
      if (r && r.ok) setInfo(r);
      setSwitching(false);
    }
  };
  return (
    <>
      <List>
        <Row testID="plan" onPress={() => { setOpen(true); ask(); }}>
          {/* The speech bubble, not the tutor's cap: the tile above already
              wears that, and two marks alike mark nothing (§30s). */}
          <Thumb id="talk" tone="brand" />
          <RowText title="AI usage" />
          <Text testID="plan-name" style={{ color: t.ink2, fontSize: T.body }}>{name}</Text>
        </Row>
      </List>
      {open ? (
        <Sheet testID="plan-sheet" title={`${name} · left today`} onClose={() => setOpen(false)}>
          {info && info.selfServe ? (
            <List>
              <Row testID="plan-premium-row">
                <RowText title="Premium" />
                <Switch testID="plan-premium" value={plan === "premium"} disabled={switching}
                        onValueChange={choose} />
              </Row>
            </List>
          ) : null}
          {info && info.selfServe ? <View style={{ height: 12 }} /> : null}
          {unlimited ? <Muted style={{ marginBottom: 10 }}>No daily limit</Muted> : null}
          {/* The list for every plan: the switches matter on an unlimited one
              too; only the counts are left off. */}
          {(
            <List>
              {ALLOWANCE_LINES.filter(([counter]) => !unlimited || AUTO_SPEND[counter]).map(([counter, label]) => {
                const left = info && !unlimited ? Math.max(0, caps[counter] - (info.used[counter] || 0)) : null;
                const key = AUTO_SPEND[counter];
                const on = key ? st[key] !== false : true;
                return (
                  <Row key={counter} testID={`plan-${counter}`}>
                    <Text style={{ flex: 1, color: on ? t.ink : t.ink3, fontSize: T.body }}>
                      {label.charAt(0).toUpperCase() + label.slice(1)}
                    </Text>
                    {unlimited ? null : (
                      <Text style={{ color: left === 0 ? t.bad : on ? t.ink : t.ink3, fontSize: T.body, fontWeight: "700" }}>
                        {left === null ? "–" : String(left)}
                      </Text>
                    )}
                    {key ? (
                      <Switch testID={`plan-use-${counter}`} value={on}
                              accessibilityLabel={`Use AI for ${label}`}
                              onValueChange={(v) => update((p) => ({ ...p, [key]: v }))}
                              trackColor={{ true: t.good, false: t.surface3 }} />
                    ) : null}
                  </Row>
                );
              })}
            </List>
          )}
          {unlimited ? null : (
            <Muted size={13} style={{ marginTop: 10 }}>{`Renews at ${renewsAt()}`}</Muted>
          )}
        </Sheet>
      ) : null}
    </>
  );
}

export default function You({ navigation }) {
  const { st, account, update } = useSession();
  const t = useTheme();
  const [settings, setSettings] = useState(false);
  const [showing, setShowing] = useState(null);      // which tile's sheet is open

  /* Words learned, not words seen (the owner, 2026-10-02): a word counts once
     its card has left the learning steps — remembered across a day at least —
     not the moment it was first shown. A sentence card is not a word. */
  const learned = Object.entries(st.seen)
    .filter(([w, e]) => !/\s/.test(w) && inReview(e)).length;
  // Cleared means done — vocabulary met and the quiz passed — not merely attempted.
  const lessons = UN.reduce((a, u) => {
    let n = 0;
    for (let i = 0; i < lessonCount(u); i++) if (lessonDone(st, u, i)) n++;
    return a + n;
  }, 0);
  const due = dueCount(st);
  const trouble = troubleWords(st);
  const grammar = grammarTrouble(st);
  const openUnit = (unitId) =>
    navigation.navigate("Learn", { screen: "Unit", params: { unitId } });
  /* The flashcards. Reached from the Study tab's own You, `navigate("Study")`
     names the tab the learner is already on and does nothing, and a nested
     navigate would push a second Cards on top of this screen; popping back to
     the one underneath is what the tap means. From any other tab it is a
     jump to Study. */
  const toCards = (params) => {
    const here = typeof navigation.getState === "function" ? navigation.getState() : null;
    if (here && here.routeNames && here.routeNames.includes("Cards")) navigation.popTo("Cards", params);
    else navigation.navigate("Study", { screen: "Cards", params });
  };

  return (
    <Screen>
      {/* The person, not a card of the person. This is the top of their own
          screen and there is nothing beside it to be grouped against, so the
          border and fill were doing no work — they only made the learner's name
          look like the first row of a settings list. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Avatar id={account ? account.avatar : "monkeynaut"} size={64} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.ink, fontSize: 24, fontWeight: "700",
                         letterSpacing: -0.4 }}>
            {account ? account.name : "Learner"}
          </Text>
          {account && account.placed ? (
            <Muted>{`Placed at chapter ${account.placed + 1}`}</Muted>
          ) : null}
        </View>
        <Btn kind="ghost" label="Settings" onPress={() => setSettings(true)} />
      </View>

      <View style={{ flexDirection: "row", marginTop: 26, paddingVertical: 4 }}>
        {/* The streak opens the statistics, which open on the days studied. */}
        <Stat first testID="stat-streak" value={String(st.streak || 0)} label="day streak"
              onPress={() => navigation.navigate("Stats")} />
        <Stat testID="stat-learned" value={learned.toLocaleString("en-US")} label="words learned"
              onPress={() => setShowing("learned")} />
        <Stat testID="stat-lessons" value={String(lessons)} label="lessons cleared"
              onPress={() => setShowing("lessons")} />
        {/* "due now" said nothing about what was due (the owner, 2026-09-29).
            It is the flashcards waiting today — the Study badge's number — and
            a tap goes there. */}
        <Stat testID="stat-due" value={due.toLocaleString("en-US")} label="cards to review"
              onPress={() => toCards(undefined)} />
      </View>
      {/* What the app has learned about this learner, as four tiles: the
          number on each, the detail a tap away (2026-09-28). Statistics was a
          loose text link under the band; it is one of the four now. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 24 }}>
        {/* Neutral, not red: red means wrong everywhere else in the app, and
            `Thumb` refuses it for that reason (§30ah). The count is the signal. */}
        <Tile testID="tile-trouble" icon="trouble"
              count={trouble.length} label="Trouble words" onPress={() => setShowing("trouble")} />
        <Tile testID="tile-grammar" icon="rules" tone="good"
              count={grammar.length} label="Grammar to work on" onPress={() => setShowing("grammar")} />
        <Tile testID="open-stats" icon="stats" tone="info" label="Statistics"
              onPress={() => navigation.navigate("Stats")} />
        <Tile testID="tile-notes" icon="tutor" tone="brand"
              count={(st.tutorNotes || []).length} label="What the tutor knows"
              onPress={() => setShowing("notes")} />
      </View>

      {/* What the AI has left for today: on the profile (the owner,
          2026-09-29: "make sure they can see how much 'AI juice' they have
          available still"), as one row with the detail a tap away. */}
      <View style={{ marginTop: 16, marginBottom: 16 }}>
        <PlanRow navigation={navigation} />
      </View>

      {showing === "trouble" ? (
        <Sheet testID="trouble-sheet" title="Trouble words" onClose={() => setShowing(null)}
               footer={trouble.length ? (
                 <Btn kind="pri" block style={{ marginTop: 14 }}
                      label={`Review ${trouble.length} trouble ${trouble.length === 1 ? "word" : "words"}`}
                      onPress={() => {
                        setShowing(null);
                        // One round, asked for by name — not a tick left on
                        // in the picker to narrow every session after it.
                        toCards({ round: "trouble" });
                      }} />
               ) : null}>
          {!trouble.length ? <Muted>Nothing yet</Muted> : (
            <List>
              {trouble.map((w) => {
                const i = idxOfWord(w);
                return (
                  <Row key={w}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.ink, fontSize: 16 }}>{i >= 0 ? L[i].w : w}</Text>
                      {i >= 0 ? <Muted numberOfLines={1}>{L[i].e}</Muted> : null}
                    </View>
                    <Pill>{`${maxLapses(st.seen[w])}×`}</Pill>
                  </Row>
                );
              })}
            </List>
          )}
        </Sheet>
      ) : null}

      {showing === "grammar" ? (
        <Sheet testID="grammar-sheet" title="Grammar to work on" onClose={() => setShowing(null)}>
          {!grammar.length ? <Muted>Nothing yet</Muted> : (
            <List>
              {grammar.map((g) => {
                const unit = g.info.unit ? UN.find((u) => u.id === g.info.unit) : null;
                return (
                  <Row key={g.id}
                       onPress={unit ? () => { setShowing(null); openUnit(unit.id); } : undefined}
                       disabled={!unit}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.ink, fontSize: T.body }}>{g.info.en}</Text>
                      {unit ? <Muted>{unit.name}</Muted> : null}
                    </View>
                    <Pill>{`${g.n}×`}</Pill>
                  </Row>
                );
              })}
            </List>
          )}
        </Sheet>
      ) : null}

      {showing === "learned" ? (() => {
        const gaps = gapsOf(st);
        const { units, other } = learnedByUnit(st);
        return (
          <Sheet testID="learned-sheet" title={`${learned} words learned`} onClose={() => setShowing(null)}>
            {/* The holes first: what a finished lesson taught that has not
                stuck, with one way to fix it. */}
            {gaps.length ? (
              <View testID="gaps" style={{ padding: 12, borderRadius: radius.md, backgroundColor: t.brandBg,
                                           marginBottom: 16, gap: 8 }}>
                <Text style={{ color: t.ink, fontWeight: "700" }}>
                  {`${gaps.length} ${gaps.length === 1 ? "word" : "words"} from finished lessons to firm up`}
                </Text>
                <Muted numberOfLines={2}>{gaps.slice(0, 10).map((i) => L[i].b).join(", ")}</Muted>
                <Btn kind="pri" testID="gaps-study" label="Study them"
                     onPress={() => {
                       setShowing(null);
                       toCards({ round: "list", words: gaps.slice(0, 50).map((i) => L[i].b), title: "Gaps" });
                     }} />
              </View>
            ) : null}
            {!units.length && !other.length ? <Muted>Nothing learned yet</Muted> : null}
            {units.map(({ unit, words }) => (
              <View key={unit.id} style={{ marginBottom: 12 }}>
                <SectionLabel>{`${unit.name} · ${words.length}`}</SectionLabel>
                <Text style={{ color: t.ink, lineHeight: 24 }}>
                  {words.map((i) => L[i].b).join(", ")}
                </Text>
              </View>
            ))}
            {other.length ? (
              <View style={{ marginBottom: 12 }}>
                <SectionLabel>{`Other · ${other.length}`}</SectionLabel>
                <Text style={{ color: t.ink, lineHeight: 24 }}>{other.join(", ")}</Text>
              </View>
            ) : null}
          </Sheet>
        );
      })() : null}

      {showing === "lessons" ? (() => {
        const done = finishedLessons(st);
        return (
          <Sheet testID="lessons-sheet" title={`${lessons} lessons cleared`} onClose={() => setShowing(null)}>
            {!done.length ? <Muted>No lessons finished yet</Muted> : (
              <List>
                {done.map(({ unit, done: ks, of }) => {
                  const stage = chapterOf(unit.id);
                  const n = stage ? STAGES.indexOf(stage) + 1 : null;
                  return (
                    <Row key={unit.id} onPress={() => { setShowing(null); openUnit(unit.id); }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: t.ink, fontSize: T.body }}>{unit.name}</Text>
                        {n ? <Muted>{`Chapter ${n}`}</Muted> : null}
                      </View>
                      <Pill tone={ks.length === of ? "good" : undefined}>{`${ks.length}/${of}`}</Pill>
                    </Row>
                  );
                })}
              </List>
            )}
          </Sheet>
        );
      })() : null}

      {/* What the tutor has kept about this learner (§30aw `remember`) — the
          one piece of personal feedback nothing else in the app showed. */}
      {showing === "notes" ? (
        <Sheet testID="notes-sheet" title="What the tutor knows" onClose={() => setShowing(null)}>
          {!(st.tutorNotes || []).length ? <Muted>Nothing yet</Muted> : (
            <List>
              {(st.tutorNotes || []).map((n, k) => (
                <Row key={k}>
                  <RowText title={n} bold={false} />
                </Row>
              ))}
            </List>
          )}
        </Sheet>
      ) : null}

      <Settings visible={settings} onClose={() => setSettings(false)}
                onLab={() => navigation.navigate("SttLab")}
                onTour={() => navigation.navigate("Tour")}
                onCredits={() => navigation.navigate("Credits")}
                onFeedback={() => navigation.navigate("Feedback", { from: "Settings" })} />
    </Screen>
  );
}
