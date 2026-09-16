/* The phone's answer to an answer.
 *
 * A buzz leaves nothing in the render tree, so none of the existing suites can
 * see it at all — the same blind spot §30h′ records for the audio session, and
 * the same fix: `jest.setup.js` records every call on `global.__buzz`.
 *
 * What is asserted here is mostly *silence*. Making a phone vibrate is one
 * line; the design is which three moments are worth it, and a phone that
 * buzzes at everything is a phone whose owner turns the motor off, taking the
 * three that carry meaning with it.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner, Done } from "../src/screens/Run";
import { setHaptics } from "../src/haptics";

const question = {
  kind: "choose-en",
  ask: "Pick the word",
  prompt: "книга",
  cyr: true,
  options: [{ label: "book", right: true }, { label: "table" }],
};

async function withRunner(props) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }],
    active: "p1",
  }));
  return await render(
    <SessionProvider>
      <Runner steps={[question]} onFinish={jest.fn()} gradeWords={false} {...props} />
    </SessionProvider>
  );
}

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
  jest.clearAllMocks();
  global.__buzz = [];
  setHaptics(true);
});

afterEach(async () => { await flushState(); setHaptics(true); });

describe("the buzz on an answer", () => {
  it("tells right from wrong", async () => {
    await withRunner();
    fireEvent.press(await screen.findByText("book"));
    await screen.findByTestId("verdict");
    /* Two different patterns, not one buzz for "something happened". The
       verdict reaches three senses and this is the one that arrives first —
       with the volume down it is the only one besides the colour. */
    expect(global.__buzz).toEqual(["notification:Success"]);
  });

  it("…and a wrong answer feels wrong", async () => {
    await withRunner();
    fireEvent.press(await screen.findByText("table"));
    await screen.findByTestId("verdict");
    expect(global.__buzz).toEqual(["notification:Error"]);
  });

  it("stays quiet when the setting is off", async () => {
    /* One switch, read once at the top of the app (App.js) rather than at each
       call site — a site that had to consult state to decide whether to buzz
       is a site that could get it wrong, and there are four of them. */
    setHaptics(false);
    await withRunner();
    fireEvent.press(await screen.findByText("book"));
    await screen.findByTestId("verdict");
    expect(global.__buzz).toEqual([]);
  });

  it("does not celebrate an empty state", async () => {
    /* Half a dozen screens reuse `Done` as a message box — "No questions
       available", "Nothing due". Those pass no `passed`, and a phone that
       buzzed to announce a dead end would be congratulating the learner for
       having nowhere to go. */
    const view = await render(<Done title="No questions available" onBack={() => {}} />);
    expect(global.__buzz).toEqual([]);
    view.unmount();
    await render(<Done title="Lesson passed" score={90} passed onBack={() => {}} />);
    expect(global.__buzz).toEqual(["impact:Medium"]);
  });
});
