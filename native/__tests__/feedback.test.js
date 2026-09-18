/* The feedback client never throws and names why it has nothing to show — and
   a public build, which ships no token, gets one from the Worker on first use
   and keeps it (ROADMAP 13.39). */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFeedback, config, ensureToken, forgetToken, warmToken } from "../src/lib/feedback";

const cfg = { url: "https://fb.example/v1/feedback", base: "https://fb.example", token: "tok-123" };
const GOOD = { ok: true, words: [], grammar: [{ tag: "CASE", note: "n" }], wordChoice: [],
               overall: "minor", praise: "" };
const reply = (body, status = 200) => async () =>
  new Response(JSON.stringify(body), { status });

/* A Worker that registers and then answers; records every call it saw. */
function worker({ token = "minted-token-abcdefghijklmnop", register = { ok: true, token }, feedback = GOOD } = {}) {
  const calls = [];
  const fetch = jest.fn(async (url, init) => {
    calls.push({ url, auth: init.headers.authorization, body: JSON.parse(init.body) });
    if (url.endsWith("/v1/register")) {
      return new Response(JSON.stringify(register.body || register), { status: register.status || 200 });
    }
    return new Response(JSON.stringify(feedback), { status: feedback.status || 200 });
  });
  return { fetch, calls };
}

describe("feedback client", () => {
  // forgetToken clears the one key this module owns; AsyncStorage.clear() is
  // wired to the profile database in jest.setup.js, which nothing here loads.
  beforeEach(async () => { await forgetToken(); });
  // Deleted rather than the object replaced: Expo's jest preset keeps its own
  // handle on process.env, and a replaced object is one the app never reads.
  afterEach(() => { delete process.env.EXPO_PUBLIC_FEEDBACK_URL; delete process.env.EXPO_PUBLIC_APP_TOKEN; });

  it("is unconfigured without a URL and nothing is fetched; with one it is configured, token or not", async () => {
    delete process.env.EXPO_PUBLIC_FEEDBACK_URL; delete process.env.EXPO_PUBLIC_APP_TOKEN;
    expect(config()).toBeNull();
    const fetch = jest.fn();
    expect(await getFeedback({ transcript: "да", target: "Да." }, { fetch })).toEqual({ ok: false, reason: "unconfigured" });
    expect(fetch).not.toHaveBeenCalled();
    process.env.EXPO_PUBLIC_FEEDBACK_URL = "https://fb.example/";
    expect(config()).toEqual({ url: "https://fb.example/v1/feedback", base: "https://fb.example", token: null });
    process.env.EXPO_PUBLIC_APP_TOKEN = "t";
    expect(config("/v1/talk")).toEqual({ url: "https://fb.example/v1/talk", base: "https://fb.example", token: "t" });
  });

  it("posts the attempt with the bearer token and returns the Worker's reply", async () => {
    const fetch = jest.fn(reply(GOOD));
    const r = await getFeedback({ transcript: "я читаю книга", target: "Я читаю книгу.",
                                  unitId: "core4", lemmas: ["я", "читать", "книга"] }, { fetch, config: cfg });
    expect(r).toEqual(GOOD);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(cfg.url);
    expect(init.headers.authorization).toBe("Bearer tok-123");
    expect(JSON.parse(init.body)).toMatchObject({ transcript: "я читаю книга", unitId: "core4", topic: null });
  });

  it("maps refusals, parse failures, offline and timeout to reasons without throwing", async () => {
    expect(await getFeedback({}, { fetch: reply({ ok: false, reason: "cap" }, 429), config: cfg }))
      .toMatchObject({ ok: false, reason: "http", status: 429, detail: "cap" });
    expect(await getFeedback({}, { fetch: reply({ ok: false, reason: "parse" }), config: cfg }))
      .toEqual({ ok: false, reason: "parse" });
    expect(await getFeedback({}, { fetch: async () => { throw new TypeError("Network request failed"); }, config: cfg }))
      .toEqual({ ok: false, reason: "offline" });
    const never = (url, init) => new Promise((_, rej) => {
      init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
    });
    expect(await getFeedback({}, { fetch: never, config: cfg, timeoutMs: 20 }))
      .toEqual({ ok: false, reason: "timeout" });
  });

  /* The install's own token. */
  const noToken = { ...cfg, token: null };

  it("with no token, registers once, keeps the token on the device and sends it from then on", async () => {
    const w = worker();
    expect(await getFeedback({ transcript: "да", target: "Да." }, { fetch: w.fetch, config: noToken })).toEqual(GOOD);
    expect(await getFeedback({ transcript: "да", target: "Да." }, { fetch: w.fetch, config: noToken })).toEqual(GOOD);
    expect(w.calls.map((c) => c.url)).toEqual([
      "https://fb.example/v1/register", cfg.url, cfg.url,
    ]);
    expect(w.calls[0].auth).toBeUndefined();                       // registration carries no bearer
    expect(w.calls[1].auth).toBe("Bearer minted-token-abcdefghijklmnop");
    expect(w.calls[2].auth).toBe("Bearer minted-token-abcdefghijklmnop");
    expect(await AsyncStorage.getItem("rb.worker.token")).toBe("minted-token-abcdefghijklmnop");
  });

  it("a token already on the device is used without registering", async () => {
    await AsyncStorage.setItem("rb.worker.token", "kept-token-0123456789abcdef");
    const w = worker();
    expect(await getFeedback({}, { fetch: w.fetch, config: noToken })).toEqual(GOOD);
    expect(w.calls.map((c) => c.url)).toEqual([cfg.url]);
    expect(w.calls[0].auth).toBe("Bearer kept-token-0123456789abcdef");
  });

  it("two callers at once share one registration", async () => {
    const w = worker();
    const [a, b] = await Promise.all([
      getFeedback({}, { fetch: w.fetch, config: noToken }),
      getFeedback({}, { fetch: w.fetch, config: noToken }),
    ]);
    expect(a).toEqual(GOOD); expect(b).toEqual(GOOD);
    expect(w.calls.filter((c) => c.url.endsWith("/v1/register")).length).toBe(1);
  });

  it("a registration the Worker refuses is the request's failure, and nothing is kept", async () => {
    const refused = worker({ register: { body: { ok: false, reason: "cap" }, status: 429 } });
    expect(await getFeedback({}, { fetch: refused.fetch, config: noToken }))
      .toMatchObject({ ok: false, reason: "http", status: 429, detail: "cap" });
    expect(refused.calls.map((c) => c.url)).toEqual(["https://fb.example/v1/register"]);
    expect(await AsyncStorage.getItem("rb.worker.token")).toBeNull();

    const offline = async () => { throw new TypeError("Network request failed"); };
    expect(await getFeedback({}, { fetch: offline, config: noToken })).toEqual({ ok: false, reason: "offline" });

    // …and the next attempt tries again rather than remembering the failure.
    const w = worker();
    expect(await getFeedback({}, { fetch: w.fetch, config: noToken })).toEqual(GOOD);
    expect(w.calls[0].url).toBe("https://fb.example/v1/register");
  });

  it("a token the Worker no longer knows is replaced once, and the turn is not lost", async () => {
    await AsyncStorage.setItem("rb.worker.token", "stale-token-0123456789abcdef");
    let feedbackCalls = 0;
    const fetch = jest.fn(async (url, init) => {
      if (url.endsWith("/v1/register")) return new Response(JSON.stringify({ ok: true, token: "fresh-token-0123456789abcdef" }));
      feedbackCalls++;
      const stale = init.headers.authorization === "Bearer stale-token-0123456789abcdef";
      return new Response(JSON.stringify(stale ? { ok: false, reason: "unauthorised" } : GOOD), { status: stale ? 401 : 200 });
    });
    expect(await getFeedback({}, { fetch, config: noToken })).toEqual(GOOD);
    expect(feedbackCalls).toBe(2);
    expect(await AsyncStorage.getItem("rb.worker.token")).toBe("fresh-token-0123456789abcdef");
  });

  it("a 401 on a build's own token is reported, not retried", async () => {
    const fetch = jest.fn(reply({ ok: false, reason: "unauthorised" }, 401));
    expect(await getFeedback({}, { fetch, config: cfg })).toMatchObject({ ok: false, reason: "http", status: 401 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("warmToken registers ahead of the first request, and does nothing without an address", async () => {
    delete process.env.EXPO_PUBLIC_FEEDBACK_URL; delete process.env.EXPO_PUBLIC_APP_TOKEN;
    const idle = worker();
    warmToken({ fetch: idle.fetch });
    await Promise.resolve();
    expect(idle.fetch).not.toHaveBeenCalled();

    process.env.EXPO_PUBLIC_FEEDBACK_URL = "https://fb.example";
    const w = worker(); warmToken({ fetch: w.fetch });
    expect(await ensureToken("https://fb.example", { fetch: w.fetch })).toEqual({ token: "minted-token-abcdefghijklmnop" });
    expect(w.calls.map((c) => c.url)).toEqual(["https://fb.example/v1/register"]);
    expect(config().token).toBe("minted-token-abcdefghijklmnop");
  });
});
