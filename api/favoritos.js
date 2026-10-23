// Compartir favoritos con otra persona: una COPIA PUNTUAL (como mandar una foto de la lista), no una lista viva.
// Quien comparte sube una copia de sus favoritos y recibe un enlace; quien lo abre decide en su móvil si la une a
// los suyos o la guarda aparte. Después cada uno tiene lo suyo: no hay sincronización ni se puede cambiar lo del otro.
// No hay cuentas: el identificador (22 caracteres al azar, 128 bits) es la llave. Las copias caducan a los 90 días.
//
// Todo va por POST con JSON (el identificador nunca viaja en la dirección, que queda en los registros):
//   { op: "ping" }                                  -> ¿está configurada la base de datos?
//   { op: "create", name, from, items: [...] }      -> sube la copia y devuelve el identificador
//   { op: "get", id }                               -> devuelve { name, from, items }
//
// Gasto: crear son unas 4 operaciones de Redis y abrir un enlace, 1. Con topes por IP y por día para que
// nadie pueda agotar la cuota gratis.
import { credentials } from './_redis.js';
import { HttpError, cleanItem, fromAnotherSite, limitCreate, newId, redis, text } from './_common.js';

const ID_RE = /^[A-Za-z0-9_-]{22}$/;
const TTL_SECONDS = 90 * 24 * 60 * 60;
const MAX_ITEMS = 300;
const MAX_BODY = 100_000;
// Menos que las listas: compartir favoritos se hace de vez en cuando
const CREATE_PER_IP_HOUR = 20;
const CREATE_GLOBAL_DAY = 400;

const key = id => `mf:${id}`;

// cleanItem apunta quién y cuándo (cosas de las listas compartidas): en favoritos no viajan
function cleanFavorite(raw) {
    const item = cleanItem(raw);
    delete item.addedBy;
    delete item.addedAt;
    return item;
}

const cleanLabel = (value, max) => {
    const label = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
    return text(label, max) ?? label.slice(0, max);
};

async function create(body, req) {
    if (!Array.isArray(body.items) || body.items.length === 0) throw new HttpError(400, 'no_items');
    if (body.items.length > MAX_ITEMS) throw new HttpError(400, 'too_many_items');
    // Se limpia cada producto, sin duplicados. De la lista no viaja quién apuntó qué ni cuándo: son favoritos
    // de una persona, no de un grupo.
    const seen = new Set();
    const items = [];
    for (const raw of body.items) {
        const item = cleanFavorite(raw);
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        items.push(item);
    }
    await limitCreate(req, 'mf', CREATE_PER_IP_HOUR, CREATE_GLOBAL_DAY);
    const id = newId();
    const copy = { n: cleanLabel(body.name, 40), f: cleanLabel(body.from, 30), i: items };
    await redis([['SET', key(id), JSON.stringify(copy), 'EX', String(TTL_SECONDS)]], false);
    return { ok: true, id };
}

async function get(body) {
    if (typeof body.id !== 'string' || !ID_RE.test(body.id)) throw new HttpError(400, 'invalid_id');
    const [raw] = await redis([['GET', key(body.id)]], false);
    if (typeof raw !== 'string') throw new HttpError(404, 'not_found');
    let copy;
    try {
        copy = JSON.parse(raw);
    } catch {
        throw new HttpError(404, 'not_found');
    }
    // Lo guardado lo escribió esta misma función, pero se vuelve a limpiar al sacarlo
    const items = [];
    for (const raw of Array.isArray(copy?.i) ? copy.i : []) {
        try {
            items.push(cleanFavorite(raw));
        } catch {
            // un producto estropeado no tira la copia entera
        }
    }
    return { ok: true, name: cleanLabel(copy?.n, 40), from: cleanLabel(copy?.f, 30), items };
}

function send(res, status, body) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('x-listtype-sync', '1');
    return res.status(status).json(body);
}

export default async function handler(req, res) {
    const { url, token } = credentials();
    if (req.method === 'GET') return send(res, 200, { ok: true, configured: Boolean(url && token) });
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST');
        return send(res, 405, { error: 'method_not_allowed' });
    }
    if (fromAnotherSite(req)) return send(res, 403, { error: 'cross_site' });
    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
        return send(res, 400, { error: 'invalid_json' });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { error: 'invalid_json' });
    if (JSON.stringify(body).length > MAX_BODY) return send(res, 413, { error: 'too_large' });

    try {
        switch (body.op) {
            case 'ping':
                if (!url || !token) throw new HttpError(503, 'not_configured');
                return send(res, 200, { ok: true });
            case 'create':
                return send(res, 200, await create(body, req));
            case 'get':
                return send(res, 200, await get(body));
            default:
                return send(res, 400, { error: 'invalid_op' });
        }
    } catch (error) {
        if (error instanceof HttpError) return send(res, error.status, { error: error.code });
        console.error('favoritos', error);
        return send(res, 500, { error: 'server_error' });
    }
}
