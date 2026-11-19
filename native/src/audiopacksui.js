/* Settings → Audio: which chapters' recordings are on the phone
   (audiopacks.js). Nothing here is needed day to day — the packs fetch
   themselves — but a learner about to go offline wants Download all, and a
   phone short of room wants Remove. One row a pack: its name, its size, and
   its state as a word. */

import React from "react";
import { View } from "react-native";
import { List, Row, RowText, Muted, Btn, SectionLabel, Pill } from "./ui";
import { usePacks, installPack, removePack, downloadAllPacks, removeAllPacks, packName, packSize } from "./audiopacks";
import { PACKS } from "./wordaudio";

export function AudioPacksSection() {
  const s = usePacks();
  if (!PACKS.length) return null;
  const have = s.packs.filter((p) => p.installed).length;
  const state = (p) => (p.installed ? "Downloaded" : p.fetching ? "Downloading…" : s.queued.includes(p.id) ? "Waiting" : "");
  return (
    <View style={{ marginTop: 16 }}>
      <SectionLabel>Audio</SectionLabel>
      <List>
        {s.packs.map((p) => (
          <Row key={p.id} testID={`pack-${p.label}`}
               onPress={p.installed ? () => removePack(p.id) : p.fetching ? undefined : () => installPack(p.id)}>
            <RowText title={packName(p)} sub={packSize(p)} bold={false} />
            {state(p) ? <Pill tone={p.installed ? "good" : "brand"} testID={`pack-${p.label}-state`}>{state(p)}</Pill>
              : <Muted>Download</Muted>}
          </Row>
        ))}
      </List>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
        <Btn kind="plain" testID="packs-all" label="Download all" style={{ flex: 1 }}
             disabled={have === s.packs.length} onPress={() => downloadAllPacks()} />
        <Btn kind="ghost" testID="packs-none" label="Remove downloaded" style={{ flex: 1 }}
             disabled={!have} onPress={() => removeAllPacks()} />
      </View>
    </View>
  );
}
