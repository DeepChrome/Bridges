/* The Study options sheet: what kind of card, which front, how many new a
 * day, and where new cards come from. Carved out of screens/Study.js as a
 * pure move. */

import React, { useState } from "react";
import { View, Alert } from "react-native";
import { useSession } from "./session";
import { useTheme } from "./theme";
import { Btn, List, Row, Tick, SectionLabel, Sheet, Stepper, RowText, Choice, ActionChip, Text } from "./ui";
import { STAGES, unitUnlocked, L, exactIdx, lowPriority } from "./data";
import { firstSense } from "@core/util";
import { DIRECTIONS, DEFAULT_FRONTS } from "@core/scheduler";
import { QUEUE_DEFAULTS, kindsOf, CARD_KINDS } from "@core/queue";

/* The three directions as the learner sees them: by what is on the **front**.
 *
 * They were three switches in Settings named "Cards: recognise / produce /
 * listen" — the scheduler's words, not a learner's — and the owner studied for
 * days without finding them, reporting the produce card as "sometimes the card
 * starts in English" and the listen card, whose front is a speaker and nothing
 * else, as "blank". Both are the app working as designed with nothing on the
 * card saying so. The names here say what you will see. (A caption naming the
 * front sat on the card too until 2026-10-05; the owner found it redundant.) */
export const FRONTS = [
  ["recognise", "Russian", "You give the meaning"],
  ["produce", "English", "You give the Russian"],
  ["listen", "Sound only", "You give what you heard"],
];

/* The cards set aside as low priority (Study's card, data.js lowPriority),
   newest first, each with the way back into the rotation (the owner,
   2026-11-06: "The user needs to be able to access this list of low prio
   words in case they want to remove them from the low priority list later").
   Folded under one row, since a long list would push the options down. Only
   drawn while there is something on it. */
function LowPriorityList() {
  const { st, update } = useSession();
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const low = lowPriority(st);
  const words = Object.keys(low).sort((a, b) => low[b] - low[a]);
  if (!words.length) return null;
  const restore = (w) => update((p) => {
    const next = { ...(p.lowPriority || {}) };
    delete next[w];
    return { ...p, lowPriority: next };
  });
  return (
    <View style={{ marginBottom: 18 }}>
      <SectionLabel>Low priority</SectionLabel>
      <List>
        <Row testID="low-priority-open" onPress={() => setOpen(!open)}>
          <RowText title={`${words.length} ${words.length === 1 ? "card" : "cards"} set aside`} bold={false} />
          <Text style={{ color: t.brandInk, fontSize: 15, fontWeight: "600" }}>{open ? "Hide" : "Show"}</Text>
        </Row>
        {open ? words.map((w) => {
          const i = exactIdx(w);
          return (
            <Row key={w} testID={`low-${w}`}>
              <RowText title={i >= 0 ? L[i].w : w} sub={i >= 0 ? firstSense(L[i]) : undefined} bold={false} />
              <ActionChip label="Restore" testID={`restore-${w}`} onPress={() => restore(w)} />
            </Row>
          );
        }) : null}
      </List>
    </View>
  );
}

export function SetPicker({ visible, onClose }) {
  const { st, update } = useSession();
  const t = useTheme();
  const toggle = (id) => update((p) => ({
    ...p,
    sets: p.sets.includes(id) ? p.sets.filter((x) => x !== id) : p.sets.concat(id),
  }));
  /* Words, sentences or both. The last one cannot be unticked — a session of
     no kind of card is a session of nothing (§30ac's rule). */
  const kinds = kindsOf(st.cardKinds);
  const toggleKind = (id) => update((p) => {
    const cur = kindsOf(p.cardKinds);
    if (cur.includes(id)) return cur.length === 1 ? p : { ...p, cardKinds: cur.filter((k) => k !== id) };
    return { ...p, cardKinds: CARD_KINDS.filter((k) => k === id || cur.includes(k)) };
  });

  const removeDeck = (d) => Alert.alert(
    "Remove deck", `Remove “${d.name}”? Its cards' review history stays.`,
    [{ text: "Cancel", style: "cancel" },
     { text: "Remove", style: "destructive",
       onPress: () => update((p) => ({ ...p, decks: (p.decks || []).filter((x) => x.id !== d.id),
                                       sets: p.sets.filter((x) => x !== "deck:" + d.id) })) }]);

  /* Just the way out. "Export selected as an Anki deck" stood here and is gone
     (the owner, 2026-09-22: *"remove the anki deck export"*). It answered a
     question nobody was asking in the middle of choosing what to study, and
     the app is where the studying happens — a learner who wants their cards
     elsewhere is a learner leaving. Import moved to Settings, beside backup
     and restore, which is the same family of job: bringing something in. */
  const footer = <Btn block kind="pri" label="Done" style={{ marginTop: 8 }} onPress={onClose} />;

  /* How the cards are asked — one way, both ways, or audio only (the owner,
     2026-09-23). A word is one card, so a front chooses nothing about *which*
     cards are dealt, only how each is met; two fronts ticked take turns on
     the same card. These lived in Settings and were never found; a learner
     decides them at the moment of starting, so they are here, where the sets
     are. The last front cannot be unticked — a session with no front is a
     session with no cards, and a control that lets you build one and then
     apologises is worse than one that will not (§30ac made the same rule for
     the drill focus). */
  const fronts = st.flash || DEFAULT_FRONTS;
  const toggleFront = (id) => update((p) => {
    const cur = p.flash || DEFAULT_FRONTS;
    if (cur.includes(id)) return cur.length === 1 ? p : { ...p, flash: cur.filter((d) => d !== id) };
    return { ...p, flash: DIRECTIONS.filter((d) => d === id || cur.includes(d)) };
  });

  return (
    <Sheet visible={visible} onClose={onClose} title="Study options" footer={footer} maxHeight="88%">
            {/* Words, sentences or both (the owner, 2026-09-28). Decides the
                due cards dealt as well as the new ones, and the badge counts
                the same kinds. Sentences are how his own decks are built and
                the unit a word is actually used in (§26). */}
            <View style={{ marginBottom: 18 }}>
              <SectionLabel>Study</SectionLabel>
              <List>
                {[["words", "Words"], ["sentences", "Sentences"]].map(([id, name]) => (
                  <Row key={id} testID={`kind-${id}`} onPress={() => toggleKind(id)}>
                    <Tick on={kinds.includes(id)} />
                    <RowText title={name} bold={false} />
                  </Row>
                ))}
              </List>
            </View>
            <View style={{ marginBottom: 18 }}>
              <SectionLabel>Front of the card</SectionLabel>
              <List>
                {FRONTS.map(([id, name, sub]) => (
                  <Row key={id} testID={`flash-${id}`} onPress={() => toggleFront(id)}>
                    <Tick on={fronts.includes(id)} />
                    <RowText title={name} sub={sub} bold={false} />
                  </Row>
                ))}
              </List>
            </View>
            <View style={{ marginBottom: 18 }}>
              <SectionLabel>New words a day</SectionLabel>
              <Stepper testID="new-per-day" label="New words a day" min={0} max={99}
                       value={st.newPerDay === undefined ? QUEUE_DEFAULTS.newPerDay : st.newPerDay}
                       onChange={(n) => update((p) => ({ ...p, newPerDay: n }))} />
            </View>
            {/* "Voice — As recorded / One voice" stood here until 2026-09-29.
                It existed because the collection's recordings came from four
                readers (§27); since every curriculum word and every pooled
                sentence is one bought voice, the choice had nothing left to
                choose, and the owner could not tell what it did — so it went. */}

            {/* Where new cards come from. What is due is not here: it is in
                every session whatever is ticked (studyCards), so no tick can
                leave the badge promising cards the pile will not deal — which
                is what "Due today" and "Trouble words" as sets did (2026-09-28).
                Your path is the default: the units reached so far. */}
            <View style={{ marginBottom: 18 }}>
              <SectionLabel>Review</SectionLabel>
              <List>
                <Row testID="set-path" onPress={() => toggle("__path__")}>
                  <Tick on={st.sets.includes("__path__")} />
                  <RowText title="Personal review" bold={false} />
                </Row>
              </List>
              {/* Which met cards make the review up once the due ones are
                  dealt: the most faded (recent words come round most), or the
                  route from its first lesson forward — for the learner whose
                  early words were never met from this side (the owner,
                  2026-11-02: "the option to build up or continue where they
                  were struggling"). */}
              <Choice testID="review-order" style={{ marginTop: 10 }}
                      value={st.reviewOrder === "path" ? "path" : "weak"}
                      options={[{ id: "weak", name: "Where you struggle" }, { id: "path", name: "From the start" }]}
                      onPick={(id) => update((p) => ({ ...p, reviewOrder: id }))} />
            </View>
            <LowPriorityList />

            {/* Only listed when there is one. An empty section headed "Your
                decks" over a line explaining how to get some is the app
                advertising a feature on the screen where somebody is trying to
                start studying; importing lives in Settings now. */}
            {(st.decks || []).length ? (
              <View style={{ marginBottom: 18 }}>
                <SectionLabel>Your decks</SectionLabel>
                <List>
                  {(st.decks || []).map((d) => (
                    <Row key={d.id}
                         onPress={() => toggle("deck:" + d.id)}>
                      <Tick on={st.sets.includes("deck:" + d.id)} />
                      <RowText title={d.name} sub={d.cards.length + " cards"} bold={false} />
                      <Btn kind="ghost" label="Remove" onPress={() => removeDeck(d)}
                           style={{ paddingHorizontal: 8 }} />
                    </Row>
                  ))}
                </List>
              </View>
            ) : null}

            {STAGES.map((s, i) => {
              const units = [s.core].concat(s.branches).filter((u) => unitUnlocked(st, u));
              if (!units.length) return null;
              const on = units.every((u) => st.sets.includes(u.id));
              return (
                <View key={s.core.id} style={{ marginBottom: 18 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8,
                                 marginBottom: 8 }}>
                    <SectionLabel style={{ flex: 1, marginBottom: 0 }}>{`Chapter ${s.n || i + 1}`}</SectionLabel>
                    <Btn kind="ghost" label={on ? "Deselect chapter" : "Select chapter"}
                         onPress={() => update((p) => {
                           const ids = units.map((u) => u.id);
                           return { ...p, sets: on
                             ? p.sets.filter((x) => !ids.includes(x))
                             : p.sets.concat(ids.filter((x) => !p.sets.includes(x))) };
                         })} />
                  </View>
                  <List>
                    {units.map((u) => (
                      <Row key={u.id}
                           onPress={() => toggle(u.id)}>
                        <Tick on={st.sets.includes(u.id)} />
                        <RowText title={u.name} sub={u.w.length + " words"} bold={false} />
                      </Row>
                    ))}
                  </List>
                </View>
              );
            })}
    </Sheet>
  );
}
