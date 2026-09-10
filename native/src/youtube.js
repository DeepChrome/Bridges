/* The YouTube player, in one place.
 *
 * Pointing a WebView straight at youtube.com/embed/ID fails: the player is loaded as
 * the top-level document, so it has no embedding page and no origin to check, and it
 * refuses with "video player configuration error" and an invitation to watch on
 * YouTube. The fix is to serve a real host page — an iframe inside our own HTML, with
 * `baseUrl` giving the document a genuine origin that `origin` in the player vars
 * agrees with.
 *
 * That origin must NOT be youtube.com. The player refuses to be embedded on YouTube's
 * own domain and answers with error 152, after reaching "ready" so it looks like it
 * worked right up until it doesn't. Measured across four origins and two videos: only
 * www.youtube.com failed; netlify.app, localhost and example.org all played. Use the
 * app's own domain — see tools/ytorigins probe in the commit that added this.
 *
 * It loads the IFrame Player API rather than a bare iframe because the video-recall
 * activity has to seek: "you missed этаж — here is where it was said." A plain iframe
 * cannot be told to jump to 4:12 and stop ten seconds later.
 *
 * Some videos genuinely cannot be embedded — the owner disables it, and errors 101
 * and 150 mean exactly that. That is not a bug to work around; the player says so and
 * offers the YouTube app.
 */

import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { View, Text, Pressable, Linking, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";

/* Owner-disabled embedding. Nothing we do on our side changes these two. */
const NO_EMBED = new Set([101, 150]);

/* The origin the player page claims. Any real domain that is not youtube.com works;
   this is the app's own, so the referrer YouTube records is honest. */
const ORIGIN = "https://bridges-jf.netlify.app";

/* YouTube's own codes, plus two of ours for the failures that happen before the
   player exists and so can never produce a YouTube code at all. */
const REASON = {
  [-1]: "The YouTube player could not be downloaded — check the connection.",
  0: "The YouTube player did not start.",
  2: "That video link is malformed.",
  5: "The player could not start on this device.",
  100: "That video is private or has been removed.",
  101: "The owner does not allow this video to be embedded.",
  150: "The owner does not allow this video to be embedded.",
};

const page = (videoId) => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  html, body { margin:0; padding:0; height:100%; background:#000; overflow:hidden; }
  #player { width:100%; height:100%; border:0; }
</style>
</head>
<body>
<div id="player"></div>
<script>
  var player = null;
  var holdTimer = null;

  function post(msg) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    }
  }

  function onYouTubeIframeAPIReady() {
    player = new YT.Player("player", {
      videoId: ${JSON.stringify(videoId)},
      playerVars: {
        playsinline: 1,
        rel: 0,
        modestbranding: 1,
        origin: ${JSON.stringify(ORIGIN)}
      },
      events: {
        onReady: function () { post({ type: "ready" }); },
        onStateChange: function (e) {
          if (e.data === YT.PlayerState.ENDED) post({ type: "ended" });
        },
        onError: function (e) { post({ type: "error", code: e.data }); }
      }
    });
  }

  /* Seek to a moment and optionally stop after a while — the recall replay is
     "five seconds before the word, then ten seconds of it", not the whole rest
     of the video. */
  window.brSeek = function (seconds, holdMs) {
    if (!player) return;
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    player.seekTo(Math.max(0, seconds), true);
    player.playVideo();
    if (holdMs > 0) {
      holdTimer = setTimeout(function () {
        if (player) player.pauseVideo();
        post({ type: "held" });
      }, holdMs);
    }
  };

  window.brPause = function () {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    if (player) player.pauseVideo();
  };

  /* A listening passage needs the position, not just the ability to jump to one:
     the learner skips five seconds back from wherever they are, and the bar has
     to move while it plays. Polled rather than pushed - the IFrame API has no
     time event - and only while playing, so a paused passage costs nothing. */
  var ticker = null;
  window.brWatch = function (on) {
    if (ticker) { clearInterval(ticker); ticker = null; }
    if (!on) return;
    ticker = setInterval(function () {
      if (!player || !player.getCurrentTime) return;
      post({ type: "time", at: Math.round(player.getCurrentTime() * 1000) });
    }, 250);
  };

  /* Seek without restarting the hold timer: skipping inside a passage must not
     extend or cancel the stop at its end. */
  window.brSkip = function (deltaSeconds, lo, hi) {
    if (!player || !player.getCurrentTime) return;
    var at = player.getCurrentTime() + deltaSeconds;
    if (at < lo) at = lo;
    if (at > hi) at = hi;
    player.seekTo(at, true);
  };

  /* Distinguish the three ways this fails before a player exists, because they
     have different fixes: the script never arrived, the script arrived but the
     API never called us back, or the page itself threw. */
  window.addEventListener("error", function (e) {
    post({ type: "log", what: "js error: " + (e.message || "?") });
  });

  setTimeout(function () {
    if (!player) post({ type: "error", code: window.YT ? 0 : -1 });
  }, 12000);
</script>
<script
  src="https://www.youtube.com/iframe_api"
  onerror="post({ type: 'error', code: -1 })"
  onload="post({ type: 'log', what: 'iframe_api loaded' })"></script>
</body>
</html>`;

export const YouTube = forwardRef(function YouTube(
  { videoId, onReady, onEnded, onError, onTime, theme }, ref
) {
  const web = useRef(null);
  const isReady = useRef(false);
  const queued = useRef(null);
  const [failed, setFailed] = useState(null);
  const [loading, setLoading] = useState(true);

  const runSeek = (ms, holdMs) => {
    web.current.injectJavaScript(
      `window.brSeek(${(ms || 0) / 1000}, ${holdMs}); true;`
    );
  };

  useImperativeHandle(ref, () => ({
    /* Milliseconds in, because that is what the transcript index stores.
       A seek asked for before the player exists is held, not dropped: the WebView
       mounts instantly but the player takes a second or two, and that gap is
       exactly when a learner taps a word. */
    seek(ms, holdMs = 0) {
      if (!web.current) return;
      if (!isReady.current) { queued.current = [ms, holdMs]; return; }
      runSeek(ms, holdMs);
    },
    pause() {
      if (!web.current) return;
      web.current.injectJavaScript("window.brPause(); true;");
    },
    /* Skip within a passage, clamped to its own span so five seconds back at the
       start does not drop the learner into the middle of the video before it. */
    skip(deltaMs, loMs, hiMs) {
      if (!web.current || !isReady.current) return;
      web.current.injectJavaScript(
        `window.brSkip(${deltaMs / 1000}, ${(loMs || 0) / 1000}, ${(hiMs || 0) / 1000}); true;`);
    },
    /* Start or stop the position reports that feed onTime. */
    watch(on) {
      if (!web.current) return;
      web.current.injectJavaScript(`window.brWatch(${on ? "true" : "false"}); true;`);
    },
  }), []);

  if (failed !== null) {
    const why = REASON[failed] || "The video could not be played here.";
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center",
                     padding: 20, backgroundColor: "#000" }}>
        <Text style={{ color: "#fff", fontSize: 14, textAlign: "center",
                       marginBottom: 6 }}>
          {why}
        </Text>
        <Text style={{ color: "#8a8a8a", fontSize: 11, marginBottom: 14 }}>
          {`error ${failed}`}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${videoId}`)}
          style={{ paddingHorizontal: 18, paddingVertical: 12, borderRadius: 99,
                   backgroundColor: "#fff" }}
        >
          <Text style={{ color: "#000", fontWeight: "700" }}>Open in YouTube</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <WebView
        ref={web}
        source={{ html: page(videoId), baseUrl: ORIGIN }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        setSupportMultipleWindows={false}
        style={{ backgroundColor: "#000" }}
        onMessage={(e) => {
          let msg = null;
          try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
          // Onto the Metro console: a player that fails on the device cannot be
          // debugged from the machine any other way. Position reports are the one
          // exception — four a second would bury everything else.
          if (msg.type !== "time") console.log("[youtube]", JSON.stringify(msg));
          if (msg.type === "ready") {
            isReady.current = true;
            setLoading(false);
            if (queued.current) {
              runSeek(queued.current[0], queued.current[1]);
              queued.current = null;
            }
            onReady && onReady();
          }
          else if (msg.type === "time") { onTime && onTime(msg.at); }
          else if (msg.type === "held") { onEnded && onEnded(); }
          else if (msg.type === "ended") { onEnded && onEnded(); }
          else if (msg.type === "error") {
            setLoading(false);
            setFailed(msg.code);
            onError && onError(msg.code, NO_EMBED.has(msg.code));
          }
        }}
      />
      {loading ? (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                       alignItems: "center", justifyContent: "center" }}
              pointerEvents="none">
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}
    </View>
  );
});

export default YouTube;
