// Piezas comunes de las funciones que guardan datos de personas en la base de datos (lista.js y favoritos.js):
// errores, acceso a Redis, validación de productos, tope de creaciones y defensa contra webs ajenas.
// Viven en un solo sitio para que una mejora de seguridad llegue a las dos (el guion bajo evita que Vercel
// lo trate como función).
import { credentials } from './_redis.js';

export const TIMEOUT_MS = 8000;
export const IMAGE_PREFIX = 'https://prod-mercadona.imgix.net/';

export class HttpError extends Error {
    constructor(status, code) {
        super(code);
        this.status = status;
        this.code = code;
    }
}

// ---------- Redis (API REST de Upstash) ----------

// transaction: todo o nada (/multi-exec); si no, en orden pero sin bloqueo (/pipeline)
export async function redis(commands, transaction) {
    const { url, token } = credentials();
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

// ---------- Validación (lo que llega lo puede haber escrito cualquiera) ----------

export const text = (value, max) => typeof value === 'string' && value.length <= max ? value : undefined;

export function cleanItem(raw) {
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
    // addedBy: el nombre que la persona escribe al compartir o unirse (solo eso, para ver quién apuntó qué)
    for (const [field, max] of [['packaging', 100], ['unitPrice', 60], ['store', 40], ['addedBy', 30]]) {
        const value = text(raw[field], max);
        if (value) item[field] = value;
    }
    if (raw.isNew === true) item.isNew = true;
    if (raw.byWeight === true) item.byWeight = true;
    item.addedAt = Number.isSafeInteger(raw.addedAt) && raw.addedAt > 0 ? raw.addedAt : Date.now();
    return item;
}

// ---------- Identificadores, IP y límites ----------

export function newId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Buffer.from(bytes).toString('base64url');
}

// IP de quien llama. Se usa la que pone Vercel y que el cliente no puede falsear: primero x-real-ip; si no,
// el ÚLTIMO valor de x-forwarded-for (el que añade el proxy), no el primero, que sí lo puede poner el cliente.
export function clientIp(req) {
    const h = req.headers || {};
    const real = (h['x-real-ip'] || '').toString().trim();
    if (real) return real.slice(0, 60);
    const xff = Array.isArray(h['x-forwarded-for']) ? h['x-forwarded-for'].join(',') : (h['x-forwarded-for'] || '').toString();
    const parts = xff.split(',').map(part => part.trim()).filter(Boolean);
    return (parts[parts.length - 1] || 'desconocida').slice(0, 60);
}

// Tope de creaciones por IP y por hora, y un tope global al día como cortafuegos del gasto.
// prefix separa los contadores de cada función (ml = listas, mf = favoritos).
// Cuesta 2 operaciones de Redis, solo al crear (algo que se hace muy de vez en cuando).
export async function limitCreate(req, prefix, perIpHour, perDay) {
    const now = Date.now();
    const ipKey = `${prefix}:rl:ip:${clientIp(req)}:${Math.floor(now / 3_600_000)}`;
    const allKey = `${prefix}:rl:all:${Math.floor(now / 86_400_000)}`;
    const [ipCount, allCount] = await redis([['INCR', ipKey], ['INCR', allKey]], false);
    const expires = [];
    if (Number(ipCount) === 1) expires.push(['EXPIRE', ipKey, 3600]);
    if (Number(allCount) === 1) expires.push(['EXPIRE', allKey, 86400]);
    if (expires.length) await redis(expires, false).catch(() => undefined);
    if (Number(ipCount) > perIpHour || Number(allCount) > perDay) throw new HttpError(429, 'rate_limited');
}

// Rechaza las peticiones de navegador que llegan desde OTRA web (una página ajena que intente usar el
// navegador de quien la visita para tocar la API). Los navegadores modernos mandan Sec-Fetch-Site; en un
// Safari antiguo se mira el Origin. Sin ninguna de las dos (no es un navegador) se deja pasar.
export function fromAnotherSite(req) {
    const h = req.headers || {};
    const site = (h['sec-fetch-site'] || '').toString();
    if (site) return !['same-origin', 'same-site', 'none'].includes(site);
    const origin = (h['origin'] || '').toString();
    if (!origin) return false;
    try {
        return new URL(origin).host !== (h['host'] || '').toString();
    } catch {
        return true;
    }
}
