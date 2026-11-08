/* Videos: the library, and an episode beside its live transcript.
 *
 * The desktop's shape of Immerse → Video on the phone, laid out for a wide
 * window: the picture and its transport on the left with the words the video
 * says under them, the transcript running down the right and following the
 * sound — the line being said lifted out, the word inside it picked out, a
 * click on any line playing from there, and a click on any word opening the
 * inspector with the video paused. The library, the transcript's rules and
 * the words-it-says list are the phone's own (native/src/video.js,
 * captions.js, wordgroups.js), so both apps say the same thing about a video.
 *
 * Keys: Space play/pause · ← → five seconds · − + speed · E English ·
 * F follow · Esc back to the library. */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "../session.jsx";
import { useInspector, Linked, linkable, entryOf } from "../words.jsx";
import { useKeys } from "../keys.js";
import { Btn, Pill, Muted, Row, List, Ring, Icon, ICONS, IconButton, Switch, Seg } from "../ui.jsx";
import { YouTubePlayer } from "../youtube.jsx";
import { videos, videoById, videoWatched, unitById, transcriptOf, transcriptEnOf, markComponent, L, idxOfWord, rankOf, CHANNELS }
  from "../../../../native/src/data.js";
import { short, minutes, clock, isFave, toggleFave, VIDEO_SORTS, searchVideos, channelsOf } from "../../../../native/src/video.js";
import { lineAt, wordAt, soundLabel, soundOnlyEnglish } from "../../../../native/src/captions.js";
import { clusterWords } from "../../../../native/src/wordgroups.js";
import { familiarity, cardFor } from "@core/scheduler";
import { firstSense, today } from "@core/util";

const FILTERS = [
  { id: "all", name: "All" }, { id: "unwatched", name: "Unwatched" }, { id: "watched", name: "Watched" }, { id: "faves", name: "Favorites" },
];
const ALL = "all";
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SKIP_MS = 5000;
/* Five seconds of lead-in and ten of playback when a word is the reason the
   video was opened; a sentence is played from a breath before it and not
   stopped (the phone's LEAD_MS, HOLD_MS, LINE_LEAD_MS). */
const LEAD_MS = 5000, HOLD_MS = 10000, LINE_LEAD_MS = 800;
/* A position within this much of either end is not kept (immerse.js EDGE_MS). */
const EDGE_MS = 15000;

const thumbUrl = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

/* The library's own memory — its filters, and where each video was stopped —
   is this computer's (localStorage), not the profile's: a scroll offset is
   not learner state (§30bo). */
const LIB_KEY = "ya.videos.lib";
const posKey = (id) => `ya.videos.pos.${id}`;
const readLib = () => { try { return JSON.parse(localStorage.getItem(LIB_KEY) || "{}") || {}; } catch (e) { return {}; } };
const writeLib = (patch) => { try { localStorage.setItem(LIB_KEY, JSON.stringify({ ...readLib(), ...patch })); } catch (e) { /* no storage */ } };
const readPos = (id) => { try { return Number(localStorage.getItem(posKey(id))) || 0; } catch (e) { return 0; } };
const writePos = (id, ms, len) => {
  try {
    if (ms < EDGE_MS || (len > 0 && len - ms < EDGE_MS)) localStorage.removeItem(posKey(id));
    else localStorage.setItem(posKey(id), String(Math.round(ms)));
  } catch (e) { /* no storage */ }
};

/* What the screen shows for a video: the library entry, or for a unit's
   episode the entry with the unit's own heard words first (the phone's
   `videoFor`). Never a word it does not say. */
function videoFor(id) {
  let v = videoById(id);
  if (!v) return null;
  const owner = v.unit ? unitById(v.unit) : null;
  if (owner && owner.v && owner.v.id === v.id && owner.v.heard) {
    const words = { ...owner.v.heard };
    for (const w in (v.words || {})) if (!(w in words)) words[w] = v.words[w];
    v = { ...v, words };
  }
  return v;
}

export function Videos({ go, sub }) {
  const [open, setOpen] = useState(() => (sub && sub.videoId ? sub : null));
  useEffect(() => { if (sub && sub.videoId) setOpen(sub); }, [sub]);
  if (open) return <Workspace params={open} onBack={() => setOpen(null)} />;
  return <Library onOpen={(videoId) => setOpen({ videoId })} />;
}

/* ------------------------------------------------------------- library */

function Library({ onOpen }) {
  const { st, update } = useSession();
  const [lib, setLibState] = useState(() => ({ q: "", filter: "all", channel: ALL, sort: "level", ...readLib() }));
  const setLib = (patch) => { setLibState((s) => ({ ...s, ...patch })); writeLib(patch); };
  const all = useMemo(() => videos(), []);
  const channels = useMemo(() => channelsOf(all), [all]);
  const list = useMemo(() => {
    const found = searchVideos(all, lib.q, lib.sort);
    const byChannel = lib.channel === ALL ? found : found.filter((v) => v.ch === lib.channel);
    if (lib.filter === "faves") return byChannel.filter((v) => isFave(st, v.id));
    if (lib.filter === "all") return byChannel;
    return byChannel.filter((v) => videoWatched(st, v) === (lib.filter === "watched"));
  }, [all, lib.q, lib.sort, lib.channel, lib.filter, st.watched, st.unit, st.faves]);
  const [credits, setCredits] = useState(false);
  return (
    <div className="pane-inner wide" style={{ maxWidth: 1100 }}>
      <div className="hrow" style={{ gap: 14, flexWrap: "wrap" }}>
        <h1 style={{ flex: 1, margin: 0 }}>Videos</h1>
        <Seg value={lib.filter} options={FILTERS} onChange={(filter) => setLib({ filter })} />
        <select className="select" value={lib.channel} onChange={(e) => setLib({ channel: e.target.value })} aria-label="Channel">
          <option value={ALL}>All channels</option>
          {channels.map((c) => <option key={c.name} value={c.name}>{c.name} · {c.count}</option>)}
        </select>
        <select className="select" value={lib.sort} onChange={(e) => setLib({ sort: e.target.value })} aria-label="Order">
          {VIDEO_SORTS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <input className="field sm" style={{ marginTop: 14 }} placeholder="A title, a topic, a Russian word…" value={lib.q}
             onChange={(e) => setLib({ q: e.target.value })} spellCheck={false} />
      <div className="vid-grid">
        {list.map((v) => {
          const watched = videoWatched(st, v);
          const unit = v.unit ? unitById(v.unit) : null;
          const at = readPos(v.id);
          return (
            <div key={v.id} className="vid-card" role="button" tabIndex={0} onClick={() => onOpen(v.id)}
                 onKeyDown={(e) => { if (e.key === "Enter") onOpen(v.id); }}>
              <div className={"vid-thumb" + (watched ? " done" : "")}>
                <img src={thumbUrl(v.id)} alt="" loading="lazy" />
                <span className="vid-len">{minutes(v.dur)}</span>
                {watched ? <span className="vid-tick">✓</span> : null}
              </div>
              <div className="vid-title">{short(v.title)}</div>
              <div className="vid-sub">
                <span>{v.ch}</span>
                {unit ? <Pill tone="brand">{unit.name}</Pill> : null}
                {!watched && at ? <span className="muted">stopped at {clock(at)}</span> : null}
                <button type="button" className={"heart" + (isFave(st, v.id) ? " on" : "")} title={isFave(st, v.id) ? "Remove from favorites" : "Add to favorites"}
                        onClick={(e) => { e.stopPropagation(); update((p) => toggleFave(p, v.id)); }}>♥</button>
              </div>
            </div>
          );
        })}
        {!list.length ? (
          <div className="empty" style={{ gridColumn: "1 / -1" }}>
            {lib.q ? "Nothing matches" : lib.filter === "watched" ? "Nothing watched yet" : lib.filter === "faves" ? "No favorites yet" : "Everything watched"}
          </div>
        ) : null}
      </div>
      {/* The creators (§30as): the works are theirs; this is where to support them. */}
      <div style={{ marginTop: 28 }}>
        <button type="button" className="link" onClick={() => setCredits(!credits)}>{credits ? "Hide the creators" : "The creators"}</button>
        {credits ? (
          <List>
            {CHANNELS.map((c) => (
              <Row key={c.name}>
                <div style={{ flex: 1 }}><b>{c.name}</b></div>
                {c.url ? <button type="button" className="link" onClick={() => window.ya.app.open(c.url)}>YouTube</button> : null}
                {c.patreon ? <button type="button" className="link" onClick={() => window.ya.app.open(c.patreon)}>Patreon</button> : null}
                {c.site ? <button type="button" className="link" onClick={() => window.ya.app.open(c.site)}>Site</button> : null}
              </Row>
            ))}
          </List>
        ) : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- workspace */

function Workspace({ params, onBack }) {
  const { st, update } = useSession();
  const { open: openWord, current: inspecting } = useInspector();
  const v = useMemo(() => videoFor(params.videoId), [params.videoId]);
  const player = useRef(null);
  const [pos, setPos] = useState(0);
  const [len, setLen] = useState(v && v.dur ? v.dur * 1000 : 0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [captions, setCaptions] = useState(() => readLib().cc !== false);
  const [showEn, setShowEn] = useState(() => readLib().en !== false);
  const [follow, setFollow] = useState(true);
  const [ready, setReady] = useState(false);
  const scroller = useRef(null);
  const lastAt = useRef(0);

  /* Opened at a word's moment: the run-up, then ten seconds of it. Opened at
     a sentence: from a breath before, and on. Otherwise where it was stopped. */
  const start = useMemo(() => {
    if (params.word && typeof params.at === "number") return [Math.max(0, params.at - LEAD_MS), HOLD_MS];
    if (typeof params.at === "number") return [Math.max(0, params.at - LINE_LEAD_MS), 0];
    const at = v ? readPos(v.id) : 0;
    return at ? [at, 0] : null;
  }, [params.videoId]);
  const resumed = !!(start && !params.word && typeof params.at !== "number");

  const script = useMemo(() => (v ? transcriptOf(v.id) : null), [v && v.id]);
  const en = useMemo(() => (v && showEn ? transcriptEnOf(v.id) : null), [v && v.id, showEn]);
  const at = script ? lineAt(script, pos) : -1;
  const word = at >= 0 ? wordAt(script[at], pos) : -1;

  useEffect(() => {
    if (!follow || at < 0 || !scroller.current) return;
    const el = scroller.current.querySelector(`[data-line="${at}"]`);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [at, follow]);

  const onTime = (ms, l) => {
    lastAt.current = ms;
    setPos(ms);
    if (l > 0 && l !== len) setLen(l);
    if (v) writePos(v.id, ms, l || len);
  };
  const seekTo = (ms) => { setPos(ms); if (player.current) player.current.seek(ms, 0); };
  const step = (d) => {
    const k = Math.max(0, SPEEDS.indexOf(rate));
    const next = SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, k + d))];
    if (next === rate) return;
    setRate(next);
    if (player.current) player.current.rate(next);
  };
  const setCc = (on) => { setCaptions(on); writeLib({ cc: on }); if (player.current) player.current.captions(on); };
  const setEn = (on) => { setShowEn(on); writeLib({ en: on }); };
  const onWordClick = () => { if (player.current) player.current.pause(); };

  useKeys({
    " ": () => player.current && player.current.toggle(),
    "ArrowLeft": () => player.current && player.current.skip(-SKIP_MS),
    "ArrowRight": () => player.current && player.current.skip(SKIP_MS),
    "-": () => step(-1), "=": () => step(1), "+": () => step(1),
    "e": () => setEn(!showEn), "f": () => setFollow(!follow),
    // Esc closes the inspector first (App.jsx), and leaves the video only once it is shut.
    "Escape": () => { if (!inspecting) onBack(); },
  }, [rate, showEn, follow, inspecting]);

  if (!v) return <div className="pane-inner"><div className="empty">That video is not in the library.</div></div>;
  const unit = v.unit ? unitById(v.unit) : null;
  const watched = videoWatched(st, v);
  const own = !!(unit && unit.v && unit.v.id === v.id);
  const markWatched = () => update((s) => {
    const next = { ...s, watched: { ...(s.watched || {}), [v.id]: today() } };
    return own ? markComponent(next, unit, 0, "video") : next;
  });

  return (
    <div className="video-ws">
      <div className="video-main">
        <div className="hrow" style={{ gap: 10 }}>
          <IconButton d={ICONS.back} title="Back to the library (Esc)" onClick={onBack} size={34} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="video-title">{short(v.title)}</div>
            <Muted>{[v.ch, minutes(v.dur), unit ? unit.name : null, watched ? "watched" : null].filter(Boolean).join(" · ")}</Muted>
          </div>
          <button type="button" className={"heart big" + (isFave(st, v.id) ? " on" : "")} title={isFave(st, v.id) ? "Remove from favorites" : "Add to favorites"}
                  onClick={() => update((p) => toggleFave(p, v.id))}>♥</button>
        </div>
        <div className="video-frame">
          <YouTubePlayer key={v.id} ref={player} videoId={v.id} captions={captions}
                         onReady={(l) => {
                           setReady(true);
                           if (l > 0) setLen(l);
                           if (start && player.current) player.current.seek(start[0], start[1]);
                           else if (player.current) player.current.play();
                         }}
                         onTime={onTime} onState={setPlaying} onRate={setRate} />
        </div>
        <div className="video-transport">
          <IconButton title="Back 5 seconds (←)" onClick={() => player.current && player.current.skip(-SKIP_MS)}><span className="tiny">−5s</span></IconButton>
          <IconButton title={playing ? "Pause (Space)" : "Play (Space)"} onClick={() => player.current && player.current.toggle()} size={44} on>
            <Icon d={playing ? "M9 5v14M15 5v14" : "M7 5l12 7-12 7z"} size={22} stroke={playing} fill="currentColor" />
          </IconButton>
          <IconButton title="Forward 5 seconds (→)" onClick={() => player.current && player.current.skip(SKIP_MS)}><span className="tiny">+5s</span></IconButton>
          <span className="muted tabular">{clock(pos)} / {clock(len)}</span>
          <input type="range" className="scrub" min={0} max={Math.max(1, len)} value={Math.min(pos, Math.max(1, len))}
                 onChange={(e) => seekTo(Number(e.target.value))} aria-label="Position in the video" />
          <IconButton title="Slower (−)" onClick={() => step(-1)} size={30}><span className="tiny">−</span></IconButton>
          <span className="muted tabular" style={{ minWidth: 40, textAlign: "center" }}>{rate}×</span>
          <IconButton title="Faster (+)" onClick={() => step(1)} size={30}><span className="tiny">+</span></IconButton>
        </div>
        <div className="hrow" style={{ gap: 18, marginTop: 10, flexWrap: "wrap" }}>
          <label className="hrow" style={{ gap: 8 }}><Switch checked={captions} onChange={setCc} label="Subtitles" /><span className="muted">Subtitles</span></label>
          <label className="hrow" style={{ gap: 8 }}><Switch checked={showEn} onChange={setEn} label="English" /><span className="muted">English (E)</span></label>
          {resumed && ready ? <button type="button" className="link" onClick={() => seekTo(0)}>From the start</button> : null}
          <span className="spacer" />
          <button type="button" className="link" onClick={() => window.ya.app.open(`https://www.youtube.com/watch?v=${v.id}&t=${Math.floor(lastAt.current / 1000)}s`)}>Watch on YouTube</button>
          {watched ? <Pill tone="brand">Watched</Pill> : <Btn kind="pri" label="Mark watched" onClick={markWatched} />}
        </div>
        <WordsSaid v={v} st={st} onJump={(ms) => { if (player.current) player.current.seek(Math.max(0, ms - LEAD_MS), HOLD_MS); }} />
      </div>
      <aside className="video-script">
        <div className="hrow" style={{ padding: "6px 4px 10px" }}>
          <b style={{ flex: 1 }}>Transcript</b>
          {en ? <Muted>Machine translation</Muted> : null}
          <button type="button" className={"pill" + (follow ? " brand" : "")} style={{ cursor: "pointer" }} onClick={() => setFollow(!follow)} title="Follow the sound (F)">Follow</button>
        </div>
        {script && script.length ? (
          <div className="script-scroll" ref={scroller} onWheel={() => { if (follow) setFollow(false); }}>
            {script.map((ln, k) => (
              <TranscriptLine key={k} line={ln} k={k} active={k === at} word={k === at ? word : -1}
                              en={en ? en[k] : null} onSeek={seekTo} onWord={onWordClick} openWord={openWord} />
            ))}
          </div>
        ) : <Muted style={{ padding: 8 }}>No transcript for this one.</Muted>}
      </aside>
    </div>
  );
}

const TranscriptLine = React.memo(function TranscriptLine({ line, k, active, word, en, onSeek, onWord, openWord }) {
  const tags = new Set(line[3] || []);
  const english = soundOnlyEnglish(line) || en;
  return (
    <div className={"tl" + (active ? " on" : "")} data-line={k} onClick={() => onSeek(line[0])} role="button" tabIndex={-1}
         title={`Play from ${clock(line[0])}`}>
      <span className="tl-time">{clock(line[0])}</span>
      <div className="tl-body">
        <div className="tl-ru" lang="ru">
          {line[1].split(" ").map((w, n) => {
            if (tags.has(n)) return <span key={n} className="tl-sound">{n ? " " : ""}{soundLabel(w)}</span>;
            const link = linkable(w);
            const now = active && n === word;
            return (
              <span key={n}>
                {n ? " " : ""}
                <span className={(link ? "lk" : "") + (now ? " now" : "")}
                      onClick={link ? (e) => { e.stopPropagation(); const entry = entryOf(w); if (entry) { onWord(); openWord(entry.key, entry.pos, w); } } : undefined}>
                  {w}
                </span>
              </span>
            );
          })}
        </div>
        {english && en != null ? <div className="tl-en">{english}</div> : null}
      </div>
    </div>
  );
});

/* The words the video says, in their groups, each with the learner's score
   and a jump to where it is said (prep.js's list on the phone). */
function WordsSaid({ v, st, onJump }) {
  const { open } = useInspector();
  const words = useMemo(() => Object.keys(v.words || {}).filter((w) => (v.words[w] || []).length), [v]);
  const clusters = useMemo(() => clusterWords(words), [words]);
  const [turn, setTurn] = useState({});           // word → which occurrence a second press plays
  if (!words.length) return null;
  return (
    <div className="video-words">
      <h2 style={{ marginTop: 26 }}>Words it says <span className="muted" style={{ fontWeight: 400 }}>· {words.length}</span></h2>
      {clusters.map((c) => (
        <div key={c.id} style={{ marginTop: 14 }}>
          <div className="label" style={{ marginTop: 0 }}>{c.name} · {c.words.length}</div>
          {c.groups.map((g) => (
            <div key={g.name || c.id} style={{ marginBottom: 10 }}>
              {g.name ? <div className="group-name">{g.name}</div> : null}
              <List>
                {g.words.map((w) => {
                  const i = idxOfWord(w);
                  const e = i >= 0 ? L[i] : null;
                  const occ = v.words[w] || [];
                  const k = (turn[w] || 0) % occ.length;
                  const score = familiarity(cardFor((st.seen || {})[w]), rankOf(w));
                  return (
                    <Row key={w} onClick={() => e && open(e.b, e.p)}>
                      <span className="w" lang="ru" style={{ minWidth: 150, fontSize: "var(--t-head)" }}>{e ? e.w : w}</span>
                      <span className="e" style={{ flex: 1, color: "var(--ink2)" }}>{e ? firstSense(e) : ""}</span>
                      {score === null ? <Pill>new</Pill> : <Ring score={score} size={28} stroke={3} />}
                      <span className="muted tabular">{occ.length > 1 ? `${k + 1}/${occ.length}` : ""} {occ[k] ? clock(occ[k].t) : ""}</span>
                      <IconButton d={ICONS.play} size={30} title={`Play where it is said${occ.length > 1 ? " (again for the next)" : ""}`}
                                  onClick={(ev) => { ev.stopPropagation(); if (occ[k]) onJump(occ[k].t); setTurn((t) => ({ ...t, [w]: (t[w] || 0) + 1 })); }} />
                    </Row>
                  );
                })}
              </List>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
