/* Settings the owner asked for on 2026-09-07: the right-answer sound is a choice
   of ten, Russian is read at one of three speeds and a second press slows it, the
   on-screen Russian keyboard, the home button, and flashcards with nothing ticked.

   Own file, per the timeout note in screens.test.js. */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import You from "../src/screens/You";
import Study from "../src/screens/Study";
import { Speaker } from "../src/ui";
import { RuInput, RuKeyboard, ROWS, KEY_H } from "../src/keyboard";
import { space } from "../src/theme";
import { configureAudio, audioPrefs, cue, say, CUE_NAMES, SPEEDS } from "../src/audio";

const nav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const base = {
  v: 6, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0,
};
async function withProfile(ui, state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
  return await render(<SessionProvider>{ui}</SessionProvider>);
}
async function saved() { await flushState(); return (await global.__db.saved("p1")); }

beforeEach(async () => {
  await flushState(); await AsyncStorage.clear(); jest.clearAllMocks();
  global.__played = []; global.__spoke = []; global.__spokeOpts = [];
  configureAudio({ speed: "normal", cue: "bell" });
});
afterEach(async () => { await flushState(); });

describe("audio preferences", () => {
  it("has ten right-answer cues and plays the chosen one", () => {
    expect(CUE_NAMES).toHaveLength(10);
    expect(new Set(CUE_NAMES.map((c) => c.id)).size).toBe(10);
    configureAudio({ cue: "harp" });
    expect(audioPrefs().cue).toBe("harp");
    expect(cue("right")).toBe(true);
    configureAudio({ cue: "not-a-cue" });
    expect(audioPrefs().cue).toBe("harp");            // an unknown choice changes nothing
    expect(cue("wrong")).toBe(true);
  });

  it("reads at the chosen speed, and a second press in a row plays slower", async () => {
    expect(SPEEDS.map((s) => s.id)).toEqual(["normal", "slower", "slowest"]);
    // A word with no recording goes to the device voice, whose rate is visible.
    await say("несуществующееслово");
    await say("несуществующееслово");
    await say("несуществующееслово");
    const rates = global.__spokeOpts.map((o) => o.rate);
    expect(rates[0]).toBeCloseTo(0.9);
    expect(rates[1]).toBeCloseTo(0.9 * 0.75);
    expect(rates[2]).toBeCloseTo(0.9);
    configureAudio({ speed: "slowest" });
    await say("другоеслово");
    expect(global.__spokeOpts[3].rate).toBeCloseTo(0.9 * 0.65);
    // The runner reading an answer out neither slows nor counts as a press.
    await say("другоеслово", { repeat: false });
    expect(global.__spokeOpts[4].rate).toBeCloseTo(0.9 * 0.65);
  });

  it("offers the speed and the sound in settings, and remembers the choice", async () => {
    await withProfile(<You navigation={nav} />);
    await act(async () => { fireEvent.press(await screen.findByText("Settings")); });
    await act(async () => { fireEvent.press(screen.getByText("Slowest")); });
    await act(async () => { fireEvent.press(screen.getByText("Kalimba")); });
    const st = await saved();
    expect(st.speed).toBe("slowest");
    expect(st.cue).toBe("kalimba");
  });
});

describe("the on-screen keyboard", () => {
  it("is off until the setting or the toggle turns it on, then types Cyrillic", async () => {
    let value = "";
    const Harness = () => {
      const [v, setV] = React.useState("");
      value = v;
      return <RuInput value={v} onChangeText={setV} onSubmit={() => {}} testID="in" />;
    };
    await withProfile(<Harness />);
    await screen.findByTestId("in");
    expect(screen.queryByTestId("ru-keyboard")).toBeNull();
    await act(async () => { fireEvent.press(screen.getByTestId("osk-toggle")); });
    expect(screen.getByTestId("ru-keyboard")).toBeTruthy();
    expect(ROWS.join("")).toHaveLength(33);                 // every letter of the alphabet
    await act(async () => { fireEvent.press(screen.getByText("д")); });
    await act(async () => { fireEvent.press(screen.getByText("а")); });
    await act(async () => { fireEvent.press(screen.getByTestId("key-space")); });
    await act(async () => { fireEvent.press(screen.getByText("я")); });
    await act(async () => { fireEvent.press(screen.getByTestId("key-backspace")); });
    expect(value).toBe("да ");
    expect(screen.getByTestId("in").props.showSoftInputOnFocus).toBe(false);
  });

  it("starts up when the setting is on", async () => {
    const Harness = () => <RuInput value="" onChangeText={() => {}} testID="in" />;
    await withProfile(<Harness />, { osk: true });
    expect(await screen.findByTestId("ru-keyboard")).toBeTruthy();
  });

  /* Rule 20.12's 44 px, on every key and not only the letters — they were 42
     (ROADMAP P11.9). Nothing on the screen says how big a key is, so the size
     is asserted in the render tree (§20a). The width is `flex`, so a row cannot
     overflow; what is worth pinning is that it stays a usable width at the
     390 px design size. */
  it("draws every key at the 44 px minimum, and the widest row still fits 390", async () => {
    await render(<RuKeyboard onKey={() => {}} onBackspace={() => {}} onSubmit={() => {}} />);
    const flat = (s) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : (s || {}));
    // Every key, not only the letters: backspace, space and check are keys too.
    const keys = screen.getAllByRole("button");
    expect(keys.length).toBe(ROWS.join("").length + 3);
    expect(KEY_H).toBeGreaterThanOrEqual(44);
    for (const k of keys) {
      const s = flat(k.props.style);
      expect(s.height).toBeGreaterThanOrEqual(44);
      expect(s.flex).toBeGreaterThan(0);        // width is shared, so a row cannot overflow
    }
    for (const id of ["key-backspace", "key-space", "key-submit"]) {
      expect(flat(screen.getByTestId(id).props.style).height).toBeGreaterThanOrEqual(44);
    }
    const widest = Math.max(...ROWS.map((r) => r.length));
    const each = (390 - space.pad * 2 - widest * 3) / widest;   // 3 px of margin a key
    expect(each).toBeGreaterThan(24);                           // WCAG 2.5.8's floor
  });
});

describe("flashcards", () => {
  it("show nothing when no set is ticked, rather than a set that cannot be switched off", async () => {
    await withProfile(<Study />);
    expect(await screen.findByText("Pick a set to practice.")).toBeTruthy();
    // One thought, one control: no summary row of a selection that is empty,
    // and no card to grade.
    expect(screen.queryByText("Change")).toBeNull();
    expect(screen.queryByText("Show")).toBeNull();
  });
});

describe("Speaker", () => {
  it("passes a press through to playback", async () => {
    await withProfile(<Speaker text="несуществующееслово" />);
    const btn = await screen.findByTestId("speaker-tts");
    await act(async () => { fireEvent.press(btn); });
    expect(global.__spoke).toHaveLength(1);
  });
});
