// ══ CapriScan — Service Worker ══
const CACHE_NAME = 'capriscan-v1.4';

const PRECACHE = [
  './',
  './index.html',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
];

// ── Installation ──
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(PRECACHE.map(url => cache.add(url)))
    )
  );
});

// ── Activation : nettoyage anciens caches + notification mise à jour ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(async keys => {
      await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      clients.forEach(client => client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME }));
    })
  );
  self.clients.claim();
});

// ── Fetch ──
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Firebase → réseau uniquement
  if (
    url.includes('firebaseapp.com') ||
    url.includes('googleapis.com/identitytoolkit') ||
    url.includes('firestore.googleapis.com') ||
    url.includes('securetoken.googleapis.com') ||
    url.includes('gstatic.com/firebasejs')
  ) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // Google Fonts → cache + revalidation
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const network = fetch(e.request).then(res => {
          caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
          return res;
        });
        return cached || network;
      })
    );
    return;
  }

  // index.html → réseau en priorité (toujours la dernière version)
  if (url.endsWith('/') || url.includes('index.html')) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.status === 200) {
          caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Autres assets → cache en priorité
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) {
        fetch(e.request).then(res => {
          if (res && res.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
