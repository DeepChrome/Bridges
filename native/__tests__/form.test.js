/* The form question (P9.20): the chapter's grammar asked in the quiz, chosen
 * early and typed later, and the Cases drill kept to what the route has taught.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner, VIEWS } from "../src/screens/Run";
import { Q, FORM_MIX } from "../src/questions";
import { STAGES } from "../src/data";
import { fold } from "@core/util";

const chosenChapter = STAGES[FORM_MIX.fromStage];
const typedChapter = STAGES[FORM_MIX.typedFromStage];

async function withRunner(q) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }],
    active: "p1",
  }));
  return await render(
    <SessionProvider>
      <Runner steps={[q]} onFinish={jest.fn()} gradeWords={false} />
    </SessionProvider>
  );
}

beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
});
afterEach(async () => { await flushState(); });

describe("form question", () => {
  it("has a view for both of its shapes", () => {
    const chosen = Q.formPrompt(chosenChapter.core, 0);
    const typed = Q.formPrompt(typedChapter.core, 0);
    expect(chosen && chosen.options && !chosen.typed).toBeTruthy();
    expect(typed && typed.typed && typed.target).toBeTruthy();
    expect(typeof VIEWS[chosen.kind]).toBe("function");
    expect(typeof VIEWS[typed.kind]).toBe("function");
  });

  it("takes the typed form, with a stress mark or without", async () => {
    let q = null;
    for (let k = 0; k < 20 && !(q && q.typed); k++) q = Q.formPrompt(typedChapter.core, 0);
    await withRunner(q);
    expect(await screen.findByText(q.ask)).toBeTruthy();
    expect(screen.getByText(q.prompt)).toBeTruthy();
    const input = screen.getByTestId("type-input");
    fireEvent.changeText(input, fold(q.target));
    await waitFor(() => expect(input.props.value).toBe(fold(q.target)));
    await act(async () => { fireEvent.press(screen.getByText("Check")); });
    expect(await screen.findByText("Correct")).toBeTruthy();
  });

  it("shows the table as a hint that counts", async () => {
    const q = Q.formPrompt(chosenChapter.core, 0);
    await withRunner(q);
    await screen.findByText(q.ask);
    fireEvent.press(screen.getByText("Show the table · counts as a hint"));
    expect(await screen.findByText(q.table.title)).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText("Got it")); });
    const right = q.options.find((o) => o.right).label;
    await act(async () => { fireEvent.press(screen.getByText(right)); });
    /* The cost is stated on the button *before* it is pressed, which is where a
       learner can act on it. The verdict used to add "Right, with a hint"
       afterwards, which explained a mechanism to someone who had already paid
       for it, and the owner had it cut (2026-09-10). What must hold is that the
       answer is still marked right. */
    expect(await screen.findByText("Correct")).toBeTruthy();
  });
});
