// Service worker de la app instalable: permite abrirla sin cobertura (por ejemplo, dentro del súper).
// - Página: primero la red (así siempre se ve la última versión) y, sin conexión, la última guardada.
//   Solo se guarda como copia una página buena de verdad (200, HTML, de este sitio): una página de error
//   guardada haría que, sin conexión, la app enseñara el error en vez de abrirse.
// - Al instalarse y cada vez que llega una versión nueva de la página, se guardan también sus archivos
//   (JS, CSS y fuentes de /assets/), para que la siguiente apertura sin cobertura no salga en blanco.
//   Los de versiones anteriores se borran.
// - Archivos de /assets/ (llevan huella en el nombre): primero la caché.
// - /api/ y todo lo de otros dominios (Mercadona) no pasa por aquí: lo gestiona la app.

const CACHE = 'lista-compra-v2';
const SHELL = ['/manifest.webmanifest', '/favicon.svg', '/apple-touch-icon.png', '/icon-192.png'];

const isGoodPage = response =>
    response && response.ok && response.type === 'basic' && !response.redirected
    && (response.headers.get('content-type') || '').includes('text/html');

// Texto de un archivo de /assets/: de la caché si ya está, si no de la red (y se guarda)
async function assetText(url, cache) {
    let response = await cache.match(url);
    if (!response) {
        response = await fetch(url);
        if (!response.ok) return '';
        await cache.put(url, response.clone());
    }
    return response.text();
}

// Archivos de /assets/ que usa una página: los del HTML; en sus CSS, las fuentes (solo woff2, el formato
// que usan los móviles); y en su JS principal, los trozos que se cargan al usarse (la librería del PDF),
// para que no se borren al limpiar y el PDF funcione también sin cobertura.
async function assetsOf(html, cache) {
    const urls = new Set((html.match(/\/assets\/[^"'\s)]+/g) || []));
    for (const url of [...urls]) {
        try {
            if (url.endsWith('.css')) {
                for (const font of (await assetText(url, cache)).match(/\/assets\/[^"'\s)]+\.woff2/g) || []) urls.add(font);
            } else if (url.endsWith('.js')) {
                for (const [, name] of (await assetText(url, cache)).matchAll(/["'`]\.\/([\w.-]+\.js)["'`]/g)) urls.add(`/assets/${name}`);
            }
        } catch {
            // sin red: se queda con lo que haya
        }
    }
    return urls;
}

// Guarda la página y sus archivos, y borra los archivos de versiones anteriores
async function storeVersion(page) {
    const cache = await caches.open(CACHE);
    const html = await page.clone().text();
    await cache.put('/', page);
    const urls = await assetsOf(html, cache);
    await Promise.all([...urls].map(async url => {
        if (await cache.match(url)) return;
        try {
            const response = await fetch(url);
            if (response.ok) await cache.put(url, response);
        } catch {
            // sin red: se intentará en la próxima versión
        }
    }));
    for (const request of await cache.keys()) {
        const path = new URL(request.url).pathname;
        if (path.startsWith('/assets/') && !urls.has(path)) await cache.delete(request);
    }
}

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        await cache.addAll(SHELL);
        try {
            const page = await fetch('/', { cache: 'reload' });
            if (isGoodPage(page)) await storeVersion(page);
        } catch {
            // sin red al instalar: la página se guardará en la próxima visita
        }
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (isGoodPage(response)) event.waitUntil(storeVersion(response.clone()));
                    return response;
                })
                .catch(async () => (await caches.match('/')) || Response.error())
        );
        return;
    }

    if (url.pathname.startsWith('/assets/')) {
        event.respondWith(
            caches.match(request).then(cached => cached || fetch(request).then(response => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE).then(cache => cache.put(request, copy));
                }
                return response;
            }))
        );
    }
});
