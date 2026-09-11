/* One typeface, everywhere.
 *
 * React Native has no global font. A `Text` that names a size and not a family
 * falls back to the system one silently, so a single missed import puts Roboto
 * next to Nunito on the same screen — which reads as a bug rather than a choice,
 * and is invisible to every other test in this suite.
 *
 * So the rule is mechanical: nothing imports `Text` or `TextInput` from
 * react-native; they come from the app's own ui.js, which is the one place the
 * family is set. This reads the source to say so, because there is no render
 * that could.
 */

import { readdirSync, statSync, readFileSync } from "fs";
import { join } from "path";

import { faceFor, font } from "../src/theme";

const ROOT = join(__dirname, "..");

function sources(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== "node_modules") sources(p, out); }
    else if (f.endsWith(".js")) out.push(p);
  }
  return out;
}

describe("the typeface", () => {
  const files = sources(join(ROOT, "src")).concat([join(ROOT, "App.js")]);

  it("is never bypassed by importing Text from react-native", () => {
    const guilty = [];
    for (const p of files) {
      if (p.endsWith(`${require("path").sep}ui.js`)) continue;      // where it is set
      const s = readFileSync(p, "utf8");
      const m = s.match(/import\s*\{([^}]*)\}\s*from\s*"react-native";/);
      if (!m) continue;
      const names = m[1].split(",").map((x) => x.trim());
      if (names.includes("Text") || names.includes("TextInput")) {
        guilty.push(p.slice(ROOT.length + 1));
      }
    }
    expect(guilty).toEqual([]);
  });

  it("picks a real face for a weight, because Android will not synthesise one", () => {
    // fontWeight: "700" on the regular file is ignored on Android — the text
    // comes out light while the code says bold.
    expect(faceFor("400")).toBe(font.regular);
    expect(faceFor("500")).toBe(font.medium);
    expect(faceFor("600")).toBe(font.medium);
    expect(faceFor("700")).toBe(font.bold);
    expect(faceFor("bold")).toBe(font.bold);
    expect(faceFor("800")).toBe(font.heavy);
    expect(faceFor(undefined)).toBe(font.regular);
  });

  it("loads every face it can name", () => {
    const app = readFileSync(join(ROOT, "App.js"), "utf8");
    for (const face of Object.values(font)) expect(app).toContain(face);
  });
});
