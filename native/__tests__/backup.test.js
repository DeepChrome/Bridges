/* A profile off the phone and back (ROADMAP P9.10): the backup is the state
   under a header, the restore reads it through the migrations, and a file that
   is not a backup is refused. The picker, file and share sheet are injected. */

import { backupProfile, restoreProfile, backupText, BACKUP_KIND } from "../src/backup";
import { normalise, SCHEMA_VERSION } from "../src/store";

const state = normalise({ v: 6, xp: 42, streak: 3, seen: { книга: { s: 5, d: 4, due: 100, last: 96, reps: 2, lapses: 0 } },
                          decks: [{ id: "k1", name: "D", cards: [{ ru: "да", en: "yes" }] }] });
const account = { id: "p1", name: "Jared", avatar: "monkeynaut" };

const log = [{ id: 1, word: "книга", direction: "both", grade: 3, day: 96, at: 8_300_000_000_000,
               s: 4, d: 4, due: 98, last: 90, reps: 1, lapses: 0, elapsed: 6, source: "study" }];

describe("backup and restore", () => {
  it("writes the state and the review log under a header and reads them back unchanged", async () => {
    const written = [];
    const r = await backupProfile(state, account, { writeShare: async (name, text) => written.push({ name, text }),
                                                    readLog: async () => log });
    expect(r.file).toMatch(/^bridges-Jared-\d{4}-\d{2}-\d{2}\.json$/);
    expect(r.log).toBe(1);
    expect(written[0].name).toBe(r.file);
    const parsed = JSON.parse(written[0].text);
    expect(parsed.kind).toBe(BACKUP_KIND);
    expect(parsed.state.seen["книга"].due).toBe(100);
    expect(parsed.log).toEqual(log);

    const back = await restoreProfile({
      pick: async () => ({ assets: [{ uri: "file:///x.json", name: "x.json" }] }),
      readText: async () => written[0].text,
    });
    expect(back.state.seen).toEqual(state.seen);
    expect(back.state.decks[0].cards[0].ru).toBe("да");
    expect(back.state.v).toBe(SCHEMA_VERSION);
    expect(back.name).toBe("Jared");
    expect(back.log).toEqual(log);
  });

  it("migrates an older backup on the way in, and refuses what is not a backup", async () => {
    const old = JSON.stringify({ v: 4, seen: { да: { s: 1, d: 5, due: 3, last: 2, reps: 1, lapses: 0 } }, unit: {} });
    const r = await restoreProfile({ pick: async () => ({ assets: [{ uri: "u" }] }), readText: async () => old });
    expect(r.state.v).toBe(SCHEMA_VERSION);
    expect(r.state.speech).toBeTruthy();                    // added by the v5 migration
    expect(r.state.seen["да"].due).toBe(3);
    expect(r.log).toEqual([]);                              // a file from before the log has none

    // A log entry that is not a review is dropped, not stored.
    const junk = JSON.stringify({ kind: BACKUP_KIND, state: { v: 7, seen: {} },
                                  log: [{ word: "да", grade: 3, day: 1, at: 5 }, { word: "", grade: 3, day: 1, at: 6 },
                                        { word: "нет", grade: 7, day: 1, at: 7 }, "no"] });
    const j = await restoreProfile({ pick: async () => ({ assets: [{ uri: "u" }] }), readText: async () => junk });
    expect(j.log.map((x) => x.word)).toEqual(["да"]);

    const no = await restoreProfile({ pick: async () => ({ assets: [{ uri: "u" }] }), readText: async () => "{\"hello\":1}" });
    expect(no.error).toMatch(/not a Bridges backup/);
    const cancelled = await restoreProfile({ pick: async () => ({ canceled: true }) });
    expect(cancelled.cancelled).toBe(true);
    expect(JSON.parse(backupText(state, null)).name).toBe("");
  });
});
