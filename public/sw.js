/* تمكين | EMPOWER — service worker للنسخة المحمولة.
   القاعدة: لا تُخزّن أي استجابة /api، ولا أي رابط يحتوي رمز كيسك،
   ولا صفحة تحتوي بيانات مستخدم. نخزّن فقط هيكل التطبيق وأصوله الثابتة. */

const SHELL_CACHE = 'tamkeen-mobile-shell-v5';
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

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('tamkeen-mobile-shell-') && name !== SHELL_CACHE).map((name) => caches.delete(name)));
    await clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.includes('/kiosk/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && url.pathname === '/m') {
          const cache = await caches.open(SHELL_CACHE);
          await cache.put('/m', response.clone());
        }
        return response;
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match(url.pathname === '/m' ? '/m' : '/index.html')) || Response.error();
      }
    })());
    return;
  }

  if (['style', 'script', 'font', 'image'].includes(request.destination)) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(request);
      const network = fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') cache.put(request, response.clone());
        return response;
      }).catch(() => cached);
      return cached || network;
    })());
  }
});
