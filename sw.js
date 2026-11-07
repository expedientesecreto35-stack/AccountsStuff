/* Cuentas P2P — service worker
   Hace que la app abra sin conexión y se pueda instalar.
   - Páginas: primero la red (así siempre tienes la versión nueva); si no hay red o tarda más de 4 s, la copia guardada.
   - Archivos propios y tipografías: usa la copia guardada y la renueva en segundo plano.
   - NUNCA toca otras direcciones (GitHub, gists): la sincronización va directo a la red, sin pasar por aquí. */
const V = 'p2p-v3';
const SHELL = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
const FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    await Promise.all(SHELL.map((u) => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('p2p-') && k !== V) await caches.delete(k);
    await self.clients.claim();
  })());
});

/* La página pide guardar su propia dirección (la primera visita ocurre antes de que el worker controle la página) */
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (!d.cache) return;
  e.waitUntil((async () => {
    try {
      const u = new URL(d.cache, self.location.href);
      if (u.origin !== self.location.origin) return;
      const r = await fetch(u.href, { cache: 'reload' });
      if (!r.ok) return;
      const c = await caches.open(V);
      await c.put(u.href, r.clone());
      await c.put(self.registration.scope, r); /* para que abrir la app desde el icono también funcione sin conexión */
    } catch (_) {}
  })());
});

async function pagina(req) {
  const c = await caches.open(V);
  let mala = null;
  try {
    const r = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(() => no(new Error('tiempo')), 4000))]);
    if (r.ok) { c.put(req, r.clone()).catch(() => {}); return r; }
    mala = r;
  } catch (_) {}
  const hit = (await c.match(req, { ignoreSearch: true })) || (await c.match(self.registration.scope));
  return hit || mala || new Response('Sin conexión. Abre la app una vez con internet para poder usarla sin conexión.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

async function renovar(req) {
  const c = await caches.open(V);
  const hit = await c.match(req);
  const red = fetch(req).then((r) => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()).catch(() => {}); return r; }).catch(() => null);
  if (hit) return hit;
  return (await red) || Response.error();
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === self.location.origin) { e.respondWith(pagina(req)); return; }
  if (url.origin === self.location.origin || FONTS.test(req.url)) e.respondWith(renovar(req));
});
