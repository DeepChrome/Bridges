/* Ya for Windows — the page's first breath.
 *
 * The payload is fetched before the app's modules run (tools/build.mjs turns
 * every `require` of a payload part into `__yaJson(name)`): data.json and
 * the parts the first screens read are loaded here in parallel, and a part
 * first needed later — the video library, a transcript — is read on demand
 * with a synchronous request, which a page served by the app's own scheme
 * may make. Then the app proper (main.jsx) is imported. */

const PRELOAD = ["data.json", "deep.json", "sent.json", "senses.json", "deepforms.json"];
const cache = new Map();

function syncLoad(rel) {
  const xhr = new XMLHttpRequest();
  xhr.open("GET", "ya://assets/" + rel, false);
  xhr.send(null);
  if (xhr.status !== 200) throw new Error(`payload part ${rel}: ${xhr.status}`);
  return JSON.parse(xhr.responseText);
}

globalThis.__yaJson = (rel) => {
  if (!cache.has(rel)) cache.set(rel, syncLoad(rel));
  return cache.get(rel);
};

async function preload() {
  await Promise.all(PRELOAD.map(async (rel) => {
    const r = await fetch("ya://assets/" + rel);
    if (!r.ok) throw new Error(`payload part ${rel}: ${r.status}`);
    cache.set(rel, await r.json());
  }));
}

const root = document.getElementById("root");
preload().then(() => import("./main.jsx")).catch((e) => {
  root.innerHTML = `<div class="empty">Ya could not load its data.<br><small>${String(e && e.message)}</small></div>`;
});
