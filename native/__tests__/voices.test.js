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

import { refreshVoices, castVoices, voiceSex } from "../src/audio";

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

afterEach(() => { global.__voices = undefined; });

describe("reading a voice", () => {
  it("believes the platform when it says which sex a voice is", () => {
    expect(voiceSex(MODERN[0])).toBe("f");
    expect(voiceSex(MODERN[1])).toBe("m");
  });

  it("knows the codes that were listened to, and no others", () => {
    /* The table in core/voices.js is not inference from the letters — it is
       what the owner heard on his own phone, every family twice. A code he
       never heard stays unknown, because the alternative is inventing it. */
    expect(voiceSex(V("ru-ru-x-ruf-local"))).toBe("m");
    expect(voiceSex(V("ru-ru-x-rue-network"))).toBe("f");
    expect(voiceSex(V("ru-ru-x-zzz-local"))).toBeNull();
    // The default alias is whatever *that* phone is set to, so it says nothing.
    expect(voiceSex(V("ru-RU-language"))).toBeNull();
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

/* The real phone: nineteen Russian voices, eight of them silent, none of them
   stating a sex. Listed in the order Android gave them, because that order is
   exactly what the app must not depend on. */
const PIXEL = [
  "ru-ru-x-rud-network", "ru-ru-x-ruf-local", "ru-ru-x-ruf-network",
  "ru-ru-x-star11-local", "ru-RU-language", "ru-ru-x-star04-local",
  "ru-ru-x-rue-local", "ru-ru-x-star12-local", "ru-ru-x-rue-network",
  "ru-ru-x-star05-local", "ru-ru-x-star08-local", "ru-ru-x-ruc-network",
  "ru-ru-x-rud-local", "ru-ru-x-star16-local", "ru-ru-x-star13-local",
  "ru-ru-x-dfc-network", "ru-ru-x-dfc-local", "ru-ru-x-star02-local",
  "ru-ru-x-ruc-local",
].map((id) => V(id, "Russian"));

describe("the owner's Pixel, which states nothing about any of them", () => {
  /* What he heard, 2026-09-11, tapping all nineteen: men 1, 2, 3, 13; women
     5, 7, 9, 12, 16, 17, 19; the other eight silent. core/voices.js is that
     answer, and these are the cases that would put it back the way it was. */
  it("gives the woman a woman and the man a man", async () => {
    await phoneHas(PIXEL);
    const [masha, oleg] = castVoices([MASHA, OLEG], "core1:0");
    expect(voiceSex({ identifier: masha.voice })).toBe("f");
    expect(voiceSex({ identifier: oleg.voice })).toBe("m");
    expect(masha.pitch).toBe(1);
    expect(oleg.pitch).toBe(1);
  });

  it("never casts a voice that says nothing", async () => {
    await phoneHas(PIXEL);
    // Every lesson, not one: a silent speaker is a scenario with a hole in it.
    for (const seed of ["core1:0", "family:2", "work:5", "law:3", "art:4"]) {
      castVoices([MASHA, OLEG, ANYA], seed).forEach((v) => {
        expect(v.voice).not.toMatch(/star/);
      });
    }
  });

  it("does not make every lesson sound like the same two people", async () => {
    await phoneHas(PIXEL);
    const women = new Set();
    ["core1:0", "core2:3", "food:1", "city:5", "emotion:2", "law:0"].forEach((seed) => {
      women.add(castVoices([MASHA, OLEG], seed)[0].voice);
    });
    expect(women.size).toBeGreaterThan(1);
  });

  it("gives a lesson the same voices every time it is played", async () => {
    await phoneHas(PIXEL);
    const once = castVoices([MASHA, OLEG], "family:2");
    const twice = castVoices([MASHA, OLEG], "family:2");
    expect(twice).toEqual(once);
  });

  it("prefers a voice that works without a connection", async () => {
    await phoneHas(PIXEL);
    // Both exist for every family; -local needs no network to speak.
    const [masha, oleg] = castVoices([MASHA, OLEG], "core1:0");
    expect(`${masha.voice} ${oleg.voice}`).toMatch(/-local/);
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
