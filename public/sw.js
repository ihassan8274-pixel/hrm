/* تمكين | EMPOWER — service worker للنسخة المحمولة.
   القاعدة: لا تُخزّن أي استجابة /api أو /kiosk أو /uploads، ولا أي صفحة تحمل بيانات مستخدم.
   تُخزَّن فقط أصول الهيكل الثابتة المذكورة صراحةً أدناه، مع إصدار BUILD_ID مشتق من
   أسماء أصول Vite؛ تغيّر الأصول يعني إبطال كل التخزين القديم تلقائياً. */

const BUILD_ID = "__BUILD_ID__";
const ASSET_URLS = __ASSET_URLS__;

const SHELL_CACHE = `tamkeen-mobile-shell-${BUILD_ID}`;
const SHELL = [
  '/m',
  '/index.html',
  '/manifest.json',
  '/m-manifest.json',
  '/brand/empower-3d-icon.png',
  '/brand/apple-touch-icon-180.png',
  '/brand/pwa-icon-192.png',
  '/brand/pwa-icon-512.png',
  '/brand/pwa-icon-maskable-512.png',
  '/brand/plex-arabic-400.ttf',
  '/brand/plex-arabic-500.ttf',
  '/brand/plex-arabic-600.ttf',
  '/brand/plex-arabic-700.ttf',
  '/brand/plex-sans-400.ttf',
  '/brand/plex-sans-500.ttf',
  '/brand/plex-sans-600.ttf',
  '/brand/plex-sans-700.ttf',
];

// Allow-list, never a deny-list: an unknown URL is simply left on the network.
const CACHEABLE = new Set([...SHELL, ...ASSET_URLS]);
const FORBIDDEN = /^\/(api|kiosk|uploads)(\/|$)/i;

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all([...CACHEABLE].map((url) =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {}),
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith('tamkeen-mobile-shell-') && name !== SHELL_CACHE)
      .map((name) => caches.delete(name)));
    await clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.search || url.hash) return;
  if (FORBIDDEN.test(url.pathname)) return;

  // Only the static /m shell is stored offline. It contains no employee data;
  // all /api calls always go straight to the network, even while offline.
  if (request.mode === 'navigate') {
    if (url.pathname.replace(/\/$/, '') !== '/m') return;
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') await cache.put('/m', response.clone());
        return response;
      } catch {
        return (await cache.match('/m')) || Response.error();
      }
    })());
    return;
  }

  if (!CACHEABLE.has(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(url.pathname);
    const network = fetch(request).then((response) => {
      if (response.ok && response.type === 'basic') cache.put(url.pathname, response.clone());
      return response;
    }).catch(() => cached || Response.error());
    return cached || network;
  })());
});
