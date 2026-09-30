// 오프라인 캐시: 앱 틀은 캐시 우선, data.json은 네트워크 우선(실패 시 마지막 데이터)
const CACHE = "sw-daad32aa2b";
const SHELL = ["./", "index.html", "app.js?v=daad32aa2b", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "vendor/lightweight-charts.js"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  const netFirst = url.origin === location.origin && (url.pathname.endsWith("/data.json") || req.mode === "navigate");
  if (netFirst) {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("index.html"))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok && (url.origin === location.origin || url.hostname.endsWith("jsdelivr.net") || url.hostname.endsWith("gstatic.com") || url.hostname.endsWith("googleapis.com"))) {
      const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp));
    }
    return r;
  })));
});
