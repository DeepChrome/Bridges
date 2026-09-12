/* What a control looks like, which is the other half of §20a's rule: native has
 * no visual suite, so a contract that lives in appearance is pinned in the
 * render tree instead.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";

import { Btn } from "../src/ui";

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
