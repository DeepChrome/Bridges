/* Screen's three layout props, every combination.
 *
 * `fill`, `safeTop` and `footer` each change one thing about the frame every
 * screen is drawn in, and until now only two of the eight combinations were
 * exercised anywhere (safeTop by the gate, footer by the quiz builder). The
 * matrix (docs/PLAYBOOK.md Phase 0.3):
 *
 *   prop     | on                                   | off
 *   ---------|--------------------------------------|-------------------------
 *   fill     | content container grows to the       | content is as tall as
 *            | screen (flexGrow: 1), so a foot       | it is
 *            | action can sit at the bottom          |
 *   safeTop  | the status-bar inset is taken here    | it is not — a header
 *            | (edges: ["top"]); the gate only       | above has already taken it
 *   footer   | a bar off the scroll, hairline above, | nothing; scroll padding
 *            | scroll padding 24 to clear it         | stays 40
 *
 * Assertions on the render tree, not jest snapshots: a snapshot fails on any
 * unrelated style change and teaches nothing, and §20a already says a native
 * visual contract is held in the tree.
 *
 * Own file, per the timeout note in screens.test.js.
 */

import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";

import { Screen } from "../src/ui";

const flat = (s) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : (s || {}));

const MATRIX = [];
for (const fill of [false, true]) for (const safeTop of [false, true]) for (const footer of [false, true]) {
  MATRIX.push({ fill, safeTop, footer });
}

describe("Screen's frame", () => {
  it.each(MATRIX)("fill=$fill safeTop=$safeTop footer=$footer", async ({ fill, safeTop, footer }) => {
    await render(
      <Screen fill={fill} safeTop={safeTop}
              footer={footer ? <Text testID="the-action">Go</Text> : undefined}>
        <Text>body</Text>
      </Screen>
    );
    // safeTop: the inset is taken here or it is not. SafeAreaView resolves the
    // `edges` list to a per-edge mode on the host node, which is the better
    // thing to read: it is what the native side actually receives.
    const edges = screen.getByTestId("screen-root").props.edges;
    expect(edges.top).toBe(safeTop ? "additive" : "off");
    expect(edges.bottom).toBe("off");     // never: the tab bar or the footer owns it

    // fill: the content container grows, or it is as tall as its content.
    const body = screen.getByTestId("screen-body");
    const cc = flat(body.props.contentContainerStyle);
    expect(cc.flexGrow).toBe(fill ? 1 : undefined);

    // footer: a bar off the scroll, and the scroll clears it.
    if (footer) {
      expect(screen.getByTestId("screen-footer")).toBeTruthy();
      expect(screen.getByTestId("the-action")).toBeTruthy();
      expect(cc.paddingBottom).toBe(24);
    } else {
      expect(screen.queryByTestId("screen-footer")).toBeNull();
      expect(cc.paddingBottom).toBe(40);
    }
    // And the body is there whatever the frame.
    expect(screen.getByText("body")).toBeTruthy();
  });

  /* The footer is outside the scroll: it is a sibling of the body, not inside
     it, or a long list would scroll it away — which is the whole reason it
     exists. */
  it("keeps the footer out of the scroll", async () => {
    await render(<Screen footer={<Text>Go</Text>}><Text>body</Text></Screen>);
    const foot = screen.getByTestId("screen-footer");
    let node = foot.parent, insideBody = false;
    while (node) {
      if (node.props && node.props.testID === "screen-body") insideBody = true;
      node = node.parent;
    }
    expect(insideBody).toBe(false);
  });

  /* `scroll={false}` is the fourth switch, used by screens that manage their
     own scrolling (the runner's sheets, the path). No content container then,
     so `fill` and `footer` padding have nothing to apply to — and the footer
     still renders. */
  it("with scroll off, has no content container but still takes a footer", async () => {
    await render(<Screen scroll={false} fill footer={<Text>Go</Text>}><Text>body</Text></Screen>);
    expect(screen.getByTestId("screen-body").props.contentContainerStyle).toBeNull();
    expect(screen.getByTestId("screen-footer")).toBeTruthy();
  });
});
