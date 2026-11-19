/* The audio packs (2026-11-19): chapters past the first two come as zips the
 * app fetches ahead of the learner (src/audiopacks.js). What is pinned:
 *
 *   - the order wanted: this chapter, the next, the earlier ones, then More;
 *   - a pack is fetched, unpacked file by file, marked, and its clips resolve
 *     to a file URI; before that a packed clip is null (the device voice) and
 *     the miss queues the pack;
 *   - a failed fetch waits before it is tried again, and nothing throws;
 *   - a half-installed pack (no mark) and an unknown one are cleared at boot;
 *   - the generated modules list every packed clip in a pack that exists.
 */
import { wantedPacks, ensurePacks, installPack, resetPacks, packState, setPackDeps, bootPacks, removePack, RETRY_MS }
  from "../src/audiopacks";
import { packedClip, setPackResolver } from "../src/packs";
import { PACKS, WORD_CLIPS, wordClip } from "../src/wordaudio";
import { warmClips } from "../src/audio";

const fakePacks = [
  { id: "ch1-aaaaaaaaaa", label: "ch1", chapter: 1 }, { id: "ch3-bbbbbbbbbb", label: "ch3", chapter: 3 },
  { id: "ch4-cccccccccc", label: "ch4", chapter: 4 }, { id: "ch5-dddddddddd", label: "ch5", chapter: 5 },
  { id: "more1-eeeeeeeeee", label: "more1", chapter: null },
];

beforeEach(() => { resetPacks(); global.__fs.files.clear(); global.__fs.dirs.clear(); });

it("wants this chapter first, then the next, then the earlier ones, then More", () => {
  expect(wantedPacks(3, fakePacks)).toEqual(["ch4-cccccccccc", "ch5-dddddddddd", "ch3-bbbbbbbbbb", "ch1-aaaaaaaaaa", "more1-eeeeeeeeee"]);
  expect(wantedPacks(0, fakePacks)).toEqual(["ch1-aaaaaaaaaa", "more1-eeeeeeeeee"]);
});

it("lists every packed clip in a pack that exists, and bundles the first chapters", () => {
  const packed = Object.values(WORD_CLIPS).filter((e) => Array.isArray(e));
  expect(PACKS.length).toBeGreaterThan(0);
  for (const [p] of packed) expect(PACKS[p]).toBeTruthy();
  expect(PACKS.every((p) => /^(ch\d+|more\d+)-[0-9a-f]{10}$/.test(p.id) && p.bytes > 0 && p.count > 0)).toBe(true);
  expect(PACKS.some((p) => p.chapter === 1 || p.chapter === 2)).toBe(false);
  // Something is bundled too: a require, not an entry.
  expect(Object.values(WORD_CLIPS).some((e) => !Array.isArray(e))).toBe(true);
});

describe("installing", () => {
  const first = PACKS[0];
  const packedKey = Object.keys(WORD_CLIPS).find((k) => Array.isArray(WORD_CLIPS[k]) && WORD_CLIPS[k][0] === 0);
  const name = WORD_CLIPS[packedKey][1];
  const zipOf = (names) => Object.fromEntries(names.map((n) => [n + ".mp3", new Uint8Array([1, 2, 3])]));

  it("resolves a packed clip only once its pack is unpacked and marked; a miss queues the pack", async () => {
    await bootPacks();
    expect(wordClip(packedKey)).toBeNull();
    expect(packState().queued).toContain(first.id);           // the miss asked for it
    const urls = [];
    const ok = await installPack(first.id, { download: async (u) => { urls.push(u); return new Uint8Array(1); },
                                             unzip: () => zipOf([name, "other"]) });
    expect(ok).toBe(true);
    expect(urls[0]).toMatch(new RegExp(`/audio/${first.id}\\.zip$`));
    expect(wordClip(packedKey)).toEqual({ uri: `file:///documents/audio/${first.id}/${name}.mp3` });
    expect(global.__fs.files.has(`file:///documents/audio/${first.id}/.ok`)).toBe(true);
    await removePack(first.id);
    expect(wordClip(packedKey)).toBeNull();
  });

  /* A dealt pile asks for its packs at once, the first card's first — a
     chapter-1 learner's shuffled pile reaches chapter-3 sentences, and the
     first such card read in the device voice on a fresh install (the
     walkthrough, 2026-11-19). */
  it("warmClips queues every pack a pile needs, the first card's pack first", async () => {
    await bootPacks();
    const keyIn = (p) => Object.keys(WORD_CLIPS).find((k) => Array.isArray(WORD_CLIPS[k]) && WORD_CLIPS[k][0] === p);
    const a = keyIn(1), b = keyIn(0);
    expect(a && b).toBeTruthy();
    warmClips([a, "a word with no clip at all", b]);
    expect(packState().queued.slice(0, 2)).toEqual([PACKS[1].id, PACKS[0].id]);
  });

  it("a failed fetch leaves nothing behind, throws nothing, and is not retried at once", async () => {
    let tries = 0;
    setPackDeps({ download: async () => { tries++; throw new Error("offline"); } });
    await ensurePacks(PACKS.length);
    expect(tries).toBe(PACKS.length);
    expect(packState().installed).toEqual([]);
    expect(global.__fs.dirs.has(`file:///documents/audio/${first.id}`)).toBe(false);
    await ensurePacks(PACKS.length);
    expect(tries).toBe(PACKS.length);                           // within RETRY_MS: left alone
    expect(RETRY_MS).toBeGreaterThan(60000);
  });

  it("clears a half-installed pack and one this build does not know at boot", async () => {
    global.__fs.dirs.add("file:///documents/audio");
    global.__fs.dirs.add(`file:///documents/audio/${first.id}`);
    global.__fs.files.set(`file:///documents/audio/${first.id}/x.mp3`, 3);     // no .ok: half done
    global.__fs.dirs.add("file:///documents/audio/ch9-ffffffffff");
    global.__fs.files.set("file:///documents/audio/ch9-ffffffffff/.ok", 1);
    const second = PACKS[1] || first;
    global.__fs.dirs.add(`file:///documents/audio/${second.id}`);
    global.__fs.files.set(`file:///documents/audio/${second.id}/.ok`, 1);
    await bootPacks();
    expect(packState().installed).toEqual([second.id]);
    expect(global.__fs.dirs.has(`file:///documents/audio/${first.id}`)).toBe(false);
    expect(global.__fs.dirs.has("file:///documents/audio/ch9-ffffffffff")).toBe(false);
  });

  it("packedClip answers nothing without a resolver, and the resolver's answer with one", () => {
    setPackResolver(null);
    expect(packedClip([0, "x"], PACKS)).toBeNull();
    setPackResolver((p, n) => `${p.id}/${n}`);
    expect(packedClip([0, "x"], PACKS)).toBe(`${PACKS[0].id}/x`);
    expect(packedClip([99, "x"], PACKS)).toBeNull();
    resetPacks();
    // The app's own resolver is back for the suites after this one.
    jest.isolateModules(() => require("../src/audiopacks"));
  });
});
