/* A profile off the phone and back (ROADMAP P9.10): the backup is the state
   under a header, the restore reads it through the migrations, and a file that
   is not a backup is refused. The picker, file and share sheet are injected. */

import { backupProfile, restoreProfile, backupText, BACKUP_KIND } from "../src/backup";
import { normalise, SCHEMA_VERSION } from "../src/store";

const state = normalise({ v: 6, xp: 42, streak: 3, seen: { книга: { s: 5, d: 4, due: 100, last: 96, reps: 2, lapses: 0 } },
                          decks: [{ id: "k1", name: "D", cards: [{ ru: "да", en: "yes" }] }] });
const account = { id: "p1", name: "Jared", avatar: "monkeynaut" };

describe("backup and restore", () => {
  it("writes the state under a header and reads it back unchanged", async () => {
    const written = [];
    const r = await backupProfile(state, account, { writeShare: async (name, text) => written.push({ name, text }) });
    expect(r.file).toMatch(/^bridges-Jared-\d{4}-\d{2}-\d{2}\.json$/);
    expect(written[0].name).toBe(r.file);
    const parsed = JSON.parse(written[0].text);
    expect(parsed.kind).toBe(BACKUP_KIND);
    expect(parsed.state.seen["книга"].due).toBe(100);

    const back = await restoreProfile({
      pick: async () => ({ assets: [{ uri: "file:///x.json", name: "x.json" }] }),
      readText: async () => written[0].text,
    });
    expect(back.state.seen).toEqual(state.seen);
    expect(back.state.decks[0].cards[0].ru).toBe("да");
    expect(back.state.v).toBe(SCHEMA_VERSION);
    expect(back.name).toBe("Jared");
  });

  it("migrates an older backup on the way in, and refuses what is not a backup", async () => {
    const old = JSON.stringify({ v: 4, seen: { да: { s: 1, d: 5, due: 3, last: 2, reps: 1, lapses: 0 } }, unit: {} });
    const r = await restoreProfile({ pick: async () => ({ assets: [{ uri: "u" }] }), readText: async () => old });
    expect(r.state.v).toBe(SCHEMA_VERSION);
    expect(r.state.speech).toBeTruthy();                    // added by the v5 migration
    expect(r.state.seen["да"].due).toBe(3);

    const no = await restoreProfile({ pick: async () => ({ assets: [{ uri: "u" }] }), readText: async () => "{\"hello\":1}" });
    expect(no.error).toMatch(/not a Bridges backup/);
    const cancelled = await restoreProfile({ pick: async () => ({ canceled: true }) });
    expect(cancelled.cancelled).toBe(true);
    expect(JSON.parse(backupText(state, null)).name).toBe("");
  });
});
