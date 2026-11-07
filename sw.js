// Service worker : l'app s'ouvre et fabrique des PDF même sans internet,
// et les nouvelles versions publiées arrivent toutes seules.
//
// Stratégie « réseau d'abord » : avec internet, on prend toujours la dernière version
// publiée (et on la garde de côté) ; sans internet, on sert la copie gardée.
// Le tableau Google (autre site) n'est pas géré ici : l'app garde elle-même la dernière liste.

const CACHE = "quittances-v1";
const FICHIERS = [
  "./",
  "index.html",
  "css/app.css",
  "js/app.js",
  "js/config.js",
  "js/montant.js",
  "js/sheet.js",
  "js/pdf.js",
  "js/storage.js",
  "vendor/jspdf.umd.min.js",
  "assets/signature.png",
  "manifest.webmanifest",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];
const DELAI_RESEAU_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FICHIERS.map((f) => new Request(f, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function avecDelai(promesse, ms) {
  return new Promise((ok, ko) => {
    const t = setTimeout(() => ko(new Error("délai")), ms);
    promesse.then((r) => { clearTimeout(t); ok(r); }, (e) => { clearTimeout(t); ko(e); });
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // ignoreSearch : « index.html?source=pwa » utilise la même copie que « index.html »
    const copie = () => cache.match(req, { ignoreSearch: true })
      .then((r) => r || (req.mode === "navigate" ? cache.match("index.html") : undefined));
    try {
      const rep = await avecDelai(fetch(req, { cache: "no-cache" }), DELAI_RESEAU_MS);
      if (rep && rep.ok && rep.type === "basic") cache.put(req, rep.clone());
      return rep;
    } catch (e) {
      const r = await copie();
      if (r) return r;
      throw e;
    }
  })());
});
