/* A long form is not squeezed into a fixed column (a tester, 2026-10-20, on
   «представленный» and «потрясающий»: "cells flow multiple lines and block the
   speaker icon… When I click, nothing plays"). Every column was 110 wide, so
   «предста́вленного» ran two lines and over the next column's speaker. A
   column is as wide as its longest form now, and the table scrolls sideways. */

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { Table, columnWidths } from "../src/rules";
import { L } from "../src/data";

const flat = (s) => Object.assign({}, ...[s].flat(3).filter(Boolean));

describe("table columns", () => {
  const w = L.find((l) => l.b === "представленный");
  const decl = w && w.t.find((t) => t.columns.includes("Feminine"));

  it("widen to their longest form, and stay 110 where everything fits", () => {
    expect(decl).toBeTruthy();
    const widths = columnWidths(decl, true);
    // «предста́вленного» is 15 letters at the body size: wider than 110.
    expect(widths[1]).toBeGreaterThan(160);
    // The case names stay about as wide as they were.
    expect(widths[0]).toBeLessThan(125);
    const short = { columns: ["", "Form"], rows: [["я", ["иду́"]], ["ты", ["идёшь"]]] };
    expect(columnWidths(short, true)).toEqual([110, 110]);
  });

  it("draws every cell of a column at the column's width", async () => {
    await render(<Table table={decl} testID="t" />);
    const row = screen.getByTestId("t-row-0");
    const widths = columnWidths(decl, false);
    row.props.children.forEach((cell, ci) => {
      expect(flat(screen.getByTestId("t-row-0").children[ci].props.style).width).toBe(widths[ci]);
    });
  });
});
