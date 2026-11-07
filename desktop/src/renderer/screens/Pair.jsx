/* The way in: pair this computer with the phone, or start here.
 *
 * Pairing asks the Worker for a six-digit code, shows it large, and waits
 * for the phone (Settings → Sync → Pair a computer) to claim it. The token
 * that comes back is a device of the phone's account, and the first sync
 * pulls the whole profile — words, schedule, lessons — so the learner sits
 * down to the same course. */

import React, { useEffect, useRef, useState } from "react";
import { useSession } from "../session.jsx";
import { Btn } from "../ui.jsx";
import { normalise } from "@core/defaults";

export function Pair() {
  const { createProfile, profiles, selectProfile } = useSession();
  const [code, setCode] = useState(null);
  const [state, setState] = useState("idle");       // idle | waiting | joining | error
  const [error, setError] = useState(null);
  const [name, setName] = useState("");
  const id = useRef(null);

  useEffect(() => {
    const off = window.ya.on("pair:code", (c) => setCode(c));
    return () => { off(); window.ya.pair.cancel(); };
  }, []);

  const start = async () => {
    setState("waiting"); setError(null); setCode(null);
    id.current = await window.ya.profiles.newId();
    const r = await window.ya.pair.start(id.current);
    if (r.ok === true) {
      setState("joining");
      // The profile's own name travels in its state; read it before naming the profile.
      const { rows } = await window.ya.store.load(id.current);
      const st = rows ? normalise(rows) : null;
      await createProfile((st && st.name) || "Learner", "monkeynaut", { id: id.current });
    } else {
      setState("error");
      setError(r.reason === "expired" ? "The code expired. Try again."
        : r.reason === "cancelled" ? null
        : r.reason === "offline" ? "No connection to the server."
        : r.message || `Pairing failed (${r.reason || "unknown"}).`);
    }
  };
  const cancel = () => { window.ya.pair.cancel(); setState("idle"); setCode(null); };
  const local = async () => { await createProfile(name.trim() || "Learner", "monkeynaut"); };

  return (
    <div className="pane"><div className="pane-inner">
      <div className="pair">
        <div className="brand" style={{ justifyContent: "center" }}><div className="mark" style={{ width: 56, height: 56, fontSize: 32, borderRadius: 12 }}>Я</div></div>
        <h1>Ya on your computer</h1>
        {state === "idle" || state === "error" ? (
          <>
            <p className="sub">Your phone's profile, here — every word, every score, kept in step.</p>
            {error ? <div className="notice bad" style={{ margin: "12px 0" }}>{error}</div> : null}
            <Btn kind="pri" label="Pair with my phone" onClick={start} style={{ minWidth: 220, marginTop: 10 }} />
            <div style={{ marginTop: 40 }} className="muted">Or start a new profile on this computer</div>
            <div className="hrow" style={{ justifyContent: "center", marginTop: 10 }}>
              <input className="field sm" style={{ maxWidth: 220 }} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
              <Btn label="Start here" onClick={local} />
            </div>
            {profiles.list.length ? (
              <div style={{ marginTop: 30 }}>
                <div className="muted">Profiles on this computer</div>
                <div className="hrow" style={{ justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
                  {profiles.list.map((a) => <Btn key={a.id} kind="ghost" label={a.name} onClick={() => selectProfile(a.id)} />)}
                </div>
              </div>
            ) : null}
          </>
        ) : state === "joining" ? (
          <p className="sub" style={{ marginTop: 30 }}>Paired. Fetching your profile…</p>
        ) : (
          <>
            <div className="code" data-testid="pair-code">{code || "······"}</div>
            <div className="muted">Code expires in 10 minutes</div>
            <ol className="steps">
              <li>Open Ya on your phone</li>
              <li>Settings → Sync → Pair a computer</li>
              <li>Type this code</li>
            </ol>
            <div style={{ marginTop: 24 }}><Btn kind="ghost" label="Cancel" onClick={cancel} /></div>
          </>
        )}
      </div>
    </div></div>
  );
}
