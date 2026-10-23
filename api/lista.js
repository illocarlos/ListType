// Lista de la compra compartida entre varios móviles (como Tricount): quien tiene el enlace ve y cambia la lista.
// No hay cuentas: el identificador de la lista (22 caracteres al azar, 128 bits) es la llave.
// Los datos viven en Upstash Redis (plan gratis, conectado desde el Marketplace de Vercel).
// Solo se guardan productos (nombre, precio, cantidad, si ya está en el carro): nada de la persona.
//
// Todo va por POST con JSON (el identificador nunca viaja en la dirección, que queda en los registros):
//   { op: "ping" }                                   -> ¿está configurada la base de datos?
//   { op: "create", items: [...] }                   -> crea una lista con lo que ya había en el móvil
//   { op: "get", id, v }                             -> si la versión no ha cambiado, solo { unchanged: true }
//   { op: "apply", id, batch, ops: [...] }           -> cambios en orden: add, dec, remove, done, clear, restore
//
// Gasto: la consulta habitual ("¿ha cambiado algo?") es 1 sola operación de Redis. Con la app cerrada o en
// segundo plano no se consulta nada. Cada lista caduca a los 90 días sin cambios.

const ID_RE = /^[A-Za-z0-9_-]{22}$/;
// Cada envío lleva su propio identificador: si la cobertura se corta después de guardarse y el móvil lo
// reintenta, no se aplica dos veces (si no, "2 de leche" podría acabar en 3)
const BATCH_RE = /^[A-Za-z0-9_-]{8,40}$/;
const BATCH_TTL_SECONDS = 600;
const TTL_SECONDS = 90 * 24 * 60 * 60;
const MAX_ITEMS = 300;
const MAX_OPS = 50;
const MAX_BODY = 100_000;
const TIMEOUT_MS = 8000;
const IMAGE_PREFIX = 'https://prod-mercadona.imgix.net/';

// Upstash conectado desde Vercel: según la versión de la integración las variables se llaman KV_REST_API_* o
// UPSTASH_REDIS_REST_*, y al conectarla se les puede poner un prefijo (p. ej. STORAGE_KV_REST_API_URL)
function credentials() {
    const env = process.env;
    for (const [urlName, tokenName] of [['KV_REST_API_URL', 'KV_REST_API_TOKEN'], ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']]) {
        if (env[urlName] && env[tokenName]) return { url: env[urlName], token: env[tokenName] };
    }
    // Con prefijo: o se añade delante (STORAGE_KV_REST_API_URL) o sustituye a "KV" (STORAGE_REST_API_URL)
    for (const key of Object.keys(env).sort()) {
        const match = key.match(/^(.+_)(KV_REST_API|UPSTASH_REDIS_REST|REST_API)_URL$/);
        const token = match && env[`${match[1]}${match[2]}_TOKEN`];
        if (match && /^https?:\/\//.test(env[key] || '') && token) return { url: env[key], token };
    }
    return { url: '', token: '' };
}
const redisUrl = () => credentials().url;
const redisToken = () => credentials().token;

class HttpError extends Error {
    constructor(status, code) {
        super(code);
        this.status = status;
        this.code = code;
    }
}

const keys = id => ({ v: `ml:${id}:v`, items: `ml:${id}:i`, qty: `ml:${id}:q`, done: `ml:${id}:d` });

// ---------- Redis (API REST de Upstash) ----------

// transaction: todo o nada (/multi-exec); si no, en orden pero sin bloqueo (/pipeline)
async function redis(commands, transaction) {
    const url = redisUrl();
    const token = redisToken();
    if (!url || !token) throw new HttpError(503, 'not_configured');
    let response;
    try {
        response = await fetch(`${url.replace(/\/+$/, '')}/${transaction ? 'multi-exec' : 'pipeline'}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(commands),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
    } catch {
        throw new HttpError(503, 'storage_unreachable');
    }
    // 429/400 de Upstash = límite del plan gratis alcanzado o petición rechazada: la app sigue sin sincronizar
    if (!response.ok) throw new HttpError(response.status === 429 ? 429 : 503, 'storage_error');
    const results = await response.json().catch(() => null);
    if (!Array.isArray(results)) throw new HttpError(503, 'storage_error');
    return results.map(entry => {
        if (entry && typeof entry === 'object' && 'error' in entry) throw new HttpError(503, 'storage_error');
        return entry?.result;
    });
}

// HGETALL llega como [campo, valor, campo, valor...]
function pairs(flat) {
    const out = new Map();
    if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) out.set(String(flat[i]), flat[i + 1]);
    return out;
}

function buildList(itemsFlat, qtyFlat, doneFlat) {
    const quantities = pairs(qtyFlat);
    const done = pairs(doneFlat);
    const list = [];
    for (const [field, raw] of pairs(itemsFlat)) {
        let item;
        try {
            item = JSON.parse(raw);
        } catch {
            continue;
        }
        const quantity = Math.max(1, Math.min(999, Number(quantities.get(field)) || 1));
        list.push({ ...item, quantity, done: done.has(field) || undefined });
    }
    return list.sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0) || a.id - b.id);
}

const snapshot = k => [['HGETALL', k.items], ['HGETALL', k.qty], ['HGETALL', k.done]];
const refreshTtl = k => [k.v, k.items, k.qty, k.done].map(key => ['EXPIRE', key, TTL_SECONDS]);

// ---------- Validación (lo que llega lo puede haber escrito cualquiera) ----------

const text = (value, max) => typeof value === 'string' && value.length <= max ? value : undefined;

function cleanItem(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'invalid_item');
    const id = raw.id;
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'invalid_item');
    if (name.length < 1 || name.length > 200) throw new HttpError(400, 'invalid_item');
    const price = typeof raw.price === 'number' && Number.isFinite(raw.price) && raw.price >= 0 && raw.price < 10000 ? Math.round(raw.price * 100) / 100 : 0;
    const item = { id, name, type: text(raw.type, 100) ?? '', price };
    if (['catalog', 'manual', 'mercadona'].includes(raw.source)) item.source = raw.source;
    // Solo fotos de Mercadona: una dirección cualquiera serviría para saber quién abre la lista
    if (typeof raw.image === 'string' && raw.image.startsWith(IMAGE_PREFIX) && raw.image.length <= 500) item.image = raw.image;
    if (typeof raw.mercadonaId === 'string' && /^[0-9]{1,8}(\.[0-9]{1,3})?$/.test(raw.mercadonaId)) item.mercadonaId = raw.mercadonaId;
    for (const [field, max] of [['packaging', 100], ['unitPrice', 60], ['store', 40]]) {
        const value = text(raw[field], max);
        if (value) item[field] = value;
    }
    if (raw.isNew === true) item.isNew = true;
    if (raw.byWeight === true) item.byWeight = true;
    item.addedAt = Number.isSafeInteger(raw.addedAt) && raw.addedAt > 0 ? raw.addedAt : Date.now();
    return item;
}

const cleanQuantity = value => Number.isInteger(value) && value >= 1 && value <= 999 ? value : 1;
const cleanId = value => {
    if (typeof value !== 'string' || !ID_RE.test(value)) throw new HttpError(400, 'invalid_id');
    return value;
};
const cleanItemId = value => {
    if (!Number.isSafeInteger(value) || value <= 0) throw new HttpError(400, 'invalid_item');
    return String(value);
};

// Comandos de una operación. "added" apunta los productos nuevos (para respetar el máximo).
function commandsFor(op, k, added) {
    if (!op || typeof op !== 'object') throw new HttpError(400, 'invalid_op');
    switch (op.op) {
        case 'add': {
            const item = cleanItem(op.item);
            const field = String(item.id);
            added.push({ field, index: null });
            // HSETNX: el primero que lo apunta fija la descripción y el orden; volver a apuntarlo suma 1
            // y lo quita de "en el carro" (vuelve a faltar)
            return [['HSETNX', k.items, field, JSON.stringify(item)], ['HINCRBY', k.qty, field, 1], ['HDEL', k.done, field]];
        }
        case 'dec': {
            const field = cleanItemId(op.id);
            return [['HINCRBY', k.qty, field, -1]];
        }
        case 'remove': {
            const field = cleanItemId(op.id);
            return [['HDEL', k.items, field], ['HDEL', k.qty, field], ['HDEL', k.done, field]];
        }
        case 'done': {
            const field = cleanItemId(op.id);
            return op.value === true ? [['HSET', k.done, field, '1']] : [['HDEL', k.done, field]];
        }
        case 'clear':
            return [['DEL', k.items, k.qty, k.done]];
        case 'restore': {
            if (!Array.isArray(op.items) || op.items.length > MAX_ITEMS) throw new HttpError(400, 'invalid_op');
            return op.items.flatMap(raw => {
                const item = cleanItem(raw);
                const field = String(item.id);
                const commands = [['HSET', k.items, field, JSON.stringify(item)], ['HSET', k.qty, field, String(cleanQuantity(raw.quantity))]];
                if (raw.done === true) commands.push(['HSET', k.done, field, '1']);
                return commands;
            });
        }
        default:
            throw new HttpError(400, 'invalid_op');
    }
}

// ---------- Operaciones ----------

function newId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Buffer.from(bytes).toString('base64url');
}

async function create(body) {
    const id = newId();
    const k = keys(id);
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length > MAX_ITEMS) throw new HttpError(400, 'too_many_items');
    const commands = [
        ...commandsFor({ op: 'restore', items }, k, []),
        ['SET', k.v, '1'],
        ...refreshTtl(k),
        ...snapshot(k),
    ];
    const results = await redis(commands, true);
    const [itemsFlat, qtyFlat, doneFlat] = results.slice(-3);
    return { ok: true, id, version: 1, items: buildList(itemsFlat, qtyFlat, doneFlat) };
}

async function get(body) {
    const id = cleanId(body.id);
    const k = keys(id);
    const [version] = await redis([['GET', k.v]], false);
    if (version === null || version === undefined) throw new HttpError(404, 'not_found');
    if (Number.isFinite(body.v) && Number(version) === body.v) return { ok: true, version: Number(version), unchanged: true };
    const results = await redis([['GET', k.v], ...snapshot(k)], true);
    if (results[0] === null || results[0] === undefined) throw new HttpError(404, 'not_found');
    return { ok: true, version: Number(results[0]), items: buildList(results[1], results[2], results[3]) };
}

async function apply(body) {
    const id = cleanId(body.id);
    const k = keys(id);
    if (!Array.isArray(body.ops) || body.ops.length === 0 || body.ops.length > MAX_OPS) throw new HttpError(400, 'invalid_ops');
    if (typeof body.batch !== 'string' || !BATCH_RE.test(body.batch)) throw new HttpError(400, 'invalid_batch');

    // Primero se comprueba todo lo que llega: si algo no vale, no se toca la base de datos
    const added = [];
    const opCommands = [];
    const decs = [];
    for (const op of body.ops) {
        const commands = commandsFor(op, k, added);
        for (const command of commands) {
            if (command[0] === 'HSETNX') added[added.length - 1].index = opCommands.length;
            if (command[0] === 'HINCRBY' && command[3] === -1) decs.push({ field: command[2] });
            opCommands.push(command);
        }
    }

    // La lista tiene que existir (así un identificador inventado no crea listas nuevas) y el envío no puede estar repetido
    const batchKey = `ml:${id}:b:${body.batch}`;
    const [exists, fresh] = await redis([['EXISTS', k.v], ['SET', batchKey, '1', 'NX', 'EX', BATCH_TTL_SECONDS]], false);
    if (!exists) {
        await redis([['DEL', batchKey]], false).catch(() => undefined);
        throw new HttpError(404, 'not_found');
    }
    if (fresh === null || fresh === undefined) {
        // Ya aplicado (reintento): se devuelve la lista como está, sin repetir los cambios
        const results = await redis([['GET', k.v], ...snapshot(k)], true);
        return { ok: true, version: Number(results[0]), items: buildList(results[1], results[2], results[3]), repeated: true };
    }
    const results = await redis([
        ...opCommands,
        ['INCR', k.v],
        ['HLEN', k.items],
        ...refreshTtl(k),
        ...snapshot(k),
    ], true);
    let version = Number(results[opCommands.length]);
    const length = Number(results[opCommands.length + 1]);
    let [itemsFlat, qtyFlat, doneFlat] = results.slice(-3);

    // Arreglos sin bloqueo (Redis no tiene "restar sin bajar de 1" ni "máximo de productos" sin scripts):
    // - una cantidad que ha quedado por debajo de 1 (dos "−" a la vez) vuelve a 1;
    // - si se ha pasado del máximo, se quitan los productos que se acaban de crear.
    // Se mira la cantidad final de cada producto (no cada "−" por separado: con tres "−" seguidos se sumaría de más)
    const fixes = [];
    if (decs.length) {
        const finalQty = pairs(qtyFlat);
        for (const field of new Set(decs.map(dec => dec.field))) {
            const value = Number(finalQty.get(field));
            if (finalQty.has(field) && value < 1) fixes.push(['HINCRBY', k.qty, field, 1 - value]);
        }
    }
    if (length > MAX_ITEMS) {
        for (const { field, index } of added) {
            if (index !== null && Number(results[index]) === 1) fixes.push(['HDEL', k.items, field], ['HDEL', k.qty, field], ['HDEL', k.done, field]);
        }
    }
    if (fixes.length) {
        const fixed = await redis([...fixes, ['INCR', k.v], ...snapshot(k)], true);
        version = Number(fixed[fixes.length]);
        [itemsFlat, qtyFlat, doneFlat] = fixed.slice(-3);
    }
    return { ok: true, version, items: buildList(itemsFlat, qtyFlat, doneFlat), full: length > MAX_ITEMS || undefined };
}

// ---------- Entrada ----------

function send(res, status, body) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('x-listtype-sync', '1');
    return res.status(status).json(body);
}

export default async function handler(req, res) {
    // GET sin nada más: solo dice si la base de datos está conectada (para comprobarlo tras publicar)
    if (req.method === 'GET') return send(res, 200, { ok: true, configured: Boolean(redisUrl() && redisToken()) });
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST');
        return send(res, 405, { error: 'method_not_allowed' });
    }
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
                if (!redisUrl() || !redisToken()) throw new HttpError(503, 'not_configured');
                return send(res, 200, { ok: true });
            case 'create':
                return send(res, 200, await create(body));
            case 'get':
                return send(res, 200, await get(body));
            case 'apply':
                return send(res, 200, await apply(body));
            default:
                return send(res, 400, { error: 'invalid_op' });
        }
    } catch (error) {
        if (error instanceof HttpError) return send(res, error.status, { error: error.code });
        console.error('lista', error);
        return send(res, 500, { error: 'server_error' });
    }
}
