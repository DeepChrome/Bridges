/* The player component around the WebView: what it hands the page, and what it
   keeps for a player that is not there yet. Whether YouTube obeys those calls
   is tools/yt_captions.mjs's question, against the real player; nothing here
   can answer it (CLAUDE.md §23: a mock proves the call, not the destination). */
import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";

jest.mock("react-native-webview", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { WebView: React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ injectJavaScript: global.__inject }));
    return React.createElement(View, { testID: "webview", ...props });
  }) };
});

import { YouTube } from "../src/youtube";

beforeEach(() => { global.__inject = jest.fn(); });

/* Every act is awaited: under React 19 a sync act still returns a thenable,
   and an unawaited scope leaks into the next test (RNTL warns, then `screen`
   is unbound there). Queries go through the render result for the same reason. */
const ready = (r, len = 60000) => act(async () => {
  fireEvent(r.getByTestId("webview"), "message",
            { nativeEvent: { data: JSON.stringify({ type: "ready", len }) } });
});

describe("the player page", () => {
  it("is built with the subtitle choice, so a page can start with them off", async () => {
    const r = await render(<YouTube videoId="abc" captions={false} />);
    const html = r.getByTestId("webview").props.source.html;
    expect(html).toMatch(/var wantCaptions = false;/);
    expect(html).toMatch(/cc_load_policy: 0,/);
    /* The page applies "off" itself when ready and when playing starts:
       cc_load_policy 0 is YouTube's default, which is on for a Russian video. */
    expect(html).toMatch(/onReady: function \(\) \{\s*if \(!wantCaptions\) applyCaptions\(\);/);
    expect(html).toMatch(/PLAYING && !wantCaptions\) applyCaptions\(\)/);
  });

  it("defaults to subtitles on", async () => {
    const r = await render(<YouTube videoId="abc" />);
    const html = r.getByTestId("webview").props.source.html;
    expect(html).toMatch(/var wantCaptions = true;/);
    expect(html).toMatch(/cc_load_policy: 1,/);
  });

  /* A switch flipped before the player exists reaches it when it does. */
  it("keeps a subtitle switch made before the player is ready", async () => {
    const ref = React.createRef();
    const r = await render(<YouTube ref={ref} videoId="abc" />);
    await act(async () => { ref.current.captions(false); });
    expect(global.__inject).not.toHaveBeenCalled();
    await ready(r);
    expect(global.__inject).toHaveBeenCalledWith(expect.stringContaining("window.brCaptions(false)"));
    // Once ready, a switch goes straight through.
    await act(async () => { ref.current.captions(true); });
    expect(global.__inject).toHaveBeenLastCalledWith(expect.stringContaining("window.brCaptions(true)"));
  });

  it("sends nothing about subtitles when none was asked for", async () => {
    const ref = React.createRef();
    const r = await render(<YouTube ref={ref} videoId="abc" />);
    await ready(r);
    expect(global.__inject.mock.calls.some(([js]) => /brCaptions/.test(js))).toBe(false);
  });
});
