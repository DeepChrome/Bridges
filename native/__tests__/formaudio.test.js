/* The generated form table (ROADMAP 13.42, CLAUDE.md §30ba).
 *
 * Every other suite runs on the empty mock in jest.setup.js, because loading
 * the real table reads 9,579 clip files. This is the one place that loads it,
 * and checks what the app relies on: keyed by the accented form, never by the
 * folded one, and a lookup that tolerates the way a table cell arrives.
 */

jest.setTimeout(60000);
const { FORM_CLIPS, formClip } = jest.requireActual("../src/formaudio");

describe("the form recordings", () => {
  it("is keyed by the accented form, and finds a cell as the table holds it", () => {
    const keys = Object.keys(FORM_CLIPS);
    expect(keys.length).toBeGreaterThan(9000);
    // At least some keys carry a stress mark: a folded key would carry none.
    expect(keys.filter((k) => /́/.test(k)).length).toBeGreaterThan(keys.length / 2);
    for (const k of keys.slice(0, 200)) expect(k).toBe(k.normalize("NFC"));
    const k = keys.find((x) => /́/.test(x));
    expect(formClip(k)).toBeTruthy();
    expect(formClip(` ${k.normalize("NFD")} `)).toBe(formClip(k));
    expect(formClip("несуществующееслово")).toBeNull();
  });
  // That no spelling the voice would stress two ways is in it is audio_qa.mjs's
  // check, through the same ambiguousSpellings the purchase used.
});
