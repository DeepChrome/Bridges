/* The shell: a sidebar, the work pane, and the inspector on the right.
 *
 * Not a phone app widened (the owner, 2026-11-07): the screens are laid out
 * for a wide window and a keyboard. Navigation is state, not a router — six
 * places, each a component — and a word clicked anywhere opens in the
 * inspector beside the work rather than over it. */

import React, { useEffect, useState } from "react";
import { useSession } from "./session.jsx";
import { useInspector } from "./words.jsx";
import { useKeys } from "./keys.js";
import { IconButton, ICONS } from "./ui.jsx";
import { WordPanel } from "./WordPanel.jsx";
import { ErrorBoundary } from "./boundary.jsx";
import { Pair } from "./screens/Pair.jsx";
import { Study } from "./screens/Study.jsx";
import { Dictionary } from "./screens/Dictionary.jsx";
import { Learn } from "./screens/Learn.jsx";
import { Practice } from "./screens/Practice.jsx";
import { Stats } from "./screens/Stats.jsx";
import { Settings } from "./screens/Settings.jsx";
import { Read } from "./screens/Read.jsx";
import { Cards } from "./screens/Cards.jsx";
import { Videos } from "./screens/Videos.jsx";
import { dueCount } from "../../../native/src/data.js";

const NAV = [
  ["learn", "Learn", "1"], ["study", "Study", "2"], ["practice", "Practice", "3"], ["videos", "Videos", "4"],
  ["read", "Read", "5"], ["dictionary", "Dictionary", "6"], ["cards", "Cards", "7"], ["stats", "Stats", "8"],
];

export function App() {
  const { ready, account, st, syncState, error, clearError } = useSession();
  const { current, close } = useInspector();
  const [screen, setScreen] = useState("learn");
  const [sub, setSub] = useState(null);             // a screen's own place: a unit, a drill

  const go = (s, extra = null) => { setScreen(s); setSub(extra); };
  useKeys({
    "ctrl+1": () => go("learn"), "ctrl+2": () => go("study"), "ctrl+3": () => go("practice"), "ctrl+4": () => go("videos"),
    "ctrl+5": () => go("read"), "ctrl+6": () => go("dictionary"), "ctrl+7": () => go("cards"), "ctrl+8": () => go("stats"),
    "ctrl+,": () => go("settings"),
    "ctrl+k": { fn: () => go("dictionary", { focus: Date.now() }), always: true },
    "Escape": () => { if (current) close(); },
  }, [current]);

  if (!ready) return <div className="empty">…</div>;
  if (!account) return <Pair />;

  const due = dueCount(st);
  const Screen = { learn: Learn, study: Study, practice: Practice, videos: Videos, read: Read, dictionary: Dictionary,
                   cards: Cards, stats: Stats, settings: Settings }[screen] || Learn;
  return (
    <div className={"shell" + (current ? " with-inspector" : "")}>
      <aside className="sidebar">
        <div className="brand"><div className="mark">Я</div><div className="name">Ya</div></div>
        <nav className="nav">
          {NAV.map(([id, name, k]) => (
            <button key={id} type="button" className={screen === id ? "on" : ""} onClick={() => go(id)}>
              {name}
              {id === "study" && due ? <span className="badge">{due}</span> : <span className="k kbd">Ctrl+{k}</span>}
            </button>
          ))}
        </nav>
        <div className="foot">
          <button type="button" className="profile-row" onClick={() => go("settings")} title="Settings (Ctrl+,)">
            <span className="avatar">{(account.name || "?").slice(0, 1).toUpperCase()}</span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{account.name}</span>
            <span className={"syncdot " + (syncState.state || "")} title={`Sync: ${syncState.state || "off"}`} />
          </button>
        </div>
      </aside>
      <main className="pane">
        {error ? (
          <div className="notice bad" style={{ margin: 16, display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ flex: 1 }}>{error.text}</span>
            <button type="button" className="link" onClick={clearError}>Dismiss</button>
          </div>
        ) : null}
        <ErrorBoundary key={screen}><Screen go={go} sub={sub} /></ErrorBoundary>
      </main>
      {current ? (
        <aside className="inspector">
          <div className="head">
            <span className="muted">Dictionary</span>
            <IconButton d={ICONS.close} title="Close (Esc)" onClick={close} size={32} />
          </div>
          <ErrorBoundary key={current.word + (current.pos || "") + current.at}>
            <WordPanel word={current.word} pos={current.pos} surface={current.surface} onClose={close}
                       onVideo={(h, w) => go("videos", { videoId: h.id, word: w, at: h.t, opened: Date.now() })} />
          </ErrorBoundary>
        </aside>
      ) : null}
    </div>
  );
}
