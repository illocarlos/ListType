// Proxy de solo lectura hacia el catálogo de la tienda online de Mercadona.
// Existe solo por CORS: el navegador no puede llamar a Mercadona desde este dominio.
// No guarda nada de personas. Solo deja pasar rutas concretas (categorías y código postal), cachea en el CDN de Vercel
// y, si hay base de datos conectada, guarda una copia compartida de las respuestas del catálogo (ver _catalogcache.js).
// Mercadona no ofrece API pública: esto puede dejar de funcionar en cualquier momento.
//
// Uso: /api/mercadona?path=categories/&lang=es&wh=svq1
//      /api/mercadona?path=categories/112/&lang=es&wh=svq1
//      /api/mercadona?path=home/price-drops/&lang=es&wh=svq1  ·  home/new-arrivals/  ·  products/10380/  ·  products/10380/similars/
//      /api/mercadona?path=ping   -> comprueba que la función está desplegada (no llama a Mercadona)
//      /api/mercadona?path=zone&pc=41300 -> almacén de un código postal: { wh: 'svq1', pc: '41300' }
//      /api/mercadona?path=geo&lat=37.480&lon=-5.980 -> código postal de una ubicación (OpenStreetMap)
//      /api/mercadona?path=status -> 200 si Mercadona responde, 503 si rechaza (para un vigilante externo)
// El catálogo exige almacén (wh). Cualquier parámetro que no sea de la ruta se rechaza con 400.

import { FRESH_MS, giveTurn, isConfigured, keyFor, readCopy, sleep, takeTurn, writeCopy } from './_catalogcache.js';

const UPSTREAM = 'https://tienda.mercadona.es/api/';
// Solo lectura del catálogo público de la tienda: categorías, rebajas, novedades, ficha y parecidos.
// Formas exactas (sin ceros a la izquierda y con la barra final), como las pide la app: cada variante
// sería otra entrada en la caché del CDN y otra petición a Mercadona.
const PATH_RE = /^(categories\/([1-9]\d{0,5}\/)?|home\/(new-arrivals|price-drops)\/|products\/[1-9]\d{0,7}(\.\d{1,3})?\/(similars\/)?)$/;
const WH_RE = /^[a-z0-9]{2,10}$/;
// Códigos postales españoles: las dos primeras cifras son la provincia (01 a 52)
const PC_RE = /^(0[1-9]|[1-4]\d|5[0-2])\d{3}$/;
// Coordenadas ya redondeadas a 3 decimales por la app (unos 100 m)
const COORD_RE = /^-?\d{1,3}\.\d{3}$/;
const TIMEOUT_MS = 8000;

// Parámetros admitidos en cada ruta. Cualquier otro se rechaza: un parámetro inventado crearía
// otra entrada en la caché del CDN y la petición llegaría a Mercadona (o a OpenStreetMap) cada vez.
const ALLOWED_PARAMS = {
    ping: ['path'],
    status: ['path'],
    zone: ['path', 'pc'],
    geo: ['path', 'lat', 'lon'],
    catalog: ['path', 'lang', 'wh'],
};

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
        if (isRefusalStatus(upstream.status)) return sendRefusal(res, upstream.status, 'zone');
        if (upstream.status >= 500) return sendError(res, 502, 'upstream_error', { upstreamStatus: upstream.status });
        if (!upstream.ok || !WH_RE.test(wh)) {
            // Código postal sin reparto online: no cambia de un día para otro, se guarda 1 día para no repetir la pregunta
            return sendError(res, 404, 'no_warehouse', { pc, upstreamStatus: upstream.status }, 86400);
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

// Ubicación -> código postal con OpenStreetMap (Nominatim), siguiendo su política de uso:
// pasa por aquí (servidor propio con caché), se identifica la app y solo se hace cuando el usuario lo pide.
// Las coordenadas se redondean a 3 decimales (unos 100 m): más privacidad y más aciertos de caché.
// No se guarda nada: la ubicación solo sirve para sacar el código postal.
const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';
const APP_ID = 'ListType/1.0 (+https://mercalista.vercel.app)';

async function resolvePostcodeFromLocation(res, latRaw, lonRaw) {
    const lat = Number.parseFloat(String(latRaw ?? ''));
    const lon = Number.parseFloat(String(lonRaw ?? ''));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        return sendError(res, 400, 'invalid_location');
    }
    // España peninsular, Baleares, Canarias, Ceuta y Melilla (caja amplia)
    const inSpain = lat >= 27.4 && lat <= 44.0 && lon >= -18.4 && lon <= 4.5;
    if (!inSpain) return sendError(res, 404, 'outside_spain', {}, 86400);

    const url = new URL(NOMINATIM);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', lat.toFixed(3));
    url.searchParams.set('lon', lon.toFixed(3));
    url.searchParams.set('zoom', '18');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'es');
    try {
        const upstream = await fetch(url, {
            headers: { Accept: 'application/json', 'User-Agent': APP_ID, Referer: 'https://mercalista.vercel.app/' },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (isRefusalStatus(upstream.status)) return sendRefusal(res, upstream.status, 'geo');
        if (!upstream.ok) return sendError(res, 502, 'upstream_error', { upstreamStatus: upstream.status });
        const data = await upstream.json();
        const match = String(data?.address?.postcode ?? '').match(/\d{5}/);
        if (!match) return sendError(res, 404, 'no_postcode', {}, 86400);
        res.setHeader('x-listtype-proxy', '1');
        res.setHeader('Cache-Control', 'public, s-maxage=2592000, stale-while-revalidate=604800');
        return res.status(200).json({ source: 'proxy', pc: match[0], attribution: '© OpenStreetMap contributors' });
    } catch (error) {
        return sendError(res, 502, 'upstream_unreachable', { detail: String(error?.name || error) });
    }
}

// Aviso para el dueño de la app: cada rechazo de Mercadona queda en los registros de Vercel
// con una marca fácil de buscar (Vercel > proyecto > Logs > buscar "MERCADONA_RECHAZO").
function logRefusal(status, path) {
    if (status === 403 || status === 401 || status === 429) {
        console.warn(`[MERCADONA_RECHAZO] status=${status} path=${path}`);
    }
}

// Comprobación de estado para vigilar con un servicio gratuito (UptimeRobot o similar):
// 200 = Mercadona responde; 503 = Mercadona rechaza o no responde. El CDN la guarda 1 h,
// así que aunque el vigilante pregunte cada 5 minutos, a Mercadona solo le llega 1 petición por hora.
async function checkStatus(res) {
    let status = 0;
    try {
        const upstream = await fetchUpstream(buildUrl('categories/', ''));
        status = upstream.status;
    } catch {
        status = 0;
    }
    const ok = status >= 200 && status < 300;
    if (!ok) logRefusal(status, 'status');
    res.setHeader('x-listtype-proxy', '1');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=300');
    return res.status(ok ? 200 : 503).json({
        source: 'proxy',
        mercadona: ok ? 'ok' : 'rechazo',
        upstreamStatus: status,
        checkedAt: new Date().toISOString(),
    });
}

// ¿Es un objeto o una lista JSON? (lo único que devuelve el catálogo de Mercadona)
function isJsonData(body) {
    try {
        const data = JSON.parse(body);
        return data !== null && typeof data === 'object';
    } catch {
        return false;
    }
}

// Errores siempre con source: 'proxy' para que la app distinga un 404 de Mercadona de un 404 de Vercel.
// Por defecto no se guardan; cacheSeconds permite guardar un rato los que se repetirían igual (p. ej. 404).
function sendError(res, status, error, extra = {}, cacheSeconds = 0) {
    res.setHeader('Cache-Control', cacheSeconds > 0 ? `public, s-maxage=${cacheSeconds}` : 'no-store');
    res.setHeader('x-listtype-proxy', '1');
    return res.status(status).json({ source: 'proxy', error, ...extra });
}

// Mercadona (o OpenStreetMap) nos rechaza o pide calma
function isRefusalStatus(status) {
    return status === 401 || status === 403 || status === 429;
}

// Un rechazo se devuelve como 503 (con el código real en upstreamStatus): con un 5xx el CDN aplica
// stale-if-error y sigue sirviendo la última copia buena a todos en vez de pasar cada petición a Mercadona.
// Con 401/403/429 tal cual, el CDN no lo considera error del servidor y no protege nada.
function sendRefusal(res, upstreamStatus, where) {
    console.warn(`[MERCADONA_RECHAZO] status=${upstreamStatus} path=${where}`);
    res.setHeader('Retry-After', '1800');
    return sendError(res, 503, 'upstream_refused', { upstreamStatus });
}

// Un único valor de texto por parámetro (?wh=a&wh=b llega como lista y se rechaza)
function single(value) {
    return typeof value === 'string' ? value : null;
}

function routeOf(path) {
    if (path === 'ping' || path === 'status' || path === 'zone' || path === 'geo') return path;
    return 'catalog';
}

// Responde con la copia de la base de datos. El CDN la guarda solo lo que le queda de frescura (así la
// edad total nunca pasa de 12 h + 1 h, igual que antes); una copia vieja solo 1 minuto.
function sendCopy(res, copy, old) {
    const age = Date.now() - copy.fetchedAt;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('x-listtype-proxy', '1');
    res.setHeader('x-listtype-source', 'db');
    res.setHeader('x-listtype-fetched-at', String(copy.fetchedAt));
    res.setHeader('Cache-Control', old
        ? 'public, s-maxage=60'
        : `public, s-maxage=${Math.max(60, Math.floor((FRESH_MS - age) / 1000))}, stale-while-revalidate=3600, stale-if-error=86400`);
    return res.status(200).send(copy.body);
}

function sendOldCopy(res, copy, path, why) {
    console.warn(`[CATALOGO_COPIA_VIEJA] path=${path} edad=${Math.round((Date.now() - copy.fetchedAt) / 60000)}min motivo=${why}`);
    return sendCopy(res, copy, true);
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return sendError(res, 405, 'method_not_allowed');
    }

    const path = single(req.query.path);
    if (path === null) return sendError(res, 400, 'path_not_allowed');

    const route = routeOf(path);
    const unexpected = Object.keys(req.query).filter(key => !ALLOWED_PARAMS[route].includes(key));
    if (unexpected.length > 0) return sendError(res, 400, 'unexpected_param');

    if (route === 'ping') {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('x-listtype-proxy', '1');
        return res.status(200).json({ source: 'proxy', ok: true });
    }

    if (route === 'status') {
        return checkStatus(res);
    }

    if (route === 'geo') {
        const lat = single(req.query.lat);
        const lon = single(req.query.lon);
        if (!lat || !lon || !COORD_RE.test(lat) || !COORD_RE.test(lon)) return sendError(res, 400, 'invalid_location');
        return resolvePostcodeFromLocation(res, lat, lon);
    }

    if (route === 'zone') {
        return resolveZone(res, single(req.query.pc) ?? '');
    }

    if (!PATH_RE.test(path)) {
        return sendError(res, 400, 'path_not_allowed');
    }

    // Almacén obligatorio y exacto (en minúsculas): nada de reintentos con otro almacén.
    // Antes, si un producto no existía en tu zona, se pedía el de la zona por defecto y se enseñaba
    // con el precio de otra zona, guardado 12 h como si fuera el tuyo.
    const wh = single(req.query.wh);
    const lang = req.query.lang === undefined ? 'es' : single(req.query.lang);
    if (!wh || !WH_RE.test(wh) || lang !== 'es') return sendError(res, 400, 'invalid_params');

    // Copia compartida en la base de datos (si está conectada): el primero de cada almacén va a Mercadona
    // y los demás reciben su copia. Si la base de datos falla, todo sigue como antes.
    const cacheKey = keyFor(wh, path);
    let dbUp = isConfigured();
    let copy = null;
    if (dbUp) {
        const read = await readCopy(cacheKey);
        if (read.down) dbUp = false;
        else copy = read.copy;
    }
    if (copy && Date.now() - copy.fetchedAt < FRESH_MS) return sendCopy(res, copy, false);

    let myTurn = false;
    try {
        if (dbUp) {
            const turn = await takeTurn(cacheKey);
            if (turn === null) dbUp = false;
            else if (turn) myTurn = true;
            else {
                // Otro móvil ya está pidiéndola a Mercadona: con una copia vieja se sirve esa; si no, se espera la nueva
                if (copy) return sendCopy(res, copy, true);
                for (let i = 0; i < 6; i++) {
                    await sleep(800);
                    const again = await readCopy(cacheKey, false);
                    if (again.down) break;
                    if (again.copy && Date.now() - again.copy.fetchedAt < FRESH_MS) return sendCopy(res, again.copy, false);
                }
                // Nadie la entregó a tiempo (rarísimo): se pide por cuenta propia, como antes
            }
        }

        const upstream = await fetchUpstream(buildUrl(path, wh));

        if (!upstream.ok) {
            if (isRefusalStatus(upstream.status)) {
                // Mercadona rechaza: no se insiste. Con copia guardada se sigue sirviendo esa.
                if (copy) {
                    console.warn(`[MERCADONA_RECHAZO] status=${upstream.status} path=${path}`);
                    return sendOldCopy(res, copy, path, `rechazo ${upstream.status}`);
                }
                return sendRefusal(res, upstream.status, path);
            }
            // "No existe en tu zona" no cambia de un minuto a otro: se guarda 10 min para no repetir la pregunta
            if (upstream.status !== 404 && copy) return sendOldCopy(res, copy, path, `error ${upstream.status}`);
            return sendError(res, upstream.status, 'upstream_error', { upstreamStatus: upstream.status }, upstream.status === 404 ? 600 : 0);
        }

        const body = await upstream.text();
        // Solo se guarda y se reparte si son datos de verdad. Si Mercadona responde con una página
        // (un control anti-bots, una página de mantenimiento…), no se guarda: si se guardase,
        // la app se quedaría sin catálogo 12 h para todo el mundo.
        if (!isJsonData(body)) {
            console.warn(`[MERCADONA_NO_JSON] path=${path} type=${upstream.headers.get('content-type') || '?'}`);
            if (copy) return sendOldCopy(res, copy, path, 'no es JSON');
            return sendError(res, 502, 'upstream_not_json', { upstreamStatus: upstream.status });
        }
        const fetchedAt = Date.now();
        if (dbUp) await writeCopy(cacheKey, body, fetchedAt);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('x-listtype-proxy', '1');
        // Hora a la que se sacó de Mercadona. El CDN la guarda con la copia, así el móvil sabe la edad
        // real del precio aunque reciba una copia de hace horas (o la de stale-if-error).
        res.setHeader('x-listtype-fetched-at', String(fetchedAt));
        // Productos y precios: el CDN de Vercel guarda la copia 12 h y solo puede entregar una copia
        // caducada durante 1 h más mientras busca la nueva. Con la caché de 24 h del móvil, el retraso
        // máximo de un precio queda en día y medio aproximadamente, con la mitad de peticiones que a 6 h.
        // stale-if-error: si al renovarla Mercadona falla, el CDN sigue sirviendo la última copia buena
        // hasta 1 día más en vez del error.
        res.setHeader('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=3600, stale-if-error=86400');
        return res.status(200).send(body);
    } catch (error) {
        if (copy) return sendOldCopy(res, copy, path, String(error?.name || error));
        return sendError(res, 502, 'upstream_unreachable', { detail: String(error?.name || error) });
    } finally {
        if (myTurn) await giveTurn(cacheKey);
    }
}
