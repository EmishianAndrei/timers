// Кэш для работы без интернета. Файлы сайта берутся из сети (чтобы сразу получать обновления),
// а без сети — из кэша. Шрифты и иконки — сначала из кэша.
const CACHE = "tracker-v8";
const FILES = ["./", "index.html", "js/core.js", "js/timers.js", "js/tracker.js", "js/recipes.js", "js/tasks.js", "js/money.js", "js/main.js", "manifest.webmanifest", "favicon.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (/\.png$/.test(url.pathname)) { e.respondWith(caches.match(req).then(hit => hit || fetch(req))); return; }
    // no-cache: всегда спрашиваем GitHub, не изменился ли файл (иначе браузер до 10 минут отдаёт старую версию)
    e.respondWith(fetch(req, {cache: "no-cache"}).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req.mode === "navigate" ? "index.html" : req, copy)); }
      return res;
    }).catch(() => caches.match(req.mode === "navigate" ? "index.html" : req, {ignoreSearch: true})));
    return;
  }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    })));
  }
  // запросы к Apps Script не кэшируются
});
