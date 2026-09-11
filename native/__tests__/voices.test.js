/* Which voice each character gets.
 *
 * The owner, on the first build that reached his phone: *"They sound slightly
 * different but Masha clearly sounds like a guy instead of a girl."* The cast
 * was being handed the phone's Russian voices in the order Android listed
 * them, which is related to nothing — whoever spoke first got voice zero.
 *
 * None of this is visible in a render tree and none of it can be heard in a
 * test, so what is asserted is the assignment itself: who gets which voice and
 * at what pitch, against a phone whose voice list the test controls.
 */

import { refreshVoices, castVoices, voiceSex, configureAudio } from "../src/audio";

// The language is what the probe filters on, so it has to be the real one: a
// test that labels an English voice "ru-RU" is testing nothing.
const V = (identifier, name) => ({
  identifier, name, quality: "Default",
  language: identifier.startsWith("ru") ? "ru-RU" : "en-US",
});

/* The shapes Android and iOS actually produce. Google's modern names carry the
   sex outright; its older ones carry an opaque three-letter code that does
   not. */
const MODERN = [
  V("ru-ru-x-ruf#female_1-local", "Russian female"),
  V("ru-ru-x-rum#male_1-local", "Russian male"),
  V("ru-ru-x-dfc#female_2-local", "Russian female 2"),
  V("en-us-x-sfg#female_1-local", "English"),
];
const OPAQUE = [
  V("ru-ru-x-ruf-local", "Russian"),
  V("ru-ru-x-rum-local", "Russian"),
];
const ONE_MALE = [V("ru-ru-x-rum#male_1-local", "Russian male")];

async function phoneHas(voices) {
  global.__voices = voices;
  await refreshVoices();
}

const MASHA = { id: "a", ru: "Маша", en: "Masha" };
const OLEG = { id: "b", ru: "Олег", en: "Oleg" };
const ANYA = { id: "c", ru: "Аня", en: "Anya" };

afterEach(() => {
  global.__voices = undefined;
  configureAudio({ voices: {} });
});

describe("reading a voice", () => {
  it("believes the platform when it says which sex a voice is", () => {
    expect(voiceSex(MODERN[0])).toBe("f");
    expect(voiceSex(MODERN[1])).toBe("m");
  });

  it("says it does not know rather than guessing from a code", () => {
    // «ruf» and «rum» look like they might mean something. They are opaque,
    // and inventing sex from them would be inventing data.
    expect(voiceSex(OPAQUE[0])).toBeNull();
    expect(voiceSex(OPAQUE[1])).toBeNull();
    expect(voiceSex(undefined)).toBeNull();
  });
});

describe("a cast on a phone that has both", () => {
  it("gives the woman a woman's voice and the man a man's", async () => {
    await phoneHas(MODERN);
    const [masha, oleg] = castVoices([MASHA, OLEG]);
    expect(voiceSex({ identifier: masha.voice })).toBe("f");
    expect(voiceSex({ identifier: oleg.voice })).toBe("m");
    // A real voice of the right sex needs no help from pitch.
    expect(masha.pitch).toBe(1);
    expect(oleg.pitch).toBe(1);
  });

  it("does not put two speakers on one voice while another is free", async () => {
    await phoneHas(MODERN);
    const [masha, oleg, anya] = castVoices([MASHA, OLEG, ANYA]);
    expect(new Set([masha.voice, oleg.voice, anya.voice]).size).toBe(3);
    // Both women get women's voices; they are different women.
    expect(voiceSex({ identifier: anya.voice })).toBe("f");
  });

  it("never reaches for a voice in another language", async () => {
    await phoneHas(MODERN);
    castVoices([MASHA, OLEG, ANYA]).forEach((v) => {
      expect(v.voice).toMatch(/^ru/);
    });
  });
});

describe("a cast on a phone that only has one voice", () => {
  it("still separates them, and points the pitch the right way", async () => {
    await phoneHas(ONE_MALE);
    const [masha, oleg] = castVoices([MASHA, OLEG]);
    expect(masha.voice).toBe(oleg.voice);          // there is only the one
    expect(masha.pitch).toBeGreaterThan(oleg.pitch);
    // The man has the voice that is actually his: it is not pitched about.
    expect(oleg.pitch).toBe(1);
    expect(masha.pitch).toBeGreaterThan(1);
  });

  it("keeps pitch inside what the platform will speak", async () => {
    await phoneHas(ONE_MALE);
    castVoices([MASHA, OLEG, ANYA]).forEach((v) => {
      expect(v.pitch).toBeGreaterThan(0.5);
      expect(v.pitch).toBeLessThan(2);
    });
  });
});

describe("a cast on a phone that will not say", () => {
  it("shares the voices out and separates by pitch", async () => {
    await phoneHas(OPAQUE);
    const [masha, oleg] = castVoices([MASHA, OLEG]);
    // Two voices, two speakers: one each, whatever they turn out to sound like.
    expect(masha.voice).not.toBe(oleg.voice);
    // Neither is known to be right, so the direction is still applied.
    expect(masha.pitch).toBeGreaterThan(oleg.pitch);
  });
});

describe("a phone with no Russian at all", () => {
  it("asks for nothing rather than for the wrong language", async () => {
    await phoneHas([V("en-us-x-sfg#female_1-local", "English")]);
    castVoices([MASHA, OLEG]).forEach((v) => {
      expect(v.voice).toBeNull();
      expect(v.language).toBe("ru-RU");
    });
  });
});

describe("when the learner has said which voice is which", () => {
  /* The case that matters on a real phone. Nineteen Russian voices, not one of
     them stating its sex, so the only source is his ear — and once he has
     used it, nothing else gets a say. */
  it("uses their choice, unpitched, over anything the platform implies", async () => {
    await phoneHas(OPAQUE);
    configureAudio({ voices: { f: "ru-ru-x-ruf-local", m: "ru-ru-x-rum-local" } });
    const [masha, oleg] = castVoices([MASHA, OLEG]);
    expect(masha.voice).toBe("ru-ru-x-ruf-local");
    expect(oleg.voice).toBe("ru-ru-x-rum-local");
    expect(masha.pitch).toBe(1);
    expect(oleg.pitch).toBe(1);
  });

  it("beats a marker in the identifier, because the marker can be wrong", async () => {
    await phoneHas(MODERN);
    configureAudio({ voices: { f: "ru-ru-x-rum#male_1-local" } });
    expect(voiceSex(MODERN[1])).toBe("f");
    const [masha] = castVoices([MASHA]);
    expect(masha.voice).toBe("ru-ru-x-rum#male_1-local");
    expect(masha.pitch).toBe(1);
  });

  it("still separates two women who share the one chosen voice", async () => {
    await phoneHas(OPAQUE);
    configureAudio({ voices: { f: "ru-ru-x-ruf-local" } });
    const [masha, anya] = castVoices([MASHA, ANYA]);
    expect(masha.voice).toBe("ru-ru-x-ruf-local");
    expect(`${anya.voice}|${anya.pitch}`).not.toBe(`${masha.voice}|${masha.pitch}`);
  });
});

describe("a corpus scene, which has no cast", () => {
  it("is read by one voice and asks for no pitch", async () => {
    await phoneHas(MODERN);
    const [only] = castVoices([{}]);
    expect(only.voice).toMatch(/^ru/);
    expect(only.pitch).toBe(1);
  });
});
