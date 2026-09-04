/* Service worker: the app is one big HTML file, so cache it whole and serve it
 * offline. CACHE is stamped by the build, which is what evicts the old copy. */

const CACHE = "rb-@BUILD@";
const SHELL = ["./", "./index.html", "./manifest.json",
               "./icons/icon-192.png", "./icons/icon-512.png",
               "./icons/icon-maskable-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      // A single missing file must not wedge the install.
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Google Fonts: use whatever was cached, refresh in the background.
  if (url.origin.includes("fonts.g")) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(req).then((hit) => {
          const net = fetch(req).then((res) => { c.put(req, res.clone()); return res; })
                                .catch(() => hit);
          return hit || net;
        }))
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // Navigations always resolve to the cached shell when the network is gone.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});
