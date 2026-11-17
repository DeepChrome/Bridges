/* A held microphone button is never interrupted (the owner, 2026-11-12: "if
 * I pause too long, even while holding the mic button, it will continue as
 * if I'm done… They shouldn't be interrupted as long as they're holding the
 * mic button"). The engine runs continuous under a hold, a final result
 * while the finger is down is a segment of the answer, a session Android
 * closes on a pause is opened again with the segments kept, and only the
 * release ends it. Driven through the hook, with the recogniser stub playing
 * the platform (jest.setup.js). */

import { renderHook, act } from "@testing-library/react-native";
import { useRecognizer, HOLD_RESTARTS, LANG } from "../src/speech";

const final = (transcript, more = []) => act(async () => {
  global.__stt.emit("result", { isFinal: true, results: [{ transcript }].concat(more.map((t) => ({ transcript: t }))) });
});
const partial = (transcript) => act(async () => {
  global.__stt.emit("result", { isFinal: false, results: [{ transcript }] });
});
const end = () => act(async () => { global.__stt.emit("end", {}); });

beforeEach(() => { global.__stt.reset(); });

describe("hold to speak", () => {
  it("keeps listening through a final result and a closed session while the button is held", async () => {
    const onFinal = jest.fn();
    const { result } = await renderHook(() => useRecognizer({ onFinal }));
    await act(async () => { result.current.hold(); });
    const opts = global.__stt.calls[0];
    expect(opts.continuous).toBe(true);
    expect(opts.lang).toBe(LANG);
    expect(opts.androidIntentOptions.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS).toBeGreaterThan(0);
    expect(result.current.phase).toBe("listening");

    // A pause mid-sentence: the engine finalises what it has. Not the answer.
    await final("я");
    expect(onFinal).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("listening");
    expect(result.current.live).toBe("я");

    // …and Android closes the session. Opened again, the segment kept.
    await end();
    expect(global.__stt.calls).toHaveLength(2);
    expect(result.current.phase).toBe("listening");
    expect(result.current.live).toBe("я");

    await partial("хочу");
    expect(result.current.live).toBe("я хочу");
    await final("хочу чай");
    expect(result.current.live).toBe("я хочу чай");

    // A no-speech error under the finger is another closed session, not a note.
    await act(async () => { global.__stt.emit("error", { error: "no-speech" }); });
    expect(global.__stt.calls).toHaveLength(3);
    expect(result.current.note).toBeNull();
    expect(result.current.phase).toBe("listening");
    expect(onFinal).not.toHaveBeenCalled();

    // The release: the end that follows the stop delivers everything heard.
    await act(async () => { result.current.release(); });
    await end();
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal.mock.calls[0][0]).toBe("я хочу чай");
    expect(onFinal.mock.calls[0][2]).toEqual(["я хочу чай"]);
    expect(onFinal.mock.calls[0][3]).toBe(LANG);
    expect(result.current.phase).toBe("idle");
  });

  /* One segment keeps the engine's alternatives (core/speech.js
     closestTranscript reads them); several have only their join. */
  it("hands on the alternatives of a single segment", async () => {
    const onFinal = jest.fn();
    const { result } = await renderHook(() => useRecognizer({ onFinal }));
    await act(async () => { result.current.hold(); });
    await final("книга", ["книги", "книгу"]);
    await act(async () => { result.current.release(); });
    await end();
    expect(onFinal.mock.calls[0][0]).toBe("книга");
    expect(onFinal.mock.calls[0][2]).toEqual(["книга", "книги", "книгу"]);
  });

  /* The stop after a release answered with an error, not an end: what was
     heard under the finger is still the answer. Android reports `no-speech`
     or `client` when nothing followed the last segment, and the segments were
     thrown away — the owner's pronunciation step showed «конечно» heard, said
     "Try again" and gave no credit (2026-11-17). */
  it("answers with the segments heard when the stop ends in a transient error", async () => {
    const onFinal = jest.fn();
    const { result } = await renderHook(() => useRecognizer({ onFinal }));
    await act(async () => { result.current.hold(); });
    await final("конечно", ["конечна"]);
    await act(async () => { result.current.release(); });
    await act(async () => { global.__stt.emit("error", { error: "client" }); });
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal.mock.calls[0][0]).toBe("конечно");
    expect(onFinal.mock.calls[0][2]).toEqual(["конечно", "конечна"]);
    expect(result.current.note).toBeNull();
    expect(result.current.phase).toBe("idle");
    // With nothing heard, the error is still a note and not an answer.
    await act(async () => { result.current.hold(); });
    await act(async () => { result.current.release(); });
    await act(async () => { global.__stt.emit("error", { error: "no-speech" }); });
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(result.current.note).toBe("Nothing heard");
  });

  /* A final that arrives after the release is the end, as it always was. */
  it("takes a final after the release as the answer", async () => {
    const onFinal = jest.fn();
    const { result } = await renderHook(() => useRecognizer({ onFinal }));
    await act(async () => { result.current.hold(); });
    await act(async () => { result.current.release(); });
    await final("да");
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal.mock.calls[0][0]).toBe("да");
    expect(result.current.phase).toBe("idle");
  });

  /* The restarts are bounded: an engine that closes for ever is not held
     open for ever, and what was heard is still the answer. */
  it("stops reopening after HOLD_RESTARTS and answers with what it heard", async () => {
    const onFinal = jest.fn();
    const { result } = await renderHook(() => useRecognizer({ onFinal }));
    await act(async () => { result.current.hold(); });
    await final("привет");
    for (let k = 0; k < HOLD_RESTARTS; k++) await end();
    expect(global.__stt.calls).toHaveLength(1 + HOLD_RESTARTS);
    expect(onFinal).not.toHaveBeenCalled();
    await end();
    expect(global.__stt.calls).toHaveLength(1 + HOLD_RESTARTS);
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal.mock.calls[0][0]).toBe("привет");
  });

  /* Conversation mode is untouched: it still ends itself on the pause. */
  it("leaves a hands-free attempt to end on its own", async () => {
    const onFinal = jest.fn();
    const { result } = await renderHook(() => useRecognizer({ onFinal }));
    await act(async () => { result.current.listen(); });
    await final("пока");
    await end();
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal.mock.calls[0][0]).toBe("пока");
  });
});
