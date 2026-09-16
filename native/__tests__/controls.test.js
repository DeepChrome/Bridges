/* What a control looks like, which is the other half of §20a's rule: native has
 * no visual suite, so a contract that lives in appearance is pinned in the
 * render tree instead.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Btn } from "../src/ui";
import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import Study from "../src/screens/Study";

const flat = (s) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : (s || {}));
const box = (testID) => flat(screen.getByTestId(testID).props.style);

describe("a button that cannot be pressed", () => {
  /* A disabled control takes the neutral tone so it reads as "not yet" rather
     than as a live primary with pale text — but a ghost has no box to keep, and
     giving it one drew a grey panel where there had been bare text. Study's
     "◀ Previous" sat in a box on the first card, beside a boxless "Skip ▶". */
  it("keeps a ghost boxless and only dims its text", async () => {
    await render(<Btn kind="ghost" label="Previous" testID="g" disabled onPress={() => {}} />);
    const s = box("g");
    expect(s.backgroundColor).toBe("transparent");
    expect(s.borderColor).toBe("transparent");
  });

  /* A `link` is a ghost that has nothing around it to mark it as a control, so
     the one thing carrying that job is its colour. Losing it would make the
     runner's only hint invisible again, and nothing else would fail. */
  it("keeps a link's colour distinct from a ghost's, boxless in both cases", async () => {
    // Both in one tree: `screen` follows the latest render, and querying the
    // two separately is what made this fail on a control that is plainly there.
    const view = await render(
      <>
        <Btn kind="ghost" label="Ghost" testID="g2" onPress={() => {}} />
        <Btn kind="link" label="Link" testID="l" onPress={() => {}} />
      </>
    );
    // Still no box — the colour is the whole of the difference.
    for (const id of ["g2", "l"]) {
      expect(flat(view.getByTestId(id).props.style).backgroundColor).toBe("transparent");
      expect(flat(view.getByTestId(id).props.style).borderColor).toBe("transparent");
    }
    const grey = flat(view.getByText("Ghost").props.style).color;
    const brand = flat(view.getByText("Link").props.style).color;
    expect(brand).not.toBe(grey);
  });

  it("still gives a filled button the neutral fill, so it stops looking live", async () => {
    await render(<Btn kind="pri" label="Continue" testID="p" disabled onPress={() => {}} />);
    const s = box("p");
    expect(s.backgroundColor).not.toBe("transparent");
    // The brand fill is gone: a disabled primary that keeps it reads as pressable.
    const live = await render(<Btn kind="pri" label="Continue" testID="p2" onPress={() => {}} />);
    expect(box("p2").backgroundColor).not.toBe(s.backgroundColor);
    live.unmount();
  });
});

describe("a control that must not scroll away", () => {
  /* Found by reading a walkthrough shot (§31): the back of «этот» carries a
     four-line sense, two example pairs and three sentences, and the four grade
     buttons sat under all of it. The one thing the screen is *for* could only
     be reached by scrolling past everything it shows — the same bug the quiz
     builder's Start had, which is why `Screen footer` exists. */
  it("keeps Study's grade buttons off the scroll", async () => {
    await AsyncStorage.setItem("rb.accounts", JSON.stringify({
      list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
    await AsyncStorage.setItem("rb.state.p1", JSON.stringify({
      v: 6, seen: { "я": { recognise: { dueAt: Date.now() - 1000, s: 0, d: 0, state: 0, steps: 0, reps: 0, lapses: 0 } } },
      trouble: {}, pinned: [], sets: ["__due__"], drills: {}, unit: {}, watched: {},
      speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0,
      flash: ["recognise"], newPerDay: 15, reviewsPerDay: 200, learnAhead: 20,
    }));
    const view = await render(<SessionProvider><Study /></SessionProvider>);

    // Turn the card over: the grade buttons only exist once there is an answer.
    fireEvent.press(await view.findByText("Show"));
    const footer = await view.findByTestId("screen-footer");
    expect(footer).toBeTruthy();
    /* The assertion that matters is *where*: inside `screen-body` is inside the
       ScrollView, which is what put them below the fold. */
    for (const id of ["grade-1", "grade-2", "grade-3", "grade-4", "undo"]) {
      expect(within(footer).getByTestId(id)).toBeTruthy();
      expect(within(view.getByTestId("screen-body")).queryByTestId(id)).toBeNull();
    }
    // Hand-rolled Pressables, so the role is theirs to carry (a11y.test.js).
    expect(within(footer).getByTestId("grade-3").props.accessibilityRole).toBe("button");
    await flushState();
  });
});
