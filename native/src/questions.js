/* The shared question generators, bound to this platform's data and voice. */

import * as Speech from "expo-speech";
import { makeQuestions } from "@core/questions";
import { L, IX, UN, STAGES, lessonWords, lessonCount, SPEECH } from "./data";

/* expo-speech is always present on device, and real recordings cover most words
   anyway, so listening questions are always available here. */
export const Q = makeQuestions({
  L, IX, UN, STAGES, lessonWords, lessonCount, SPEECH,
  hasVoice: () => true,
});

export { DRILL_TYPES, PLACEMENT_N, SECTION_N, TEST_OUT, SPEECH_MIX } from "@core/questions";
