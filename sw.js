
const CACHE = 'lexicycle-selfcontained-v13';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll([
        './',
        './index.html'
      ]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k =>
            k.startsWith('lexicycle-') &&
            k !== CACHE
          )
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(
      new URL(self.registration.scope).pathname
    )
  ) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE)
              .then(c =>
                c.put('./index.html', copy)
              )
              .catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches.match('./index.html')
            .then(r => r || Response.error())
        )
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(cached =>
      cached || fetch(req).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE)
            .then(c => c.put(req, copy))
            .catch(() => {});
        }
        return response;
      })
    )
  );
});
