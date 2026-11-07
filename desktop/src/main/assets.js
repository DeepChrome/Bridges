/* Where the payload and the media are, and the ya:// scheme that serves them.
 *
 * In development the renderer reads native/assets straight from the repo —
 * the same files the phone bundles — so a rebuild of the payload is seen on
 * the next launch with no copying. Packaged, electron-builder has copied
 * them to the installer's resources (package.json `extraResources`).
 *
 * Everything is served as `ya://assets/<path under assets>`; the renderer
 * itself is `ya://app/index.html`. A privileged standard scheme, so the
 * window has a real origin, fetch works, and a 150 MB clip library streams
 * by range request rather than being read into memory.
 */

import { app, protocol, net } from "electron";
import { join, normalize, resolve } from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SCHEME = "ya";

export function assetsRoot() {
  if (app.isPackaged) return join(process.resourcesPath, "assets");
  return resolve(__dirname, "..", "..", "native", "assets");
}

function appRoot() {
  // The built renderer sits beside this file (desktop/build).
  return __dirname;
}

export function registerScheme() {
  protocol.registerSchemesAsPrivileged([{
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  }]);
}

/* A path under a root, or null when it climbs out of it. */
function safeJoin(root, rel) {
  const p = normalize(join(root, rel));
  return p.startsWith(normalize(root)) ? p : null;
}

export function serveScheme() {
  const assets = assetsRoot(), page = appRoot();
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const root = url.host === "assets" ? assets : url.host === "app" ? page : null;
    const file = root ? safeJoin(root, rel) : null;
    if (!file || !existsSync(file)) return new Response("not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString(), { headers: request.headers }).then((r) => {
      // The page and the assets are two origins of one scheme; the assets say so.
      const headers = new Headers(r.headers);
      headers.set("access-control-allow-origin", "*");
      return new Response(r.body, { status: r.status, headers });
    });
  });
}
