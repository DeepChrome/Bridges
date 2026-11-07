/* Sync on the phone (src/sync.js, core/syncclient.js): linking a profile
 * opens an account and pushes everything; a save pushes its ops; a pull
 * lands in the database and on the screen; pairing claims a code. The
 * Worker is a fake fetch that keeps rows the way the real one does
 * (last write wins, rows from other devices only). */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SessionProvider, useSession } from "../src/session";
import { flushState } from "../src/store";
import { Text } from "../src/ui";
import { View } from "react-native";
import { syncNow, syncLink, enableSync, pairComputer, disableSync, PUSH_DELAY_MS, startSync } from "../src/sync";
import { forgetToken } from "../src/lib/feedback";
import { PROTOCOL, newer } from "@core/sync";

const base = {
  v: 11, seen: {}, trouble: {}, pinned: [], sets: [], drills: {}, unit: {}, watched: {},
  speech: { attempts: [], tagCounts: {} }, streak: 2,
};

/* The Worker, in a fetch: register, account, sync (rows by device), pair. */
function fakeWorker() {
  const rows = new Map();          // k\u0001id -> { op, seq, dev }
  let seq = 0;
  const calls = [];
  const fetch = jest.fn(async (url, init) => {
    const path = new URL(url).pathname;
    const body = JSON.parse(init.body || "{}");
    const token = (init.headers.authorization || "").replace("Bearer ", "");
    calls.push({ path, body, token });
    const reply = (status, data) => ({ ok: status < 300, status, json: async () => data });
    if (path === "/v1/register") return reply(200, { ok: true, token: "install-token-0123456789abcdef" });
    if (path === "/v1/sync/account") return reply(200, { ok: true, account: "a-test", device: "d-phone", token: "s1.a-test." + "p".repeat(32) });
    if (path === "/v1/sync") {
      const dev = token.endsWith("p".repeat(32)) ? "d-phone" : "d-other";
      let applied = 0;
      for (const o of body.ops || []) {
        const key = o.k + "\u0001" + o.id;
        const have = rows.get(key);
        if (!newer(o, have ? have.op : null)) continue;
        rows.set(key, { op: o, seq: ++seq, dev });
        applied++;
      }
      const ops = [...rows.values()].filter((r) => r.seq > (body.cursor || 0) && r.dev !== dev).sort((a, b) => a.seq - b.seq).map((r) => r.op);
      return reply(200, { ok: true, applied, cursor: seq, more: false, ops });
    }
    if (path === "/v1/pair/claim") return reply(body.code === "482913" ? 200 : 410, body.code === "482913" ? { ok: true } : { ok: false, reason: "expired" });
    if (path === "/v1/sync/devices") return reply(200, { ok: true, devices: [{ id: "d-phone", name: "Phone", me: true, seen: Date.now() }] });
    return reply(404, { ok: false, reason: "not found" });
  });
  /* Another device writes straight into the server. */
  const other = (op) => { rows.set(op.k + "\u0001" + op.id, { op, seq: ++seq, dev: "d-other" }); };
  return { fetch, calls, rows, other };
}

function Probe() {
  const { st, update, ready } = useSession();
  return (
    <View>
      <Text testID="streak">{ready ? String(st.streak) : "…"}</Text>
      <Text testID="pinned">{(st.pinned || []).join(",")}</Text>
      <Text testID="bump" onPress={() => update((p) => ({ ...p, streak: (p.streak || 0) + 1 }))}>bump</Text>
    </View>
  );
}

async function profile(state = {}) {
  await AsyncStorage.setItem("rb.accounts", JSON.stringify({
    list: [{ id: "p1", name: "Jared", avatar: "monkeynaut", placed: null }], active: "p1" }));
  await AsyncStorage.setItem("rb.state.p1", JSON.stringify({ ...base, ...state }));
}

let worker;
beforeEach(async () => {
  await flushState();
  await AsyncStorage.clear();
  await forgetToken();
  process.env.EXPO_PUBLIC_FEEDBACK_URL = "https://worker.test";
  worker = fakeWorker();
  global.fetch = worker.fetch;
  jest.useRealTimers();
});
afterEach(async () => { await flushState(); });

describe("linking a profile", () => {
  it("opens an account with the install token and pushes everything it holds", async () => {
    await profile({ streak: 7, pinned: ["дом"] });
    await render(<SessionProvider><Probe /></SessionProvider>);
    await screen.findByText("7");
    const r = await enableSync("p1", "Phone");
    expect(r.ok).toBe(true);
    const paths = worker.calls.map((c) => c.path);
    expect(paths.slice(0, 2)).toEqual(["/v1/register", "/v1/sync/account"]);
    expect(worker.calls[1].token).toBe("install-token-0123456789abcdef");
    const push = worker.calls.find((c) => c.path === "/v1/sync" && c.body.ops.length);
    expect(push.token).toBe("s1.a-test." + "p".repeat(32));
    expect(push.body.protocol).toBe(PROTOCOL);
    expect(push.body.ops.find((o) => o.id === "progress\u0001streak").v).toBe("7");
    expect(push.body.ops.find((o) => o.id === "progress\u0001pinned").v).toBe(JSON.stringify(["дом"]));
    const link = await syncLink("p1");
    expect(link.account).toBe("a-test");
    expect(link.cursor).toBeGreaterThan(0);
    // Nothing left waiting.
    expect((await global.__db.repos.get("p1").counts()).outbox).toBe(0);
  });

  it("does nothing for a profile that is not linked", async () => {
    await profile();
    await render(<SessionProvider><Probe /></SessionProvider>);
    await screen.findByText("2");
    const r = await syncNow("p1");
    expect(r.reason).toBe("unlinked");
    expect(worker.calls.length).toBe(0);
  });
});

describe("a round", () => {
  it("pushes what a save changed, and pulls another device's change onto the screen and into the database", async () => {
    await profile({ streak: 2 });
    await render(<SessionProvider><Probe /></SessionProvider>);
    await screen.findByText("2");
    await flushState();                 // the boot's own save (the day stamp) has landed
    await enableSync("p1", "Phone");
    worker.calls.length = 0;

    // The learner acts; the save lands; its ops are pushed.
    await act(async () => { fireEvent.press(screen.getByTestId("bump")); });
    await flushState();
    await syncNow("p1");
    const push = worker.calls.find((c) => c.path === "/v1/sync" && c.body.ops.length);
    expect(push.body.ops.map((o) => o.id)).toEqual(["progress\u0001streak"]);
    expect(push.body.ops[0].v).toBe("3");

    // Another device pins a word and bumps the streak further.
    const later = Date.now() + 5000;
    worker.other({ k: "kv", id: "progress\u0001pinned", v: JSON.stringify(["кот"]), at: later });
    worker.other({ k: "kv", id: "progress\u0001streak", v: "9", at: later });
    worker.other({ k: "card", id: "кот\u0001recognise", at: later,
      v: JSON.stringify({ dueAt: later + 86400000, s: 1, d: 5, state: 2, steps: 0, reps: 1, lapses: 0, elapsed: 0, scheduled: 1 }) });
    await act(async () => { await syncNow("p1"); });
    await waitFor(() => expect(screen.getByTestId("streak")).toHaveTextContent("9"));
    expect(screen.getByTestId("pinned")).toHaveTextContent("кот");
    const saved = await global.__db.saved("p1");
    expect(saved.streak).toBe(9);
    expect(saved.seen["кот"].recognise.s).toBe(1);
    // …and the pulled rows do not come straight back as this phone's own.
    worker.calls.length = 0;
    await syncNow("p1");
    expect(worker.calls.every((c) => !c.body.ops || c.body.ops.length === 0)).toBe(true);

    // A later local change still wins over the pull, and goes up.
    await act(async () => { fireEvent.press(screen.getByTestId("bump")); });
    await flushState();
    worker.calls.length = 0;
    await syncNow("p1");
    expect(worker.calls.find((c) => c.body.ops.length).body.ops[0].v).toBe("10");
  });

  it("is pushed by itself a little after a save, once wired", async () => {
    jest.useFakeTimers();
    await profile();
    await render(<SessionProvider><Probe /></SessionProvider>);
    await act(async () => { await jest.advanceTimersByTimeAsync(0); });
    await act(async () => { await enableSync("p1", "Phone"); });
    const off = startSync();
    try {
      worker.calls.length = 0;
      await act(async () => { fireEvent.press(screen.getByTestId("bump")); });
      await act(async () => { await jest.advanceTimersByTimeAsync(300); });     // the store's debounce
      expect(worker.calls.filter((c) => c.path === "/v1/sync").length).toBe(0);
      await act(async () => { await jest.advanceTimersByTimeAsync(PUSH_DELAY_MS + 50); });
      const push = worker.calls.find((c) => c.path === "/v1/sync" && c.body.ops.length);
      expect(push).toBeTruthy();
      expect(push.body.ops.find((o) => o.id === "progress\u0001streak").v).toBe("3");
    } finally { off(); jest.useRealTimers(); }
  });

  it("keeps the outbox when the server is unreachable, and reports it", async () => {
    await profile();
    await render(<SessionProvider><Probe /></SessionProvider>);
    await screen.findByText("2");
    await flushState();
    await enableSync("p1", "Phone");
    global.fetch = jest.fn(async () => { throw new Error("Network request failed"); });
    await act(async () => { fireEvent.press(screen.getByTestId("bump")); });
    await flushState();
    const r = await syncNow("p1");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("offline");
    expect((await global.__db.repos.get("p1").counts()).outbox).toBe(1);
    // Back online, it goes.
    global.fetch = worker.fetch;
    const again = await syncNow("p1");
    expect(again.ok).toBe(true);
    expect((await global.__db.repos.get("p1").counts()).outbox).toBe(0);
  });
});

describe("pairing and unlinking", () => {
  it("claims the computer's code with the device token, and unlinking clears the outbox", async () => {
    await profile();
    await render(<SessionProvider><Probe /></SessionProvider>);
    await screen.findByText("2");
    await enableSync("p1", "Phone");
    const ok = await pairComputer("p1", "482913", "Laptop");
    expect(ok.ok).toBe(true);
    const claim = worker.calls.find((c) => c.path === "/v1/pair/claim");
    expect(claim.token).toBe("s1.a-test." + "p".repeat(32));
    expect(claim.body).toEqual({ code: "482913", name: "Laptop" });
    const bad = await pairComputer("p1", "000000", "Laptop");
    expect(bad.status).toBe(410);
    await disableSync("p1");
    expect(await syncLink("p1")).toBeNull();
    expect((await syncNow("p1")).reason).toBe("unlinked");
  });
});
