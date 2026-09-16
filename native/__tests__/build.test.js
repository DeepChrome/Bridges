/* The backward build-up drill (core/buildup.js, activities/Build.js).
 *
 * The splitting is tested in core.test.mjs. What is tested here is the thing
 * a learner meets: that the fragment they hear is the fragment on the screen,
 * that it grows from the end, that hearing it again costs nothing, and that a
 * mouth drill puts no word into the scheduler.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner } from "../src/screens/Run";
import { probeVoices } from "../src/audio";
import { buildupDrill, buildup } from "@core/buildup";

const WORD = { ru: "понима́ю", en: "I understand" };
const steps = buildupDrill([WORD], 1);

/* What reaches the voice: the stress marks come off on the way to the speech
   engine (audio.js), which never sees a combining accent. The screen keeps
   them, so the two are compared through this. */
const spokenForm = (s) => s.normalize("NFD").replace(/[̀́]/g, "").normalize("NFC");

const accounts = { list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" };

async function withBuild(onFinish = jest.fn()) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify(accounts));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({
    v: 6, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {},
    speech: { attempts: [], tagCounts: {} }, xp: 0, streak: 0,
  }));
  const r = await render(
    <SessionProvider><Runner steps={steps} recycle={false} onFinish={onFinish} /></SessionProvider>,
  );
  return r;
}

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
  jest.clearAllMocks();
  global.__spoke = [];
  global.__played = [];
  await probeVoices();
});
afterEach(async () => { await flushState(); });

describe("building a word from its end", () => {
  it("ships a drill whose fragments grow backwards", () => {
    expect(steps).toHaveLength(1);
    const f = buildup(WORD.ru);
    expect(f[0]).toBe("ю");
    expect(f[f.length - 1]).toBe(WORD.ru);
    expect(steps[0].steps).toEqual(f);
  });

  it("shows the last syllable first and says it out loud", async () => {
    await withBuild();
    expect(await screen.findByTestId("build-fragment")).toHaveTextContent("ю");
    expect(screen.getByTestId("build-meaning")).toHaveTextContent("I understand");
    // Spoken on arrival: this is a listen-and-repeat drill, so the model comes
    // first and the learner is never asked to guess a pronunciation.
    await waitFor(() => expect(global.__spoke.length).toBeGreaterThan(0));
    expect(global.__spoke[global.__spoke.length - 1]).toContain("ю");
  });

  it("adds a syllable to the front on each press, and says the new fragment", async () => {
    await withBuild();
    await screen.findByTestId("build-fragment");
    const want = buildup(WORD.ru);
    for (let k = 1; k < want.length; k++) {
      await act(async () => { fireEvent.press(screen.getByTestId("build-next")); });
      expect(screen.getByTestId("build-fragment")).toHaveTextContent(want[k]);
      await waitFor(() => expect(global.__spoke[global.__spoke.length - 1]).toBe(spokenForm(want[k])));
    }
    // The last fragment is the whole word, and the button says so.
    expect(screen.getByTestId("build-fragment")).toHaveTextContent(WORD.ru);
  });

  it("replays as often as asked, and does not count it", async () => {
    await withBuild();
    await screen.findByTestId("build-fragment");
    const before = global.__spoke.length;
    for (let k = 0; k < 4; k++) {
      await act(async () => { fireEvent.press(screen.getByTestId("build-play")); });
    }
    expect(global.__spoke.length).toBe(before + 4);
    // Still on the first fragment: hearing it again is not progress.
    expect(screen.getByTestId("build-fragment")).toHaveTextContent("ю");
  });

  /* A mouth drill is not vocabulary. The Pair drill made this rule (§30o) and
     it holds here: nothing the learner says here should tell the scheduler
     they know «понимаю». */
  it("finishes without putting a single word into the schedule", async () => {
    const onFinish = jest.fn();
    await withBuild(onFinish);
    await screen.findByTestId("build-fragment");
    const want = buildup(WORD.ru);
    for (let k = 1; k < want.length; k++) {
      await act(async () => { fireEvent.press(screen.getByTestId("build-next")); });
    }
    await act(async () => { fireEvent.press(screen.getByTestId("build-next")); });
    await act(async () => { fireEvent.press(await screen.findByText("Continue")); });
    expect(onFinish).toHaveBeenCalled();
    await flushState();
    const saved = await global.__db.saved("p1");
    expect(Object.keys((saved && saved.seen) || {})).toEqual([]);
  });
});
