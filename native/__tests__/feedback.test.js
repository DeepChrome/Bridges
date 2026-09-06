/* The feedback client never throws and names why it has nothing to show. */

import { getFeedback, config } from "../src/lib/feedback";

const cfg = { url: "https://fb.example/v1/feedback", token: "tok-123" };
const GOOD = { ok: true, words: [], grammar: [{ tag: "CASE", note: "n" }], wordChoice: [],
               overall: "minor", praise: "" };
const reply = (body, status = 200) => async () =>
  new Response(JSON.stringify(body), { status });

describe("feedback client", () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it("is unconfigured without a URL and token, and nothing is fetched", async () => {
    delete process.env.EXPO_PUBLIC_FEEDBACK_URL; delete process.env.EXPO_PUBLIC_APP_TOKEN;
    expect(config()).toBeNull();
    const fetch = jest.fn();
    expect(await getFeedback({ transcript: "да", target: "Да." }, { fetch })).toEqual({ ok: false, reason: "unconfigured" });
    expect(fetch).not.toHaveBeenCalled();
    process.env.EXPO_PUBLIC_FEEDBACK_URL = "https://fb.example/";
    process.env.EXPO_PUBLIC_APP_TOKEN = "t";
    expect(config()).toEqual({ url: "https://fb.example/v1/feedback", token: "t" });
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
});
