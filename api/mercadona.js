// Proxy de solo lectura hacia el catálogo de la tienda online de Mercadona.
// Existe solo por CORS: el navegador no puede llamar a Mercadona desde este dominio.
// No guarda nada. Solo deja pasar rutas concretas (categorías y código postal) y cachea en el CDN de Vercel.
// Mercadona no ofrece API pública: esto puede dejar de funcionar en cualquier momento.
//
// Uso: /api/mercadona?path=categories/&lang=es&wh=svq1
//      /api/mercadona?path=categories/112/&lang=es&wh=svq1
//      /api/mercadona?path=ping   -> comprueba que la función está desplegada (no llama a Mercadona)
//      /api/mercadona?path=zone&pc=41300 -> almacén de un código postal: { wh: 'svq1', pc: '41300' }

const UPSTREAM = 'https://tienda.mercadona.es/api/';
const PATH_RE = /^categories\/(\d{1,6}\/)?$/;
const WH_RE = /^[a-z0-9]{2,10}$/;
const PC_RE = /^\d{5}$/;
const TIMEOUT_MS = 8000;

// Código postal -> almacén. La tienda de Mercadona hace lo mismo: envía el código postal
// y la respuesta trae el almacén en la cabecera x-customer-wh. No se guarda nada del usuario.
async function resolveZone(res, pc) {
    if (!PC_RE.test(pc)) return sendError(res, 400, 'invalid_postal_code');
    try {
        const upstream = await fetch(new URL('postal-codes/actions/change-pc/', UPSTREAM), {
            method: 'PUT',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'ListType/1.0 (lista de la compra personal)',
            },
            body: JSON.stringify({ new_postal_code: pc }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const wh = (upstream.headers.get('x-customer-wh') || '').trim().toLowerCase();
        if (upstream.status === 429) return sendError(res, 429, 'upstream_error', { upstreamStatus: 429 });
        if (!upstream.ok || !WH_RE.test(wh)) {
            // Código postal sin reparto online o respuesta sin almacén
            return sendError(res, 404, 'no_warehouse', { pc, upstreamStatus: upstream.status });
        }
        res.setHeader('x-listtype-proxy', '1');
        // La relación código postal -> almacén cambia muy poco: 30 días en el CDN
        res.setHeader('Cache-Control', 'public, s-maxage=2592000, stale-while-revalidate=604800');
        return res.status(200).json({ source: 'proxy', pc, wh });
    } catch (error) {
        return sendError(res, 502, 'upstream_unreachable', { detail: String(error?.name || error) });
    }
}

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

// Errores siempre con source: 'proxy' para que la app distinga un 404 de Mercadona de un 404 de Vercel
function sendError(res, status, error, extra = {}) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('x-listtype-proxy', '1');
    return res.status(status).json({ source: 'proxy', error, ...extra });
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return sendError(res, 405, 'method_not_allowed');
    }

    const rawPath = Array.isArray(req.query.path) ? req.query.path.join('/') : String(req.query.path ?? '');

    if (rawPath === 'ping') {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('x-listtype-proxy', '1');
        return res.status(200).json({ source: 'proxy', ok: true, node: process.version });
    }

    if (rawPath === 'zone') {
        return resolveZone(res, String(req.query.pc ?? '').trim());
    }

    const path = rawPath.endsWith('/') ? rawPath : `${rawPath}/`;
    if (!PATH_RE.test(path)) {
        return sendError(res, 400, 'path_not_allowed', { path: rawPath });
    }

    const wh = String(req.query.wh ?? '').toLowerCase();
    const validWh = WH_RE.test(wh) ? wh : '';

    try {
        let upstreamUrl = buildUrl(path, validWh);
        let upstream = await fetchUpstream(upstreamUrl);
        let fallback = false;

        // Si el almacén pedido no existe, se reintenta una vez con el de por defecto de Mercadona
        if (validWh && upstream.status >= 400 && upstream.status < 500 && upstream.status !== 429) {
            upstreamUrl = buildUrl(path, '');
            upstream = await fetchUpstream(upstreamUrl);
            fallback = true;
        }

        if (!upstream.ok) {
            return sendError(res, upstream.status, 'upstream_error', {
                upstreamStatus: upstream.status,
                upstreamUrl: upstreamUrl.toString(),
                whFallback: fallback,
            });
        }

        const body = await upstream.text();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('x-listtype-proxy', '1');
        if (fallback) res.setHeader('x-wh-fallback', '1');
        res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
        return res.status(200).send(body);
    } catch (error) {
        return sendError(res, 502, 'upstream_unreachable', { detail: String(error?.name || error) });
    }
}
