/* How far a video skips, and the two ways to ask for it besides the buttons
   (the owner, 2026-11-18): a setting of 5 / 10 / 20 / 30 seconds, read by the
   overlay's buttons, a double tap on either half of the picture, and the
   headset keys (remote.test.js); the picture flashes the amount on the half
   that was tapped. */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider, useSession } from "../src/session";
import { flushState } from "../src/store";
import { VideoOverlay } from "../src/screens/Video";
import { Settings } from "../src/screens/Settings";
import { skipSeconds, skipMsOf, SKIP_SECONDS, DEFAULT_SKIP } from "../src/video";

function WhenReady({ children }) { return useSession().ready ? children : null; }
async function withProfile(ui, state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "yuri", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({
    v: 10, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
    speech: { attempts: [], tagCounts: {} }, streak: 0, dev: false, flash: ["recognise"], ...state }));
  return render(<SessionProvider><WhenReady>{ui}</WhenReady></SessionProvider>);
}

beforeEach(async () => { await flushState(); await AsyncStorage.clear(); });
afterEach(async () => { await flushState(); });

describe("the skip setting", () => {
  it("is one of four values, and the default otherwise", () => {
    expect(SKIP_SECONDS).toEqual([5, 10, 20, 30]);
    expect(skipSeconds({})).toBe(DEFAULT_SKIP);
    expect(skipSeconds({ skip: 20 })).toBe(20);
    expect(skipSeconds({ skip: 7 })).toBe(DEFAULT_SKIP);
    expect(skipMsOf({ skip: 30 })).toBe(30000);
  });

  it("is set in Settings and saved with the profile", async () => {
    await withProfile(<Settings visible onClose={() => {}} onLab={() => {}} onTour={() => {}}
                                onCredits={() => {}} onFeedback={() => {}} />);
    // A row opening its choices (ui.js OptionRow, 2026-11-19).
    await act(async () => { fireEvent.press(await screen.findByTestId("skip-choice")); });
    await act(async () => { fireEvent.press(await screen.findByTestId("skip-choice-opt-20")); });
    await flushState();
    expect((await global.__db.saved("p1")).skip).toBe(20);
  });
});

describe("the overlay", () => {
  const mount = async (skipMs) => {
    const skip = jest.fn();
    const player = { current: { skip, toggle: jest.fn(), rate: jest.fn(), seekTo: jest.fn() } };
    const r = await render(<VideoOverlay player={player} playing rate={1} onRate={() => {}} length={100000}
                                         full={false} onFull={() => {}} onCog={() => {}} skipMs={skipMs} />);
    await act(async () => {
      fireEvent(r.getByTestId("overlay-touch"), "layout", { nativeEvent: { layout: { width: 300 } } });
    });
    return { r, skip };
  };
  const tap = (r, x) => act(async () => { fireEvent.press(r.getByTestId("overlay-touch"), { nativeEvent: { locationX: x } }); });

  it("labels its buttons with the set skip and skips by it", async () => {
    const { r, skip } = await mount(20000);
    expect(r.getByText("−20s")).toBeTruthy();
    expect(r.getByText("+20s")).toBeTruthy();
    await act(async () => { fireEvent.press(r.getByTestId("overlay-back5")); });
    expect(skip).toHaveBeenLastCalledWith(-20000, 0, 0);
  });

  it("a double tap on the left goes back, on the right forward, with a flash; a single tap does not", async () => {
    const { r, skip } = await mount(10000);
    await tap(r, 40);
    expect(skip).not.toHaveBeenCalled();
    await tap(r, 40);
    expect(skip).toHaveBeenLastCalledWith(-10000, 0, 0);
    expect(r.getByTestId("overlay-flash")).toHaveTextContent("−10s");
    await tap(r, 260);
    await tap(r, 260);
    expect(skip).toHaveBeenLastCalledWith(10000, 0, 0);
    expect(r.getByTestId("overlay-flash")).toHaveTextContent("+10s");
    expect(skip).toHaveBeenCalledTimes(2);
  });

  it("two taps on different halves are two single taps", async () => {
    const { r, skip } = await mount(10000);
    await tap(r, 40);
    await tap(r, 260);
    expect(skip).not.toHaveBeenCalled();
  });
});
