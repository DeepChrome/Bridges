/* The YouTube player on the desktop, in one place — the phone's
 * native/src/youtube.js on Electron.
 *
 * The same trick, for the same reason (§23): a player loaded as the top-level
 * document has no embedding page and refuses with a "configuration error", so
 * the player sits in a host page of ours, and the host page is given a real
 * https origin — `baseURLForDataURL`, Electron's name for what the phone's
 * WebView calls `baseUrl`. Measured here on 2026-11-07: a <webview> whose
 * host page is a data: URL with that base plays (ready, playing, the clock
 * advancing); the renderer itself is `ya://app`, which carries no referrer
 * and would be refused. The player's messages come out of the guest as
 * console lines prefixed `__yt `, because a guest page has no other channel
 * to its host without a preload of its own.
 */

import React, { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { Btn } from "./ui.jsx";

/* Owner-disabled embedding; nothing on our side changes these two. */
const NO_EMBED = new Set([101, 150]);
/* The origin the host page claims — the app's own web domain, never youtube.com. */
const ORIGIN = "https://bridges-jf.netlify.app";

const REASON = {
  [-1]: "The YouTube player could not be downloaded — check the connection.",
  0: "The YouTube player did not start.",
  2: "That video link is malformed.",
  5: "The player could not start here.",
  100: "That video is private or has been removed.",
  101: "The owner does not allow this video to be embedded.",
  150: "The owner does not allow this video to be embedded.",
};

const page = (videoId, captions) => `<!doctype html>
<html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;height:100%;background:#000;overflow:hidden}#player{width:100%;height:100%;border:0}</style>
</head><body><div id="player"></div>
<script>
  var player = null, holdTimer = null, ticker = null;
  function post(msg) { console.log("__yt " + JSON.stringify(msg)); }
  function onYouTubeIframeAPIReady() {
    player = new YT.Player("player", {
      videoId: ${JSON.stringify(videoId)},
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 0, fs: 0, iv_load_policy: 3, disablekb: 1,
                    cc_load_policy: ${captions ? 1 : 0}, cc_lang_pref: "ru", hl: "ru", origin: ${JSON.stringify(ORIGIN)} },
      events: {
        onReady: function () { post({ type: "ready", len: player.getDuration ? Math.round(player.getDuration() * 1000) : 0 }); },
        onStateChange: function (e) {
          if (e.data === YT.PlayerState.ENDED) post({ type: "ended" });
          if (e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED)
            post({ type: "state", playing: e.data === YT.PlayerState.PLAYING });
        },
        onPlaybackRateChange: function (e) { post({ type: "rate", rate: e.data }); },
        onError: function (e) { post({ type: "error", code: e.data }); }
      }
    });
  }
  window.brSeek = function (seconds, holdMs) {
    if (!player) return;
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    player.seekTo(Math.max(0, seconds), true); player.playVideo();
    if (holdMs > 0) holdTimer = setTimeout(function () { if (player) player.pauseVideo(); post({ type: "held" }); }, holdMs);
  };
  window.brPause = function () { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } if (player) player.pauseVideo(); };
  window.brPlay = function () { if (player) player.playVideo(); };
  window.brWatch = function (on) {
    if (ticker) { clearInterval(ticker); ticker = null; }
    if (!on) return;
    ticker = setInterval(function () {
      if (!player || !player.getCurrentTime) return;
      post({ type: "time", at: Math.round(player.getCurrentTime() * 1000), len: player.getDuration ? Math.round(player.getDuration() * 1000) : 0 });
    }, 250);
  };
  window.brSkip = function (deltaSeconds) {
    if (!player || !player.getCurrentTime) return;
    var at = player.getCurrentTime() + deltaSeconds, hi = player.getDuration ? player.getDuration() : 0;
    if (at < 0) at = 0; if (hi > 0 && at > hi) at = hi;
    player.seekTo(at, true);
  };
  window.brToggle = function () {
    if (!player || !player.getPlayerState) return;
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    if (player.getPlayerState() === YT.PlayerState.PLAYING) player.pauseVideo(); else player.playVideo();
  };
  window.brRate = function (rate) { if (player && player.setPlaybackRate) player.setPlaybackRate(rate); };
  window.brCaptions = function (on) {
    if (!player || !player.loadModule) return;
    try { if (on) { player.loadModule("captions"); player.setOption("captions", "track", { languageCode: "ru" }); } else player.unloadModule("captions"); }
    catch (e) { post({ type: "log", what: "captions: " + e.message }); }
  };
  window.brSeekTo = function (seconds) {
    if (!player || !player.seekTo) return;
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    player.seekTo(Math.max(0, seconds), true);
  };
  window.addEventListener("error", function (e) { post({ type: "log", what: "js error: " + (e.message || "?") }); });
  setTimeout(function () { if (!player) post({ type: "error", code: window.YT ? 0 : -1 }); }, 12000);
<\/script>
<script src="https://www.youtube.com/iframe_api" onerror="post({ type: 'error', code: -1 })"><\/script>
</body></html>`;

export const YouTubePlayer = forwardRef(function YouTubePlayer(
  { videoId, captions = true, onReady, onEnded, onError, onTime, onState, onRate }, ref,
) {
  const el = useRef(null);
  const box = useRef(null);
  const isReady = useRef(false);
  /* The guest's viewport follows the element's size in pixels, not a
     percentage: at attach time a percentage had not resolved and the player
     sat at the replaced element's default 300×150 until the next relayout
     (read off the first walkthrough shot, 2026-11-07). */
  useLayoutEffect(() => {
    const b = box.current, w = el.current;
    if (!b || !w) return undefined;
    const fit = () => { w.style.width = `${b.clientWidth}px`; w.style.height = `${b.clientHeight}px`; };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(b);
    return () => ro.disconnect();
  }, []);
  const queued = useRef(null);
  const [failed, setFailed] = useState(null);
  const [loading, setLoading] = useState(true);
  const cb = useRef({});
  cb.current = { onReady, onEnded, onError, onTime, onState, onRate };

  const run = (code) => {
    const w = el.current;
    if (!w || !isReady.current) return;
    try { w.executeJavaScript(code + "; true").catch(() => {}); } catch (e) { /* guest gone */ }
  };
  const runSeek = (ms, holdMs) => run(`window.brSeek(${(ms || 0) / 1000}, ${holdMs || 0})`);

  useEffect(() => {
    const w = el.current;
    if (!w) return undefined;
    isReady.current = false;
    setFailed(null); setLoading(true);
    const onConsole = (e) => {
      const line = String(e.message || "");
      if (!line.startsWith("__yt ")) return;
      let msg = null;
      try { msg = JSON.parse(line.slice(5)); } catch (err) { return; }
      const c = cb.current;
      if (msg.type !== "time" && msg.type !== "state") console.log("[youtube]", line.slice(5));
      if (msg.type === "ready") {
        isReady.current = true; setLoading(false);
        if (queued.current) { runSeek(queued.current[0], queued.current[1]); queued.current = null; }
        run("window.brWatch(true)");
        c.onReady && c.onReady(msg.len || 0);
      } else if (msg.type === "time") c.onTime && c.onTime(msg.at, msg.len || 0);
      else if (msg.type === "state") c.onState && c.onState(msg.playing);
      else if (msg.type === "rate") c.onRate && c.onRate(msg.rate);
      else if (msg.type === "held" || msg.type === "ended") c.onEnded && c.onEnded(msg.type);
      else if (msg.type === "error") { setLoading(false); setFailed(msg.code); c.onError && c.onError(msg.code, NO_EMBED.has(msg.code)); }
    };
    /* The guest attaches on about:blank; the host page is loaded over it with
       its base, once. */
    const onBlank = () => {
      if (w.getURL() !== "about:blank") return;
      w.removeEventListener("did-finish-load", onBlank);
      w.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(page(videoId, captions)), { baseURLForDataURL: ORIGIN + "/" })
        .catch((e) => console.log("[youtube] host page:", e && e.message));
    };
    w.addEventListener("console-message", onConsole);
    w.addEventListener("did-finish-load", onBlank);
    return () => {
      w.removeEventListener("console-message", onConsole);
      w.removeEventListener("did-finish-load", onBlank);
    };
    // The page is built once per video: captions change through `captions()`, not a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  useImperativeHandle(ref, () => ({
    seek(ms, holdMs = 0) { if (!isReady.current) { queued.current = [ms, holdMs]; return; } runSeek(ms, holdMs); },
    seekTo(ms) { run(`window.brSeekTo(${(ms || 0) / 1000})`); },
    skip(deltaMs) { run(`window.brSkip(${deltaMs / 1000})`); },
    pause() { run("window.brPause()"); },
    play() { run("window.brPlay()"); },
    toggle() { run("window.brToggle()"); },
    rate(r) { run(`window.brRate(${Number(r)})`); },
    captions(on) { run(`window.brCaptions(${on ? "true" : "false"})`); },
  }), []);

  if (failed !== null) {
    return (
      <div className="yt-fail">
        <div>{REASON[failed] || "The video could not be played here."}</div>
        <div className="muted" style={{ color: "#8a8a8a" }}>{`error ${failed}`}</div>
        <Btn label="Open in YouTube" onClick={() => window.ya.app.open(`https://www.youtube.com/watch?v=${videoId}`)} />
      </div>
    );
  }
  return (
    <div className="yt" ref={box}>
      <webview ref={el} src="about:blank" className="yt-guest" />
      {loading ? <div className="yt-wait">…</div> : null}
    </div>
  );
});
