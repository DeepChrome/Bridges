/* «стол → столы»: two forms, said one after the other with a beat between,
   never the arrow read aloud (the owner, 2026-10-02). */

import { waitFor } from "@testing-library/react-native";
import { say, stop, probeVoices } from "../src/audio";

beforeEach(async () => {
  global.__spoke = [];
  await probeVoices();
});

it("says each side of an arrow in turn, and not the arrow", async () => {
  await say("заво́д → заво́ды");
  await waitFor(() => expect(global.__spoke.length + (global.__players || []).length).toBeGreaterThan(0));
  await waitFor(() => expect(global.__spoke.filter((s) => /завод/.test(s)).length
                             + (global.__players || []).length).toBeGreaterThanOrEqual(2), { timeout: 3000 });
  expect(global.__spoke.some((s) => /→|->/.test(s))).toBe(false);
});

it("stops the second half when something else is asked for", async () => {
  global.__spoke = [];
  const before = (global.__players || []).length;
  const run = say("ко́шка → ко́шки");
  stop();
  await run;
  await new Promise((r) => setTimeout(r, 800));
  const said = global.__spoke.filter((s) => /кошки/.test(s)).length
    + ((global.__players || []).length - before > 1 ? 1 : 0);
  expect(said).toBe(0);
});
