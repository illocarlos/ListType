// Proxy de solo lectura hacia el catálogo de la tienda online de Mercadona.
// Existe solo por CORS: el navegador no puede llamar a Mercadona desde este dominio.
// No guarda nada. Solo deja pasar dos rutas concretas y cachea en el CDN de Vercel.
// Mercadona no ofrece API pública: esto puede dejar de funcionar en cualquier momento.

const UPSTREAM = 'https://tienda.mercadona.es/api/';
const PATH_RE = /^categories\/(\d{1,6}\/)?$/;
const WH_RE = /^[a-z0-9]{2,10}$/;
const TIMEOUT_MS = 8000;

function fetchUpstream(url) {
    return fetch(url, {
        headers: {
            Accept: 'application/json',
            'User-Agent': 'ListType/1.0 (lista de la compra personal)',
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
}

function buildUrl(path, wh) {
    const url = new URL(path, UPSTREAM);
    url.searchParams.set('lang', 'es');
    if (wh) url.searchParams.set('wh', wh);
    return url;
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'method_not_allowed' });
    }

    const rawPath = Array.isArray(req.query.path) ? req.query.path.join('/') : String(req.query.path ?? '');
    const path = rawPath.endsWith('/') ? rawPath : `${rawPath}/`;
    if (!PATH_RE.test(path)) {
        return res.status(400).json({ error: 'path_not_allowed' });
    }

    const wh = String(req.query.wh ?? '').toLowerCase();
    const validWh = WH_RE.test(wh) ? wh : '';

    try {
        let upstream = await fetchUpstream(buildUrl(path, validWh));
        let fallback = false;

        // Si el almacén pedido no existe, se reintenta una vez con el de por defecto de Mercadona
        if (validWh && upstream.status >= 400 && upstream.status < 500 && upstream.status !== 429) {
            upstream = await fetchUpstream(buildUrl(path, ''));
            fallback = true;
        }

        const body = await upstream.text();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (fallback) res.setHeader('x-wh-fallback', '1');
        res.setHeader(
            'Cache-Control',
            upstream.ok ? 'public, s-maxage=86400, stale-while-revalidate=604800' : 'no-store'
        );
        return res.status(upstream.status).send(upstream.ok ? body : JSON.stringify({ error: 'upstream_error', status: upstream.status }));
    } catch {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(502).json({ error: 'upstream_unreachable' });
    }
}
