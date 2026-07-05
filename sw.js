// Minimal app-shell cache. Bump CACHE_NAME whenever index.html changes
// meaningfully so returning visitors get the fresh version.
const CACHE_NAME = 'my-tasks-shell-v5';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Never cache calls to Google's APIs — those must always hit the network.
  if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('google.com')) return;

  // Network-first for the app shell itself, so edits you push show up
  // immediately; falls back to cache when offline.
  if (SHELL.some(p => url.pathname.endsWith(p.replace('./','')))) {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
});
