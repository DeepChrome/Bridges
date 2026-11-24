/* The Study options sheet: a list of categories, each opening its own choices
 * (ui.js OptionRow — the owner, 2026-11-19: *"All of our options menus are
 * ugly… a more standard form where the user selects the category they want to
 * customize and then a submenu pops out with the options. Similar to an Excel
 * filter… For flash cards for example, let's just have fewer options
 * perhaps"*; and *"hide all the chapters in the flashcards settings and only
 * reveal them if the person selects that they want to customize their review
 * rather than a personalized review. The personalized will always be the
 * default"*).
 *
 * Six rows at most: Review (Personalized · Custom), and under Custom the
 * chapters and the decks; Front; Cards; New words a day; Order; Low priority
 * while anything is set aside. The chapters used to be thirty-four rows of
 * units with a Select-chapter button each, on every open. */

import React, { useState } from "react";
import { View, Alert } from "react-native";
import { useSession } from "./session";
import { useTheme } from "./theme";
import { Btn, List, Row, Sheet, Stepper, RowText, ActionChip, Text, OptionRow, PickSheet } from "./ui";
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
 * card saying so. The names here say what you will see. */
export const FRONTS = [
  ["recognise", "Russian", "You give the meaning"],
  ["produce", "English", "You give the Russian"],
  ["listen", "Sound only", "You give what you heard"],
];
const KINDS = [["words", "Words"], ["sentences", "Sentences"]];
const ORDERS = [{ id: "weak", name: "Where you struggle", sub: "Most faded first" },
                { id: "path", name: "From the start", sub: "The route from its first lesson" }];
/* What the review leans on, once the due cards are dealt (the owner,
   2026-11-23: "the user can select between personal (anything they've been
   exposed to) versus common"; core/queue.js commonness). */
const FOCUSES = [{ id: "personal", name: "Personal", sub: "Everything you have met" },
                 { id: "common", name: "Common words", sub: "The most used words first" }];
const REVIEWS = [{ id: "personal", name: "Personalized", sub: "Your path, where you are" },
                 { id: "custom", name: "Custom", sub: "Chapters or decks you choose" }];

/* The source ids that are not sources (old ids core/state.js v10 strips). */
const isSource = (id) => !["__due__", "__trouble__", "__sentences__"].includes(id);

/* The cards set aside as low priority (Study's card, data.js lowPriority),
   newest first, each with the way back into the rotation (the owner,
   2026-11-06). A row opening its list, and only while there is something on
   it. Its own component, so the sheet it opens redraws (§30be). */
function LowPriorityRow({ last, at }) {
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
    <>
      <Row testID="low-priority-open" onPress={() => setOpen(true)} last={last} at={at}>
        <RowText title="Low priority" bold={false} />
        <Text style={{ color: t.ink3, fontSize: 16 }}>{`${words.length} ${words.length === 1 ? "card" : "cards"}`}</Text>
        <Text style={{ color: t.ink3, fontSize: 18, marginLeft: 2 }}>›</Text>
      </Row>
      {open ? (
        <PickSheet testID="low-priority-sheet" title="Low priority" onClose={() => setOpen(false)}>
          <List>
            {words.map((w) => {
              const i = exactIdx(w);
              return (
                <Row key={w} testID={`low-${w}`}>
                  <RowText title={i >= 0 ? L[i].w : w} sub={i >= 0 ? firstSense(L[i]) : undefined} bold={false} />
                  <ActionChip label="Restore" testID={`restore-${w}`} onPress={() => restore(w)} />
                </Row>
              );
            })}
          </List>
        </PickSheet>
      ) : null}
    </>
  );
}

export function SetPicker({ visible, onClose }) {
  const { st, update } = useSession();
  const sources = (st.sets || []).filter(isSource);
  /* Personalized is the path (or nothing chosen); Custom is any chapter or
     deck. Choosing Custom with nothing picked yet keeps the rows showing
     (`wantCustom`); read off the sets otherwise, since the sheet is mounted
     before the profile arrives. */
  const [wantCustom, setWantCustom] = useState(false);
  const custom = wantCustom || (sources.length > 0 && !sources.includes("__path__"));
  const review = custom ? "custom" : "personal";
  const pickReview = (id) => {
    setWantCustom(id === "custom");
    update((p) => ({ ...p, sets: id === "custom" ? p.sets.filter((x) => x !== "__path__")
      : p.sets.filter((x) => !isSource(x)).concat(["__path__"]) }));
  };

  /* Chapters whole: a chapter is ticked when every unlocked unit of it is. */
  const chapters = STAGES.map((s, k) => ({ s, k, units: [s.core].concat(s.branches).filter((u) => unitUnlocked(st, u)) }))
    .filter((c) => c.units.length);
  const chapterOn = (c) => c.units.every((u) => st.sets.includes(u.id));
  const chosenChapters = chapters.filter(chapterOn).map((c) => String(c.k));
  const pickChapters = (ids) => update((p) => {
    let sets = p.sets.filter((x) => x === "__path__" || x.startsWith("deck:") || !isSource(x));
    for (const c of chapters) if (ids.includes(String(c.k))) sets = sets.concat(c.units.map((u) => u.id));
    return { ...p, sets };
  });
  const decks = st.decks || [];
  const pickDecks = (ids) => update((p) => ({
    ...p, sets: p.sets.filter((x) => !x.startsWith("deck:")).concat(ids.map((id) => "deck:" + id)) }));
  const removeDeck = (d) => Alert.alert(
    "Remove deck", `Remove “${d.name}”? Its cards' review history stays.`,
    [{ text: "Cancel", style: "cancel" },
     { text: "Remove", style: "destructive",
       onPress: () => update((p) => ({ ...p, decks: (p.decks || []).filter((x) => x.id !== d.id),
                                       sets: p.sets.filter((x) => x !== "deck:" + d.id) })) }]);

  /* Words, sentences or both; the last cannot be unticked (§30ac's rule). */
  const kinds = kindsOf(st.cardKinds);
  const pickKinds = (ids) => update((p) => ({ ...p, cardKinds: CARD_KINDS.filter((k) => ids.includes(k)) }));

  /* How the cards are asked — one way, both ways, or audio only (the owner,
     2026-09-23). A word is one card, so a front chooses nothing about *which*
     cards are dealt, only how each is met; two fronts ticked take turns. */
  const fronts = st.flash || DEFAULT_FRONTS;
  const pickFronts = (ids) => update((p) => ({ ...p, flash: DIRECTIONS.filter((d) => ids.includes(d)) }));

  const newPerDay = st.newPerDay === undefined ? QUEUE_DEFAULTS.newPerDay : st.newPerDay;
  const footer = <Btn block kind="pri" label="Done" style={{ marginTop: 8 }} onPress={onClose} />;

  return (
    <Sheet visible={visible} onClose={onClose} title="Study options" footer={footer} maxHeight="88%">
      <List>
        <OptionRow testID="set-path" title="Review" value={review} options={REVIEWS} onPick={pickReview} />
        {custom ? (
          <OptionRow testID="set-chapters" title="Chapters" multi value={chosenChapters}
                     options={chapters.map((c) => ({ id: String(c.k), name: `Chapter ${c.s.n || c.k + 1}`,
                                                     sub: c.s.title || undefined }))}
                     valueText={chosenChapters.length ? chosenChapters.map((k) => Number(k) + 1).join(", ") : "None"}
                     onPick={pickChapters} />
        ) : null}
        {custom && decks.length ? (
          <OptionRow testID="set-decks" title="Decks" multi
                     value={decks.filter((d) => st.sets.includes("deck:" + d.id)).map((d) => d.id)}
                     options={decks.map((d) => ({ id: d.id, name: d.name, note: `${d.cards.length} cards` }))}
                     valueText={decks.filter((d) => st.sets.includes("deck:" + d.id)).map((d) => d.name).join(", ") || "None"}
                     onPick={pickDecks}>
            {/* Removing a deck, under its ticks (the owner, 2026-09-22: no export). */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {decks.map((d) => (
                <ActionChip key={d.id} testID={`deck-remove-${d.id}`} label={`Remove ${d.name}`} onPress={() => removeDeck(d)} />
              ))}
            </View>
          </OptionRow>
        ) : null}
        <OptionRow testID="flash" title="Front" multi minOne value={fronts}
                   options={FRONTS.map(([id, name, sub]) => ({ id, name, sub }))} onPick={pickFronts} />
        <OptionRow testID="kind" title="Cards" multi minOne value={kinds}
                   options={KINDS.map(([id, name]) => ({ id, name }))} onPick={pickKinds} />
        <OptionRow testID="new-per-day-row" title="New words a day" valueText={String(newPerDay)} sheetTitle="New words a day">
          <View style={{ alignItems: "center", paddingVertical: 8 }}>
            <Stepper testID="new-per-day" label="New words a day" min={0} max={99} value={newPerDay}
                     onChange={(n) => update((p) => ({ ...p, newPerDay: n }))} />
          </View>
        </OptionRow>
        {/* Which met cards make the review up once the due ones are dealt:
            the most faded, or the route from its first lesson forward (the
            owner, 2026-11-02). */}
        <OptionRow testID="review-focus" title="Focus" value={st.reviewFocus === "common" ? "common" : "personal"}
                   options={FOCUSES} onPick={(id) => update((p) => ({ ...p, reviewFocus: id }))} />
        <OptionRow testID="review-order" title="Order" value={st.reviewOrder === "path" ? "path" : "weak"}
                   options={ORDERS} onPick={(id) => update((p) => ({ ...p, reviewOrder: id }))} />
        <LowPriorityRow />
      </List>
      <View style={{ height: 8 }} />
    </Sheet>
  );
}
