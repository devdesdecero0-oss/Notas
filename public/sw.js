// Service Worker para NoteX PWA
// Estrategia: Network First (intenta la red, cae en caché si falla)

const CACHE_VERSION = 'notex-v2';
const SHELL = [
  '/',
  '/login',
  '/static/css/style.css',
  '/static/js/app.js',
  '/static/js/login.js',
  '/static/imagenes/icon-192.png',
  '/static/imagenes/icon-512.png',
  '/manifest.json',
];

// ── Instalación: pre-cachea el shell de la app ──────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

// ── Activación: borra cachés viejos ────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: Network First ────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Las llamadas a la API nunca van al caché
  if (url.pathname.startsWith('/notas') || url.pathname.startsWith('/api/')) {
    return; // deja que el navegador maneje la solicitud normalmente
  }

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        // Si la respuesta es válida, la guarda en caché y la devuelve
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Sin red: devuelve lo que haya en caché
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // Si piden la raíz y no hay caché, devuelve la página de login
          if (url.pathname === '/') return caches.match('/login');
          return new Response('Sin conexión', { status: 503 });
        });
      })
  );
});
