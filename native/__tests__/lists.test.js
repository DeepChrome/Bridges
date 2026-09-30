/* Where a list's hairlines go.
 *
 * A visual contract with no words on the screen to assert against, which is the
 * case §20a says to pin in the render tree instead: a divider missing from the
 * middle of a group is invisible to every other suite, and shipped that way
 * (ROADMAP P11.9).
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { Text } from "react-native";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { List, Row } from "../src/ui";
import You from "../src/screens/You";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const base = {
  v: 8, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0,
};
async function withProfile(ui, state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider>{ui}</SessionProvider>);
}

/* Pressable resolves its style function before the host View sees it, so the
   row's own border is readable straight off the node. */
const flat = (s) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : (s || {}));
const border = (testID) => flat(screen.getByTestId(testID).props.style).borderBottomWidth;

/* The row a label sits in: walk out of the text until the border turns up. */
function rowAround(label) {
  let node = screen.getByText(label);
  while (node) {
    const s = flat(node.props.style);
    if (s.borderBottomColor !== undefined) return s.borderBottomWidth;
    node = node.parent;
  }
  throw new Error(`no row around “${label}”`);
}

beforeEach(async () => {
  await flushState(); await AsyncStorage.clear(); jest.clearAllMocks();
});
afterEach(async () => { await flushState(); });

describe("a list's hairlines", () => {
  it("separates every row but the last, whatever the call site claims", async () => {
    // `last` on the *first* of two rows is the stale-prop bug in miniature: the
    // list is what knows, so the call site cannot lose a divider by saying so.
    await render(
      <List>
        <Row testID="r1" last><Text>one</Text></Row>
        <Row testID="r2"><Text>two</Text></Row>
      </List>
    );
    expect(border("r1")).toBe(1);
    expect(border("r2")).toBe(0);
  });

  it("gives the hairline back when a trailing row renders nothing", async () => {
    const Group = ({ extra }) => (
      <List>
        <Row testID="r1"><Text>one</Text></Row>
        <Row testID="r2"><Text>two</Text></Row>
        {extra ? <Row testID="r3"><Text>three</Text></Row> : null}
      </List>
    );
    const view = await render(<Group extra />);
    expect(border("r2")).toBe(1);
    expect(border("r3")).toBe(0);
    await act(async () => { view.rerender(<Group extra={false} />); });
    expect(border("r2")).toBe(0);
    expect(screen.queryByTestId("r3")).toBeNull();
  });

  /* The instance that shipped: "Show the tour" was inserted under
     "Right-answer sound", which still carried the last row's `last={!st.dev}`,
     so with developer mode off the group lost a hairline in its middle. */
  it("draws Settings as one unbroken group, with developer mode off and on", async () => {
    // Seeded on rather than shipped on: developer mode has been off by
    // default since 2026-09-23 (rule 20.9). With it on the group ends at STT
    // Lab; the shipped bug was the other state, where the tour row had taken
    // the last place and the sound row still carried it. Both are driven here.
    await withProfile(<You navigation={nav} />, { dev: true });
    await act(async () => { fireEvent.press(await screen.findByText("Settings")); });
    /* "Cards: recognise" led this list until the flashcards' directions moved
       to the Study picker (§30ai); "Reviews a day" after that, until the
       scheduler's settings came down to new words a day (2026-09-29). */
    const group = ["New words a day", "On-screen Russian keyboard", "Reading speed",
                   "Right-answer sound", "Show the tour", "Developer mode", "STT Lab"];
    for (const label of group.slice(0, -1)) expect(rowAround(label)).toBe(1);
    expect(rowAround("STT Lab")).toBe(0);

    await act(async () => {
      fireEvent(screen.getByTestId("dev-switch"), "valueChange", false);
    });
    expect(screen.queryByText("STT Lab")).toBeNull();
    for (const label of group.slice(0, -2)) expect(rowAround(label)).toBe(1);
    expect(rowAround("Developer mode")).toBe(0);
  });
});
