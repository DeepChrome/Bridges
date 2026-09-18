/* Every route a screen navigates to is registered in the stack that screen is in.
 *
 * **This is the check the app did not have, and its absence shipped a dead
 * button** (2026-09-17): the lesson's Listening step called
 * `navigate("Scenes")` while `Scenes` existed only on the Practice stack, and
 * the lesson screen lives on the Learn stack. React Navigation does not throw
 * for an unknown route — it does nothing at all, so the press is silent and
 * every suite stays green.
 *
 * Nothing else could catch it. The unit test for that step asserted
 * `nav.navigate` was called with `("Scenes", { key })` against a **mocked**
 * navigator, which proves the call and can never prove the destination. Mounting
 * the real navigator per screen would be slow and would still only cover the
 * paths a test happened to press, so this reads the wiring instead: App.js is
 * the one place routes are declared, and it can be checked whole.
 *
 * It is deliberately conservative — a quoted string inside a `navigate(...)`
 * call counts as a target only if it is a route name *somewhere* in the app.
 * Anything else is a parameter and is ignored. That keeps ternaries
 * (`navigate(a ? "Video" : "Quiz")`) covered without trying to parse JavaScript.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* `__dirname`, not `import.meta.url`: jest transforms these to CommonJS and
   `import.meta` is null there. */
const ROOT = join(__dirname, "..");
const APP = readFileSync(join(ROOT, "App.js"), "utf8");

/* component name -> module path, from App.js's own imports. */
function imports(src) {
  const out = new Map();
  const re = /import\s+(?:(\w+)\s*,\s*)?(?:\{([^}]*)\})?\s*from\s+"(\.[^"]+)"/g;
  let m;
  while ((m = re.exec(src))) {
    const [, def, named, path] = m;
    if (def) out.set(def, path);
    for (const part of (named || "").split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) out.set(name, path);
    }
  }
  /* `import X from "./src/..."` with no braces. */
  const re2 = /import\s+(\w+)\s+from\s+"(\.[^"]+)"/g;
  while ((m = re2.exec(src))) out.set(m[1], m[2]);
  return out;
}

/* stack function name -> { routes: Map(routeName -> component) } */
function stacks(src) {
  const out = new Map();
  const re = /function\s+(\w+Stack)\s*\(\)\s*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = re.exec(src))) {
    const routes = new Map();
    const sre = /<Stack\.Screen\s+name="(\w+)"\s+component=\{(\w+)\}/g;
    let s;
    while ((s = sre.exec(m[2]))) routes.set(s[1], s[2]);
    out.set(m[1], routes);
  }
  return out;
}

const IMPORTS = imports(APP);
const STACKS = stacks(APP);
const ALL_ROUTES = new Set([...STACKS.values()].flatMap((r) => [...r.keys()]));

/* A module split into its top-level exported functions, so a file holding many
   screens (Flows.js holds a dozen) attributes each navigate to the right one. */
function blocks(path) {
  let src;
  try {
    src = readFileSync(join(ROOT, path.replace(/^\.\//, "") + ".js"), "utf8");
  } catch {
    return new Map();
  }
  const re = /export\s+(?:default\s+)?function\s+(\w+)/g;
  const marks = [];
  let m;
  while ((m = re.exec(src))) marks.push({ name: m[1], at: m.index });
  const out = new Map();
  marks.forEach((mark, k) => {
    const end = k + 1 < marks.length ? marks[k + 1].at : src.length;
    out.set(mark.name, src.slice(mark.at, end));
  });
  return out;
}

/* Route names a block navigates to — from the **first argument only**.
 *
 * Scanning the whole call was the first version and it was wrong in the way
 * §30r warns about: `navigate("Learn", { screen: "Unit", params })` is a
 * *nested* navigation, perfectly correct, and reading `"Unit"` out of the
 * params reported four dead links that were not dead. A metric that cannot tell
 * the skill from the flaw is worse than none. Taking only the first argument
 * keeps ternaries covered — `navigate(a ? "Video" : "Quiz", …)` still yields
 * both — while a nested target is credited to the tab it is routed through,
 * which is the stack that actually has to know it. */
function firstArg(call) {
  let depth = 0;
  for (let k = 0; k < call.length; k++) {
    const c = call[k];
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) return call.slice(0, k);
  }
  return call;
}

function targets(body) {
  const out = new Set();
  const re = /\.(?:navigate|replace|push)\(([\s\S]{0,300}?)\)\s*[;,)}\n]/g;
  let m;
  while ((m = re.exec(body))) {
    for (const lit of firstArg(m[1]).match(/"([^"]+)"/g) || []) {
      const name = lit.slice(1, -1);
      if (ALL_ROUTES.has(name)) out.add(name);
    }
  }
  return out;
}

test("App.js parses into stacks and routes", () => {
  expect(STACKS.size).toBeGreaterThanOrEqual(5);
  expect(ALL_ROUTES.has("Scenes")).toBe(true);
  expect(ALL_ROUTES.has("Lesson")).toBe(true);
});

test("every screen can reach the routes it navigates to", () => {
  const broken = [];
  for (const [stackName, routes] of STACKS) {
    for (const [routeName, component] of routes) {
      const path = IMPORTS.get(component);
      if (!path) continue;                       // defined in App.js itself
      const body = blocks(path).get(component);
      if (!body) continue;                       // not a top-level export; skipped
      for (const want of targets(body)) {
        if (!routes.has(want)) {
          broken.push(`${stackName}: ${routeName} (${component}) navigates to "${want}", `
                      + `which that stack does not register`);
        }
      }
    }
  }
  expect(broken).toEqual([]);
});

/* The specific regression, named, so the reason this file exists survives a
   refactor of the check above. */
test("the lesson's Listening step can reach the player", () => {
  const learn = STACKS.get("LearnStack");
  expect(learn.has("Lesson")).toBe(true);
  expect(learn.has("Scenes")).toBe(true);
});
