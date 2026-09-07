/* The shared question runner: its verdict holds one position.
 *
 * Own file, for the reason screens.test.js documents — matchers start timing out past
 * roughly the sixth test in a file under React 19 / RNTL 14.
 */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider } from "../src/session";
import { flushState } from "../src/store";
import { Runner } from "../src/screens/Run";

/* Every question present() emits carries a kind; the registry draws nothing for one
   that does not, which is what registry.test.js guards. */
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
});

afterEach(async () => {
  await flushState();
});

describe("runner verdict", () => {
  it("is anchored to the foot of a screen that fills", async () => {
    await withRunner();
    fireEvent.press(await screen.findByText("book"));
    const verdict = await screen.findByTestId("verdict");
    // marginTop:"auto" only anchors if the container grows — both halves matter,
    // which is how the web port went wrong the first time.
    expect(verdict.props.style.marginTop).toBe("auto");
    // No UNSAFE_getByType in this RNTL; Screen's body carries a testID instead.
    const scroll = screen.getByTestId("screen-body");
    expect(scroll.props.contentContainerStyle.flexGrow).toBe(1);
    expect(screen.getByText("Correct")).toBeTruthy();
  });

  it("does not draw a verdict before an answer", async () => {
    await withRunner();
    await screen.findByText("book");
    expect(screen.queryByTestId("verdict")).toBeNull();
  });

  it("lets a button take the first press while the keyboard is up", async () => {
    // Found on the emulator: Check, Continue and a search result all needed two
    // presses after typing, because the ScrollView spent the first on the keyboard.
    await withRunner();
    await screen.findByText("book");
    expect(screen.getByTestId("screen-body").props.keyboardShouldPersistTaps).toBe("handled");
  });

  it("gives each typed question a fresh field, and the Latin hint only after", async () => {
    const typed = (word, en) => ({ kind: "type", ask: "Write it in Russian", prompt: en,
                                   cyr: false, typed: true, answer: word, target: word });
    await withRunner({ steps: [typed("что", "what"), typed("он", "he")] });
    const input = await screen.findByPlaceholderText("Cyrillic or Latin");
    expect(screen.queryByText(/Latin spelling/)).toBeNull();      // the answer stays hidden
    fireEvent.changeText(input, "chto");
    await waitFor(() => expect(screen.getByPlaceholderText("Cyrillic or Latin").props.value).toBe("chto"));
    await act(async () => { fireEvent.press(screen.getByText("Check")); });
    expect(await screen.findByText("Correct")).toBeTruthy();
    expect(screen.getByText("Latin spelling: “chto”")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText("Continue")); });
    // Question 8 on the emulator opened with question 7's answer still in it.
    expect((await screen.findByPlaceholderText("Cyrillic or Latin")).props.value).toBe("");
  });

  it("shows the enclosing flow's progress when told to", async () => {
    await withRunner({ progress: { at: 4, total: 16 } });
    expect(await screen.findByText("5/16")).toBeTruthy();
  });
});
