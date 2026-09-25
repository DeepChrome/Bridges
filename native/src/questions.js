/* The shared question generators, bound to this platform's data and voice. */

import { makeQuestions } from "@core/questions";
import { L, IX, UN, STAGES, lessonWords, lessonCount, SPEECH, SCRIPTS, PAIRS } from "./data";

/* expo-speech is always present on device, and real recordings cover most words
   anyway, so listening questions are always available here. */
export const Q = makeQuestions({
  L, IX, UN, STAGES, lessonWords, lessonCount, SPEECH, SCRIPTS, PAIRS,
  hasVoice: () => true,
});

export {
  DRILL_TYPES, DRILL_N, PLACEMENT_N, SECTION_N, TEST_OUT, SPEECH_MIX, FORM_MIX,
  QUIZ_KINDS, QUIZ_LENGTHS, FINAL_N,
} from "@core/questions";
