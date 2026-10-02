/* The audio that went silent until a restart (the owner, 2026-10-02:
   "sometimes the audio just completely cuts out and I have to restart the
   app… for videos but also… when I press the audio button").

   Two causes, both held here: a recogniser left listening when its screen
   closed (an open recogniser on Android routes the phone's audio for voice,
   which mutes media), and an audio mode applied once per launch and never
   again, so whatever changed it stayed changed. */

import React from "react";
import { Pressable } from "react-native";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import { setAudioModeAsync } from "expo-audio";
import { ExpoSpeechRecognitionModule as M } from "expo-speech-recognition";

import { useRecognizer } from "../src/speech";
import { say, rearmAudio, releaseAudio } from "../src/audio";
import { Text } from "../src/ui";

function Mic() {
  const rec = useRecognizer({ onFinal: () => {} });
  return (
    <Pressable testID="listen" onPress={() => rec.listen()}>
      <Text>{rec.phase}</Text>
    </Pressable>
  );
}

beforeEach(() => { global.__stt.reset(); jest.clearAllMocks(); releaseAudio(); });

it("closing a screen with the microphone open lets the microphone go", async () => {
  const view = await render(<Mic />);
  await act(async () => { fireEvent.press(screen.getByTestId("listen")); });
  expect(global.__stt.calls).toHaveLength(1);
  expect(M.abort).not.toHaveBeenCalled();
  await act(async () => { view.unmount(); });
  expect(M.abort).toHaveBeenCalled();
});

it("the next sound after the recogniser lets go sets the audio up afresh", async () => {
  await say("кот");
  const before = setAudioModeAsync.mock.calls.length;
  await say("дом");
  expect(setAudioModeAsync.mock.calls.length).toBe(before);   // once per session, normally
  rearmAudio();                                               // what the recogniser's end does
  await say("кот");
  expect(setAudioModeAsync.mock.calls.length).toBe(before + 1);
});

it("the recogniser's end re-arms the audio", async () => {
  await render(<Mic />);
  await say("кот");
  const before = setAudioModeAsync.mock.calls.length;
  await act(async () => { global.__stt.emit("end", {}); });
  await say("дом");
  expect(setAudioModeAsync.mock.calls.length).toBe(before + 1);
});
