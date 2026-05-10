// ══ CapriScan — Service Worker ══
// À déposer à la RACINE de ton dépôt GitHub, à côté de index.html

const CACHE_NAME = 'capriscan-v2';

// Ressources à mettre en cache immédiatement à l'installation
const PRECACHE = [
  './',
  './index.html',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
];

// ── Installation : mise en cache initiale ──
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(PRECACHE.map(url => cache.add(url)));
    })
  );
});

// ── Activation : nettoyage des anciens caches ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch : stratégie selon le type de requête ──
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Firebase Auth / Firestore / SDK → réseau uniquement, jamais de cache
  if (
    url.includes('firebaseapp.com') ||
    url.includes('googleapis.com/identitytoolkit') ||
    url.includes('firestore.googleapis.com') ||
    url.includes('securetoken.googleapis.com') ||
    url.includes('gstatic.com/firebasejs')
  ) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('', { status: 503 }))
    );
    return;
  }

  // Polices Google Fonts → cache avec mise à jour en arrière-plan
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

  // Tout le reste (index.html, assets...) → cache en priorité, réseau en fallback
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) {
        // Mettre à jour le cache en arrière-plan (stale-while-revalidate)
        fetch(e.request).then(res => {
          if (res && res.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
          }
        }).catch(() => {});
        return cached;
      }
      // Pas en cache → réseau, puis on met en cache
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        // Hors ligne et pas en cache : retourner index.html comme fallback
        return caches.match('./index.html');
      });
    })
  );
});
