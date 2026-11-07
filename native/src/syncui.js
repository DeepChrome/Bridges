/* Settings → Sync (2026-11-07): this profile on more than one device.
 *
 * One switch links the profile to an account on the Worker and pushes
 * everything it holds; under it, once linked, the code a computer shows is
 * typed to pair it, the devices on the account are listed with Remove, and
 * one line says when the last round landed. Its own component with its own
 * state, because a toggle held by the sheet does not redraw inside a Modal
 * (§30be).
 */

import React, { useEffect, useState } from "react";
import { View, Alert } from "react-native";
import { useSession } from "./session";
import { useTheme, type as T } from "./theme";
import { List, Row, Btn, Muted, Text, TextInput, RowText, ToggleRow } from "./ui";
import { config, capNotice } from "./lib/feedback";
import { syncLink, syncNow, enableSync, disableSync, pairComputer, devicesOf, removeDevice,
         onSyncChange, syncStatus } from "./sync";
import { PAIR_CODE_LEN } from "@core/sync";

/* "2 min ago", "yesterday" — for the one status line. */
export function ago(ms, now = Date.now()) {
  if (!ms) return "";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/* The failure, in one line (rule 20.7's third allowance: a control that
   failed with nothing said is a dead control). */
export function failureLine(r) {
  if (!r) return "";
  if (r.reason === "offline") return "No connection";
  if (r.reason === "timeout") return "The server did not answer";
  if (r.reason === "unconfigured") return "This build has no server";
  if (r.reason === "cap" || r.status === 429) return capNotice(r).text;
  if (r.status === 401) return "This device is no longer on the account";
  if (r.reason === "expired" || r.status === 410) return "That code has expired";
  if (r.reason === "claimed" || r.status === 409) return "That code was already used";
  return r.message || "Sync failed";
}

export function SyncSection() {
  const t = useTheme();
  const { account } = useSession();
  const id = account ? account.id : null;
  const [link, setLink] = useState(undefined);        // undefined: not read yet
  const [status, setStatus] = useState(syncStatus(id));
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const [note, setNote] = useState(null);
  const [devices, setDevices] = useState(null);

  const refreshLink = async () => { setLink(await syncLink(id)); };
  const refreshDevices = async () => {
    const r = await devicesOf(id);
    setDevices(r.ok ? r.devices : null);
  };
  useEffect(() => {
    let live = true;
    syncLink(id).then((l) => { if (live) setLink(l); });
    const off = onSyncChange((pid, s) => { if (live && pid === id) setStatus(s); });
    return () => { live = false; off(); };
  }, [id]);
  useEffect(() => { if (link) refreshDevices(); else setDevices(null); }, [link, status.lastAt]);

  if (!config()) return null;                          // a build with no Worker has no sync

  const toggle = async (on) => {
    setBusy(true);
    setNote(null);
    if (on) {
      const r = await enableSync(id, account.name || "Phone");
      if (r.ok !== true && r.reason !== "unlinked") setNote(failureLine(r));
    } else {
      await disableSync(id);
    }
    await refreshLink();
    setBusy(false);
  };

  const pair = async () => {
    setPairing(true);
    setNote(null);
    const r = await pairComputer(id, code, "Computer");
    setPairing(false);
    if (r.ok === true) { setCode(""); setNote("Paired"); refreshDevices(); }
    else setNote(failureLine(r));
  };

  const remove = (d) => Alert.alert("Remove this device?", d.name,
    [{ text: "Cancel", style: "cancel" },
     { text: "Remove", style: "destructive",
       onPress: async () => { const r = await removeDevice(id, d.id); if (r.ok === true) refreshDevices(); else setNote(failureLine(r)); } }]);

  const line = status.state === "syncing" ? "Syncing…"
    : status.state === "error" ? failureLine(status.error)
    : status.lastAt || (link && link.lastAt) ? `Synced ${ago(status.lastAt || link.lastAt)}` : "";

  return (
    <View style={{ marginTop: 16 }} testID="sync-section">
      <List>
        <ToggleRow title="Sync this profile" testID="sync-switch" value={!!link} disabled={busy || link === undefined}
                   onValueChange={toggle} />
        {link ? (
          <Row>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: T.body }}>Pair a computer</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
                <TextInput testID="pair-code" value={code} onChangeText={(s) => setCode(s.replace(/\D/g, "").slice(0, PAIR_CODE_LEN))}
                           keyboardType="number-pad" placeholder="Code" placeholderTextColor={t.ink3}
                           maxLength={PAIR_CODE_LEN}
                           style={{ flex: 1, fontSize: 22, letterSpacing: 4, paddingVertical: 10, paddingHorizontal: 12,
                                    backgroundColor: t.surface2, borderRadius: 6, color: t.ink }} />
                <Btn testID="pair-go" label={pairing ? "…" : "Pair"} kind="pri" disabled={pairing || code.length !== PAIR_CODE_LEN}
                     onPress={pair} />
              </View>
            </View>
          </Row>
        ) : null}
        {(devices || []).map((d) => (
          <Row key={d.id} testID={`device-${d.id}`}>
            <RowText title={d.name} sub={d.me ? "This phone" : `Seen ${ago(d.seen)}`} bold={false} />
            {d.me ? null : <Btn kind="ghost" label="Remove" testID={`device-remove-${d.id}`} onPress={() => remove(d)} />}
          </Row>
        ))}
      </List>
      {note ? <Muted testID="sync-note" style={{ marginTop: 6 }}>{note}</Muted> : null}
      {link ? (
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8 }}>
          <Muted testID="sync-line" style={{ flex: 1 }}>{line}</Muted>
          <Btn kind="ghost" label="Sync now" testID="sync-now" disabled={status.state === "syncing"}
               onPress={() => syncNow(id)} />
        </View>
      ) : null}
    </View>
  );
}
