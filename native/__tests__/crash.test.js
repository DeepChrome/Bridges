/* Never a white screen, and a crash that happened away from the desk is
 * recoverable (docs/PLAYBOOK.md Phase 6).
 *
 * There was no error boundary anywhere in the app — measured 2026-09-16 — so
 * a bug in any render path unmounted the whole tree and the learner's only
 * information was that it closed.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { Text as RNText } from "react-native";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ErrorBoundary } from "../src/boundary";
import { addCrash, crashEntry, readCrashes, recordCrash, clearCrashes, installCrashHandler, KEEP }
  from "../src/crash";
import { crashText } from "../src/backup";

/* A component that throws on render, switchable, so "try again" can be shown
   to work rather than asserted about. */
let willThrow = true;
function Boom() {
  if (willThrow) throw new Error("the paradigm table is not a table");
  return <RNText>fine now</RNText>;
}

/* React logs a caught render error to console.error and the noise buries a
   real failure. Silenced for this file only, and restored after. */
let quiet;
beforeAll(() => { quiet = jest.spyOn(console, "error").mockImplementation(() => {}); });
afterAll(() => quiet.mockRestore());

beforeEach(async () => { await AsyncStorage.clear(); willThrow = true; jest.clearAllMocks(); });

describe("when a screen throws", () => {
  it("draws a way out instead of unmounting the app", async () => {
    const record = jest.fn();
    const onCrash = jest.fn();
    /* `await render(...)` and the returned view, not the `screen` global: this
       project's RNTL setup only populates `screen` for an awaited render. */
    const view = await render(
      <ErrorBoundary record={record} onCrash={onCrash}>
        <Boom />
      </ErrorBoundary>
    );
    expect(await view.findByTestId("broke-title")).toBeTruthy();
    /* The message is on screen: a failure may say what it is (rule 20.7's
       third exemption), and a learner who can read it can hand it over. */
    expect(view.getByTestId("broke-what")).toHaveTextContent(/paradigm table/);
    expect(record).toHaveBeenCalled();
    /* The save is flushed at the moment of the crash — the store writes on a
       debounce, and a crash is not a debounce. */
    expect(onCrash).toHaveBeenCalled();
  });

  it("lets Try again actually come back", async () => {
    const view = await render(<ErrorBoundary record={jest.fn()}><Boom /></ErrorBoundary>);
    await view.findByTestId("broke-title");
    willThrow = false;
    await act(async () => { fireEvent.press(view.getByTestId("broke-retry")); });
    expect(view.getByText("fine now")).toBeTruthy();
    expect(view.queryByTestId("broke-title")).toBeNull();
  });

  it("offers a different screen for when trying again will not help", async () => {
    const onHome = jest.fn();
    const view = await render(
      <ErrorBoundary record={jest.fn()} onHome={onHome}><Boom /></ErrorBoundary>);
    await view.findByTestId("broke-title");
    await act(async () => { fireEvent.press(view.getByTestId("broke-home")); });
    /* Navigate first, then remount: the other order remounts the broken screen
       and throws again before the navigation lands. */
    expect(onHome).toHaveBeenCalled();
  });

  it("has no second button when there is nowhere else to send anyone", async () => {
    const view = await render(<ErrorBoundary record={jest.fn()}><Boom /></ErrorBoundary>);
    await view.findByTestId("broke-title");
    expect(view.queryByTestId("broke-home")).toBeNull();
  });
});

describe("the crash log", () => {
  it("keeps the newest few and nothing else", async () => {
    let list = [];
    for (let k = 0; k < KEEP + 5; k++) list = addCrash(list, crashEntry(new Error("e" + k), null, k));
    expect(list).toHaveLength(KEEP);
    expect(list[0].what).toBe("e" + (KEEP + 4));       // newest first
    expect(list[list.length - 1].what).toBe("e5");
  });

  it("survives being read back, and clears", async () => {
    await recordCrash(new Error("boom"), { componentStack: "\n  in Study" });
    const back = await readCrashes();
    expect(back).toHaveLength(1);
    expect(back[0].what).toBe("boom");
    expect(back[0].where).toMatch(/Study/);
    await clearCrashes();
    expect(await readCrashes()).toEqual([]);
  });

  /* A crash reporter that throws inside a crash turns a recoverable screen
     into an unrecoverable one, so every path here swallows. */
  it("never throws, whatever it is handed", async () => {
    await expect(recordCrash(undefined, undefined)).resolves.toBe(true);
    await expect(recordCrash("a string", null)).resolves.toBe(true);
    const back = await readCrashes();
    expect(back.map((c) => c.what)).toEqual(["a string", "unknown"]);
  });

  /* Errors that never reach a boundary: a rejected promise, a callback from a
     native module. In release the default handler ends the process, so this is
     the only record that outlives it. */
  it("catches what React never sees, and leaves the old handler in place", async () => {
    const previous = jest.fn();
    let current = previous;
    const utils = {
      getGlobalHandler: () => current,
      setGlobalHandler: (fn) => { current = fn; },
    };
    const undo = installCrashHandler({ ErrorUtils: utils });
    expect(current).not.toBe(previous);
    await act(async () => { current(new Error("off the rails"), true); });
    expect(previous).toHaveBeenCalled();                 // the platform still gets it
    const back = await readCrashes();
    expect(back[0].what).toBe("off the rails");
    expect(back[0].fatal).toBe(true);
    undo();
    expect(current).toBe(previous);
  });

  it("goes out as something a person can read", () => {
    const text = crashText([crashEntry(new Error("nope"), { componentStack: "\n  in Run" }, 0)], 0);
    expect(text).toMatch(/Bridges problem report/);
    expect(text).toMatch(/nope/);
    expect(text).toMatch(/components:/);
    // No learner state and no profile name: what broke, when, and where.
    expect(text).not.toMatch(/seen|profile|Jared/);
  });
});
