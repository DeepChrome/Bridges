/* Settings: sync and devices, appearance, typing Russian, the profile. */

import React, { useEffect, useState } from "react";
import { useSession } from "../session.jsx";
import { useSettings } from "../settings.js";
import { Btn, List, Row, Switch, Seg, Muted, Kbd } from "../ui.jsx";
import { LEGEND } from "@core/typing";
import { PAIR_CODE_LEN } from "@core/sync";
import { SPEEDS } from "../audio.js";

const ago = (ms) => {
  if (!ms) return "";
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

function SyncSection() {
  const { account, syncState } = useSession();
  const [link, setLink] = useState(undefined);
  const [devices, setDevices] = useState(null);
  const [note, setNote] = useState(null);
  const [code, setCode] = useState("");
  const id = account.id;
  const refresh = async () => {
    const l = await window.ya.sync.link(id);
    setLink(l);
    if (l) { const r = await window.ya.sync.devices(id); setDevices(r.ok ? r.devices : null); } else setDevices(null);
  };
  useEffect(() => { refresh(); }, [id, syncState.lastAt]);   // eslint-disable-line react-hooks/exhaustive-deps
  const fail = (r) => setNote(r.reason === "offline" ? "No connection" : r.message || `Failed (${r.reason || r.status})`);
  return (
    <>
      <h2>Sync</h2>
      <List>
        <Row>
          <div style={{ flex: 1 }}>
            <div>Sync this profile</div>
            <Muted>{link === undefined ? "" : link ? (syncState.state === "syncing" ? "Syncing…" : syncState.state === "error" ? "Sync failed" : `Synced ${ago(syncState.lastAt || link.lastAt)}`) : "Off"}</Muted>
          </div>
          {link ? <Btn kind="ghost" label="Sync now" onClick={() => window.ya.sync.now(id)} /> : null}
          <Switch checked={!!link} label="Sync this profile" onChange={async (on) => {
            setNote(null);
            if (on) { const r = await window.ya.sync.linkFresh(id); if (r.ok !== true && r.reason !== "unlinked") fail(r); }
            else await window.ya.sync.unlink(id);
            refresh();
          }} />
        </Row>
        {link ? (
          <Row>
            <div style={{ flex: 1 }}>
              <div>Pair another computer</div>
              <Muted>Type the code it shows</Muted>
            </div>
            <input className="field sm" style={{ width: 130, letterSpacing: 3 }} value={code} placeholder="Code" inputMode="numeric"
                   onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, PAIR_CODE_LEN))} />
            <Btn label="Pair" kind="pri" disabled={code.length !== PAIR_CODE_LEN}
                 onClick={async () => { const r = await window.ya.sync.claim(id, code, "Computer"); if (r.ok === true) { setCode(""); setNote("Paired"); refresh(); } else fail(r); }} />
          </Row>
        ) : null}
        {(devices || []).map((d) => (
          <Row key={d.id}>
            <div style={{ flex: 1 }}><div>{d.name}</div><Muted>{d.me ? "This computer" : `Seen ${ago(d.seen)}`}</Muted></div>
            {d.me ? null : <Btn kind="ghost" label="Remove" onClick={async () => { const r = await window.ya.sync.revoke(id, d.id); if (r.ok === true) refresh(); else fail(r); }} />}
          </Row>
        ))}
      </List>
      {note ? <Muted style={{ marginTop: 6 }}>{note}</Muted> : null}
    </>
  );
}

export function Settings() {
  const { account, profiles, selectProfile, signOut, updateAccount, st, update } = useSession();
  const { settings, setSettings } = useSettings();
  const [layout, setLayout] = useState(null);
  const [info, setInfo] = useState(null);
  useEffect(() => { window.ya.app.info().then(setInfo); }, []);
  return (
    <div className="pane-inner">
      <h1>Settings</h1>
      <SyncSection />

      <h2>Typing Russian</h2>
      <List>
        <Row>
          <div style={{ flex: 1 }}>
            <div>Phonetic typing <Kbd>Ctrl+Shift+R</Kbd></div>
            <Muted>Type Latin letters, get Russian: privet → привет</Muted>
          </div>
          <Switch checked={settings.phonetic !== false} label="Phonetic typing" onChange={(v) => setSettings({ phonetic: v })} />
        </Row>
        <Row>
          <div style={{ flex: 1 }}>
            <div>Windows Russian keyboard</div>
            <Muted>{layout === "ok" ? "Added · Win+Space switches layouts" : layout === null ? "Add ЙЦУКЕН to Windows; Win+Space switches" : layout}</Muted>
          </div>
          <Btn label="Add to Windows" onClick={async () => { const r = await window.ya.app.addRussianLayout(); setLayout(r.ok ? "ok" : (r.message || "Could not add it")); }} />
        </Row>
      </List>
      <div className="legend" style={{ marginTop: 12 }}>
        {LEGEND.map(([k, ru]) => (<React.Fragment key={k}><span className="kbd">{k}</span><span className="ru" lang="ru">{ru}</span></React.Fragment>))}
      </div>

      <h2>Appearance</h2>
      <List>
        <Row>
          <div style={{ flex: 1 }}>Theme</div>
          <Seg value={settings.appearance || "system"} onChange={(id) => setSettings({ appearance: id })}
               options={[{ id: "system", name: "System" }, { id: "light", name: "Light" }, { id: "dark", name: "Dark" }]} />
        </Row>
        <Row>
          <div style={{ flex: 1 }}>Reading speed</div>
          <Seg value={settings.speed || "normal"} onChange={(id) => setSettings({ speed: id })} options={SPEEDS} />
        </Row>
      </List>

      <h2>Study</h2>
      <List>
        <Row>
          <div style={{ flex: 1 }}>New words a day</div>
          <input className="field sm" type="number" min={0} max={99} style={{ width: 90 }} value={st.newPerDay === undefined ? 5 : st.newPerDay}
                 onChange={(e) => update((p) => ({ ...p, newPerDay: Math.max(0, Math.min(99, Number(e.target.value) || 0)) }))} />
        </Row>
        <Row>
          <div style={{ flex: 1 }}>Card fronts</div>
          <div className="hrow">
            {[["recognise", "Russian"], ["produce", "English"], ["listen", "Sound"]].map(([id, name]) => {
              const on = (st.flash || ["recognise"]).includes(id);
              return <button key={id} type="button" className={"pill" + (on ? " brand" : "")} style={{ cursor: "pointer" }}
                             onClick={() => update((p) => { const f = p.flash || ["recognise"]; const next = on ? f.filter((x) => x !== id) : f.concat(id); return { ...p, flash: next.length ? next : f }; })}>{name}</button>;
            })}
          </div>
        </Row>
        <Row>
          <div style={{ flex: 1 }}>Developer mode<Muted>All lessons unlocked</Muted></div>
          <Switch checked={!!st.dev} label="Developer mode" onChange={(v) => update((p) => ({ ...p, dev: v }))} />
        </Row>
      </List>

      <h2>Profile</h2>
      <List>
        <Row>
          <div style={{ flex: 1 }}>Name</div>
          <input className="field sm" style={{ width: 220 }} defaultValue={account.name} onBlur={(e) => updateAccount({ name: e.target.value.trim() || account.name })} />
        </Row>
        {profiles.list.filter((a) => a.id !== account.id).map((a) => (
          <Row key={a.id} onClick={() => selectProfile(a.id)}><div style={{ flex: 1 }}>Switch to {a.name}</div></Row>
        ))}
        <Row onClick={signOut}><div style={{ flex: 1 }}>Sign out of this profile</div></Row>
      </List>
      {info ? <Muted style={{ marginTop: 24, textAlign: "center" }}>Ya {info.version} · data in {info.userData}</Muted> : null}
    </div>
  );
}
