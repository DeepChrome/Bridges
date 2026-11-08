/* Ya for Windows — the main process.
 *
 * One window, the ya:// scheme for the page and its assets (assets.js), the
 * profile store on SQLite (profiles.js, db.js), sync (sync.js), and the
 * handful of things only a desktop can do: open a link in the browser, add
 * Windows' Russian keyboard layout. Everything the renderer may ask for goes
 * through `ipcMain.handle` here and `contextBridge` in preload.js; the page
 * has no Node.
 */

import { app, BrowserWindow, ipcMain, shell, nativeTheme } from "electron";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { registerScheme, serveScheme, assetsRoot } from "./assets.js";
import { loadProfiles, saveProfiles, loadSettings, saveSettings, newId, repoFor, recoveredNote, closeAll } from "./profiles.js";
import * as sync from "./sync.js";
import { merge, diff } from "@core/repo";

registerScheme();
/* A walkthrough keeps its profiles apart from the learner's. */
if (process.env.YA_USERDATA) app.setPath("userData", process.env.YA_USERDATA);

let win = null;
const send = (channel, ...args) => { if (win && !win.isDestroyed()) win.webContents.send(channel, ...args); };
sync.onEvent(send);

function createWindow() {
  const s = loadSettings();
  const bounds = s.bounds || { width: 1280, height: 820 };
  win = new BrowserWindow({
    ...bounds,
    minWidth: 960, minHeight: 600,
    title: "Ya",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#12151D" : "#F5F5F2",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      /* The YouTube player lives in a <webview> (renderer/youtube.jsx): a
         guest page with a real https base, which the renderer's own ya://
         origin cannot give an iframe. */
      webviewTag: true,
    },
  });
  // A link clicked inside the player (its title, "watch on YouTube") opens in the browser.
  win.webContents.on("did-attach-webview", (e, guest) => {
    guest.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  });
  win.on("close", () => { saveSettings({ bounds: win.getBounds() }); });
  win.on("focus", async () => {
    const p = loadProfiles();
    if (p.active && (await sync.link(p.active))) sync.syncNow(p.active);
  });
  win.loadURL("ya://app/index.html");
  // Links open in the browser, never in the app's window.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });

  /* For the build machine, not the learner: YA_DEBUG relays the page's
     console to stdout, and YA_SHOT=<file.png> writes a screenshot of the
     first screen a moment after load and quits — the one way an agent
     without eyes on the window can read it (§31: look at the pictures). */
  if (process.env.YA_DEBUG || process.env.YA_SHOT) {
    win.webContents.on("console-message", (e, level, message, line, file) => {
      console.log(`[page${level >= 2 ? ":err" : ""}] ${message} (${String(file).split("/").pop()}:${line})`);
    });
  }
  /* YA_DRIVE=<steps.json>: the desktop's walkthrough. Each step runs a line
     of JavaScript in the page (with `__drive` helpers, below), waits, and may
     take a screenshot; then the app quits. The same purpose as
     native/tools/walk.ps1 on the emulator — a screen nobody has looked at is
     a screen nobody has checked. */
  if (process.env.YA_DRIVE) {
    const fs = require("node:fs");
    const steps = JSON.parse(fs.readFileSync(process.env.YA_DRIVE, "utf8"));
    const dir = require("node:path").dirname(process.env.YA_DRIVE);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    win.webContents.once("did-finish-load", async () => {
      await sleep(Number(process.env.YA_SHOT_DELAY || 2500));
      await win.webContents.executeJavaScript(`
        window.__drive = {
          click(text, nth = 0) {
            const all = [...document.querySelectorAll("button, [role=button], [role=link], summary, .row.press")]
              .filter((b) => (b.textContent || "").trim().includes(text));
            if (!all[nth]) throw new Error("no control " + JSON.stringify(text));
            all[nth].click(); return all.length;
          },
          type(selector, text) {
            const el = document.querySelector(selector);
            if (!el) throw new Error("no field " + selector);
            const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            const set = Object.getOwnPropertyDescriptor(proto, "value").set;
            el.focus(); set.call(el, text); el.dispatchEvent(new Event("input", { bubbles: true })); return true;
          },
          key(key, opts = {}) {
            const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts });
            (document.activeElement || document.body).dispatchEvent(ev); window.dispatchEvent(ev); return true;
          },
          text() { return document.body.innerText; },
        }; true`);
      for (const step of steps) {
        try {
          if (step.js) {
            const r = await win.webContents.executeJavaScript(step.js);
            if (step.print) console.log(`[drive] ${step.print}: ${JSON.stringify(r).slice(0, 2000)}`);
          }
        } catch (e) { console.log(`[drive] step failed: ${step.js} → ${e && e.message}`); }
        await sleep(step.wait || 600);
        if (step.shot) {
          const img = await win.webContents.capturePage();
          fs.writeFileSync(require("node:path").join(dir, step.shot), img.toPNG());
          console.log(`[shot] ${step.shot}`);
        }
      }
      app.quit();
    });
  }
  if (process.env.YA_SHOT) {
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        try {
          const img = await win.webContents.capturePage();
          require("node:fs").writeFileSync(process.env.YA_SHOT, img.toPNG());
          console.log(`[shot] ${process.env.YA_SHOT} ${img.getSize().width}x${img.getSize().height}`);
        } catch (e) { console.log(`[shot] failed: ${e && e.message}`); }
        app.quit();
      }, Number(process.env.YA_SHOT_DELAY || 2500));
    });
  }
}

/* ------------------------------------------------------------------- IPC */

ipcMain.handle("profiles:list", () => loadProfiles());
ipcMain.handle("profiles:save", (e, p) => { saveProfiles(p); return p; });
ipcMain.handle("profiles:new", () => newId());

ipcMain.handle("store:load", async (e, id) => {
  const repo = await repoFor(id);
  const rows = await repo.load();
  return { rows: rows ? merge(rows) : null, recovered: await recoveredNote(id) };
});
/* One save: the diff the renderer computed, its review rows, its drops. The
   renderer keeps the copy a save is diffed against; here the rows are
   written and the push scheduled. */
ipcMain.handle("store:apply", async (e, id, d, rows, drops) => {
  const repo = await repoFor(id);
  await repo.apply(d, rows || [], drops || []);
  if (await sync.link(id)) sync.nudge(id);
  return true;
});
ipcMain.handle("store:replace", async (e, id, state, rows) => {
  const repo = await repoFor(id);
  await repo.replace(state, rows || []);
  if (await sync.link(id)) sync.nudge(id);
  return true;
});
ipcMain.handle("store:log", async (e, id, opts) => (await repoFor(id)).readLog(opts || {}));
ipcMain.handle("store:counts", async (e, id) => (await repoFor(id)).counts());

ipcMain.handle("sync:status", (e, id) => sync.status(id));
ipcMain.handle("sync:link", (e, id) => sync.link(id));
ipcMain.handle("sync:now", (e, id) => sync.syncNow(id));
ipcMain.handle("sync:unlink", (e, id) => sync.unlinkProfile(id));
ipcMain.handle("sync:linkFresh", (e, id) => sync.linkFresh(id));
ipcMain.handle("sync:devices", (e, id) => sync.devices(id));
ipcMain.handle("sync:revoke", (e, id, device) => sync.revoke(id, device));
ipcMain.handle("sync:claim", (e, id, code, name) => sync.claim(id, code, name));
ipcMain.handle("sync:worker", () => sync.workerBase());

/* Pairing runs as one long job: the code goes to the renderer the moment the
   Worker mints it, the answer when the phone has claimed it. */
let pairing = null;
ipcMain.handle("pair:start", async (e, id) => {
  if (pairing) pairing.cancel();
  pairing = sync.pair((code, expiresAt) => send("pair:code", code, expiresAt));
  const r = await pairing.done;
  pairing = null;
  if (r.error) return r.error;
  await sync.joinWithToken(id, r.token);
  return { ok: true };
});
ipcMain.handle("pair:cancel", () => { if (pairing) pairing.cancel(); pairing = null; return true; });

ipcMain.handle("settings:get", () => loadSettings());
ipcMain.handle("settings:set", (e, patch) => saveSettings(patch));
ipcMain.handle("app:open", (e, url) => { if (/^https?:/.test(url)) shell.openExternal(url); return true; });
ipcMain.handle("app:info", () => ({ version: app.getVersion(), assets: assetsRoot(), platform: process.platform,
                                     userData: app.getPath("userData") }));
ipcMain.handle("app:theme", () => (nativeTheme.shouldUseDarkColors ? "dark" : "light"));

/* Windows' own Russian keyboard, added to the user's input languages, so
   Win+Space switches to ЙЦУКЕН. PowerShell's language-list cmdlets are the
   supported way; the layout is Russian (0419) with the Russian keyboard
   (00000419). Resolves to { ok } or { ok: false, message }. */
ipcMain.handle("app:addRussianLayout", () => new Promise((resolve) => {
  if (process.platform !== "win32") { resolve({ ok: false, message: "Windows only" }); return; }
  const script = "$l = Get-WinUserLanguageList; if (-not ($l | Where-Object LanguageTag -eq 'ru')) { $l.Add('ru'); Set-WinUserLanguageList $l -Force }; 'ok'";
  const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true });
  let out = "", err = "";
  ps.stdout.on("data", (d) => { out += d; });
  ps.stderr.on("data", (d) => { err += d; });
  ps.on("close", (code) => resolve(code === 0 && /ok/.test(out) ? { ok: true } : { ok: false, message: err.trim() || `exit ${code}` }));
  ps.on("error", (e) => resolve({ ok: false, message: String(e && e.message) }));
}));

/* ------------------------------------------------------------------ life */

app.whenReady().then(() => {
  serveScheme();
  createWindow();
  // A slow pull while the window is up, so a phone session shows within a minute.
  setInterval(async () => {
    if (!win || win.isDestroyed() || !win.isFocused()) return;
    const p = loadProfiles();
    if (p.active && (await sync.link(p.active))) sync.syncNow(p.active);
  }, sync.IDLE_PULL_MS);
});
app.on("window-all-closed", async () => { await closeAll(); app.quit(); });
