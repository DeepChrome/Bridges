/* What the page may ask of the computer: `window.ya`. Each call is one
   ipcMain.handle in main.js; `on` subscribes to what the main process sends
   (a pairing code, pulled ops, a sync status). Nothing else of Node reaches
   the page. */

import { contextBridge, ipcRenderer } from "electron";

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("ya", {
  profiles: { list: call("profiles:list"), save: call("profiles:save"), newId: call("profiles:new") },
  store: { load: call("store:load"), apply: call("store:apply"), replace: call("store:replace"),
           log: call("store:log"), counts: call("store:counts") },
  sync: { status: call("sync:status"), link: call("sync:link"), now: call("sync:now"), unlink: call("sync:unlink"),
          linkFresh: call("sync:linkFresh"), devices: call("sync:devices"), revoke: call("sync:revoke"),
          claim: call("sync:claim"), worker: call("sync:worker") },
  pair: { start: call("pair:start"), cancel: call("pair:cancel") },
  settings: { get: call("settings:get"), set: call("settings:set") },
  app: { open: call("app:open"), info: call("app:info"), theme: call("app:theme"),
         addRussianLayout: call("app:addRussianLayout") },
  on(channel, fn) {
    const ok = ["pair:code", "sync:pulled", "sync:status"];
    if (!ok.includes(channel)) throw new Error("unknown channel " + channel);
    const handler = (e, ...args) => fn(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
});
