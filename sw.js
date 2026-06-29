// ══ CapriScan — Service Worker ══
const CACHE_NAME = 'capriscan-v1.5';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './manifest-pc.json',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
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

  // ── Requêtes non-GET (écritures Firestore POST, etc.) ──
  // On ne les intercepte JAMAIS : l'API Cache ne gère que le GET, et toute
  // interception d'un POST peut casser le write channel Firestore (bug PC).
  if (e.request.method !== 'GET') return;

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

  // Version PC → réseau OBLIGATOIRE (jamais mise en cache, jamais servie hors-ligne)
  // Garantit que l'utilisateur est bien connecté pour la synchronisation cloud.
  if (url.includes('capriscan_pc.html')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(
          '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
          '<meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<title>Connexion requise — CapriScan</title>' +
          '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
          'background:#111714;color:#e6efe9;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:24px}' +
          'div{max-width:360px}h1{font-size:1.15rem;margin:0 0 10px}' +
          'p{margin:0;color:#9fb3a6;font-size:.92rem;line-height:1.55}</style>' +
          '</head><body><div><h1>🌐 Connexion requise</h1>' +
          '<p>La version PC de CapriScan nécessite une connexion internet pour garantir ' +
          'la synchronisation de vos données. Reconnectez-vous, puis rechargez la page.</p>' +
          '</div></body></html>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 200 }
        )
      )
    );
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
