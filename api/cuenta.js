// Cuenta opcional con Google: guarda en internet una copia de los datos de una persona (listas, favoritos,
// colecciones y ajustes) para recuperarla en otro móvil. Sin cuenta, la app funciona exactamente igual que antes.
//
// Qué se guarda de quien entra: solo un identificador (el «sub» de Google; NO el correo ni el nombre) y sus datos.
// El correo y el nombre los lee el propio móvil en el momento de entrar, para enseñarlos, y no pasan a la base de datos.
//
// Entrar, en dos pasos (así funciona también en un iPhone con la app en la pantalla de inicio, donde Google se abre en
// una ventana de Safari que NO comparte almacenamiento con la app):
//   1) La app genera un secreto al azar «S» (256 bits) que no sale de ella, y manda a Google su huella «state» = sha256(S).
//      Google devuelve un «id_token» firmado cuyo «nonce» es ese state, a la página que se abra al volver (la app o Safari).
//   2) «finish» (desde esa página): se comprueba la firma con las claves públicas de Google, que la audiencia es esta app
//      (GOOGLE_CLIENT_ID, un dato público; no hay ninguna clave secreta), que el token es reciente, no se ha usado antes
//      y que su nonce es el state. Se deja un «recado» de 10 minutos con el identificador de la cuenta (y correo/nombre,
//      que el móvil mostrará y que se borran al recogerlos) bajo ese state.
//   3) «claim» (desde la app, con S): solo quien conoce S puede recoger el recado, una sola vez. Se crea la sesión: un
//      código al azar de 256 bits guardado en la base de datos y enviado en una cookie HttpOnly.
//
// Todo va por POST con JSON, salvo GET (¿está configurado? ¿es obligatorio entrar?):
//   { op: "finish", credential, state }                -> comprueba el token de Google y deja el recado
//   { op: "claim", secret }                            -> recoge el recado e inicia sesión (cookie)
//   { op: "logout" }                                   -> cierra esta sesión
//   { op: "sync", since, push: [{key, v}], del: [key] } -> sube lo cambiado y baja lo que han cambiado otros móviles
//   { op: "delete" }                                   -> borra los datos y todas las sesiones de la cuenta
//
// Los datos son «secciones» (meta, una por lista, una por colección de favoritos). Cada escritura sube la revisión
// global de la cuenta y marca con ella las secciones que toca; un móvil que dice «tengo hasta la revisión N» recibe las
// secciones con revisión mayor. Si intenta subir una sección que otro móvil cambió después de N, se le devuelve la del
// servidor (conflicto) para que las fusione y la vuelva a subir: nunca se pisa en silencio lo de otro móvil.
import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';
import { credentials } from './_redis.js';
import { HttpError, fromAnotherSite, limitCreate, redis } from './_common.js';

const SESSION_TTL = 60 * 24 * 60 * 60;
const DATA_TTL = 365 * 24 * 60 * 60;
const MAX_BODY = 800_000;
const MAX_SECTION = 200_000;
const MAX_PUSH = 60;
const MAX_SECTIONS = 140;
const SYNC_PER_MINUTE = 40;
const LOGIN_PER_IP_HOUR = 30;
const LOGIN_GLOBAL_DAY = 300;
const NEW_ACCOUNTS_DAY = 200;
const CLAIM_TTL = 600;
const CLAIM_PER_IP_HOUR = 400;
const CLAIM_GLOBAL_DAY = 6000;
const COOKIE = 'ml_session';
const TOKEN_MAX_AGE_MS = 15 * 60 * 1000;
const KEY_RE = /^(meta|hist|L:[a-f0-9]{16}|F:[a-f0-9]{16})$/;
const SESSION_RE = /^[A-Za-z0-9_-]{43}$/;

const googleClientId = () => (process.env.GOOGLE_CLIENT_ID || '').trim();
const sha = text => createHash('sha256').update(text).digest('hex');

const keys = sub => ({ rev: `ac:${sub}:r`, sections: `ac:${sub}:s`, sessions: `ac:${sub}:ss` });
const sessionKey = hash => `ac:s:${hash}`;

// ---------- Google ----------

const certsUrl = () => process.env.GOOGLE_CERTS_URL || 'https://www.googleapis.com/oauth2/v3/certs';
let certs = { at: 0, tried: 0, keys: [] };

// Claves públicas de Google. Se guardan una hora y, si llega un token con una clave desconocida, se vuelve a pedir
// como mucho una vez por minuto (un token inventado no puede obligar a pedirlas sin parar).
async function googleKey(kid) {
    const known = () => certs.keys.find(key => key.kid === kid);
    if (Date.now() - certs.at < 3_600_000 && known()) return known();
    if (Date.now() - certs.tried > 60_000) {
        certs.tried = Date.now();
        try {
            const response = await fetch(certsUrl(), { signal: AbortSignal.timeout(5000) });
            const data = response.ok ? await response.json() : null;
            if (Array.isArray(data?.keys)) certs = { at: Date.now(), tried: certs.tried, keys: data.keys };
        } catch {
            // se usan las que haya
        }
    }
    return known();
}

const decodePart = part => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

async function verifyGoogleToken(credential, nonce) {
    const clientId = googleClientId();
    if (!clientId) throw new HttpError(503, 'not_configured');
    if (typeof credential !== 'string' || credential.length > 4000 || typeof nonce !== 'string' || nonce.length < 16 || nonce.length > 200) {
        throw new HttpError(400, 'invalid_credential');
    }
    const parts = credential.split('.');
    if (parts.length !== 3) throw new HttpError(401, 'invalid_token');
    let header;
    let claims;
    try {
        header = decodePart(parts[0]);
        claims = decodePart(parts[1]);
    } catch {
        throw new HttpError(401, 'invalid_token');
    }
    if (header?.alg !== 'RS256' || typeof header.kid !== 'string') throw new HttpError(401, 'invalid_token');
    const jwk = await googleKey(header.kid);
    if (!jwk) throw new HttpError(401, 'invalid_token');
    let valid = false;
    try {
        valid = verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
    } catch {
        valid = false;
    }
    if (!valid) throw new HttpError(401, 'invalid_token');
    const now = Date.now();
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const fine = ['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss)
        && audience.includes(clientId)
        && Number.isFinite(claims.exp) && claims.exp * 1000 > now
        && Number.isFinite(claims.iat) && claims.iat * 1000 <= now + 60_000 && now - claims.iat * 1000 <= TOKEN_MAX_AGE_MS
        && typeof claims.sub === 'string' && /^[0-9]{5,40}$/.test(claims.sub)
        && claims.email_verified !== false
        && claims.nonce === nonce;
    if (!fine) throw new HttpError(401, 'invalid_token');
    return { sub: claims.sub, email: typeof claims.email === 'string' ? claims.email.slice(0, 200) : '', name: typeof claims.name === 'string' ? claims.name.slice(0, 100) : '' };
}

// ---------- Sesión ----------

const isHttps = req => String((req.headers || {})['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';

function setCookie(res, req, value, maxAge) {
    res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/api/cuenta; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`);
}

function readToken(req) {
    const header = String((req.headers || {}).cookie || '');
    for (const piece of header.split(';')) {
        const [name, ...rest] = piece.trim().split('=');
        if (name === COOKIE) {
            const value = rest.join('=');
            return SESSION_RE.test(value) ? value : null;
        }
    }
    return null;
}

// Devuelve { sub, hash } si hay una sesión válida; la renueva (60 días desde el último uso)
async function session(req) {
    const token = readToken(req);
    if (!token) throw new HttpError(401, 'no_session');
    const hash = sha(token);
    const [sub] = await redis([['GET', sessionKey(hash)], ['EXPIRE', sessionKey(hash), SESSION_TTL]], false);
    if (typeof sub !== 'string' || !/^[0-9]{5,40}$/.test(sub)) throw new HttpError(401, 'no_session');
    return { sub, hash };
}

const STATE_RE = /^[a-f0-9]{64}$/;
const claimKey = state => `ac:c:${state}`;

async function finish(body, req) {
    await limitCreate(req, 'ac', LOGIN_PER_IP_HOUR, LOGIN_GLOBAL_DAY);
    if (typeof body.state !== 'string' || !STATE_RE.test(body.state)) throw new HttpError(400, 'invalid_credential');
    const { sub, email, name } = await verifyGoogleToken(body.credential, body.state);
    // Cada token vale una sola vez (si alguien lo copiara de una dirección, no serviría)
    const [fresh] = await redis([['SET', `ac:used:${sha(body.credential)}`, '1', 'NX', 'EX', '1200']], false);
    if (fresh === null || fresh === undefined) throw new HttpError(401, 'invalid_token');
    await redis([['SET', claimKey(body.state), JSON.stringify({ sub, email, name }), 'EX', CLAIM_TTL]], false);
    return { ok: true };
}

async function claim(body, req, res) {
    if (typeof body.secret !== 'string' || !STATE_RE.test(body.secret)) throw new HttpError(400, 'invalid_claim');
    await limitCreate(req, 'acl', CLAIM_PER_IP_HOUR, CLAIM_GLOBAL_DAY);
    // GETDEL: el recado se recoge una sola vez
    const [raw] = await redis([['GETDEL', claimKey(sha(body.secret))]], false);
    if (typeof raw !== 'string') throw new HttpError(404, 'not_ready');
    let data = null;
    try {
        data = JSON.parse(raw);
    } catch {
        data = null;
    }
    if (!data || typeof data.sub !== 'string' || !/^[0-9]{5,40}$/.test(data.sub)) throw new HttpError(404, 'not_ready');
    const { sub } = data;
    const email = typeof data.email === 'string' ? data.email : '';
    const name = typeof data.name === 'string' ? data.name : '';
    const k = keys(sub);
    const [existing] = await redis([['EXISTS', k.rev]], false);
    if (!existing) {
        const day = Math.floor(Date.now() / 86_400_000);
        const [count] = await redis([['INCR', `ac:new:${day}`], ['EXPIRE', `ac:new:${day}`, 172800]], false);
        if (Number(count) > NEW_ACCOUNTS_DAY) throw new HttpError(429, 'rate_limited');
    }
    const token = randomBytes(32).toString('base64url');
    const hash = sha(token);
    await redis([
        ['SET', sessionKey(hash), sub, 'EX', SESSION_TTL],
        ['SADD', k.sessions, hash],
        ['EXPIRE', k.sessions, DATA_TTL],
        ['EXPIRE', k.rev, DATA_TTL],
        ['EXPIRE', k.sections, DATA_TTL],
    ], false);
    setCookie(res, req, token, SESSION_TTL);
    // uid: lo que el móvil usa para saber si es la misma cuenta que la última vez (no es el sub de Google)
    return { ok: true, uid: sha(`uid:${sub}`).slice(0, 32), email, name };
}

async function logout(req, res) {
    const token = readToken(req);
    if (token) {
        const hash = sha(token);
        const [sub] = await redis([['GET', sessionKey(hash)]], false);
        const commands = [['DEL', sessionKey(hash)]];
        if (typeof sub === 'string' && /^[0-9]{5,40}$/.test(sub)) commands.push(['SREM', keys(sub).sessions, hash]);
        await redis(commands, false);
    }
    setCookie(res, req, '', 0);
    return { ok: true };
}

async function deleteAccount(req, res) {
    const { sub } = await session(req);
    const k = keys(sub);
    const [hashes] = await redis([['SMEMBERS', k.sessions]], false);
    const minute = Math.floor(Date.now() / 60_000);
    const commands = [['DEL', k.rev, k.sections, k.sessions, `ac:${sub}:rl:${minute}`, `ac:${sub}:rl:${minute - 1}`]];
    for (const hash of Array.isArray(hashes) ? hashes : []) {
        if (SESSION_RE.test(hash) || /^[a-f0-9]{64}$/.test(hash)) commands.push(['DEL', sessionKey(hash)]);
    }
    await redis(commands, false);
    setCookie(res, req, '', 0);
    return { ok: true };
}

// ---------- Datos ----------

function cleanPush(raw) {
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.length > MAX_PUSH) throw new HttpError(400, 'invalid_push');
    const seen = new Set();
    return raw.map(entry => {
        const key = entry?.key;
        if (typeof key !== 'string' || !KEY_RE.test(key) || seen.has(key)) throw new HttpError(400, 'invalid_push');
        seen.add(key);
        const value = entry.v;
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'invalid_push');
        const json = JSON.stringify(value);
        if (json.length > MAX_SECTION) throw new HttpError(413, 'section_too_large');
        return { key, json };
    });
}

function cleanDel(raw, pushed) {
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.length > MAX_PUSH) throw new HttpError(400, 'invalid_push');
    return [...new Set(raw)].map(key => {
        if (typeof key !== 'string' || !KEY_RE.test(key) || key === 'meta' || key === 'hist' || pushed.has(key)) throw new HttpError(400, 'invalid_push');
        return key;
    });
}

function readSections(flat) {
    const out = new Map();
    if (Array.isArray(flat)) {
        for (let i = 0; i + 1 < flat.length; i += 2) {
            try {
                const parsed = JSON.parse(flat[i + 1]);
                if (parsed && Number.isSafeInteger(parsed.r)) out.set(String(flat[i]), parsed);
            } catch {
                // sección estropeada: se ignora
            }
        }
    }
    return out;
}

async function sync(body, req) {
    const { sub } = await session(req);
    const k = keys(sub);
    const since = Number.isSafeInteger(body.since) && body.since >= 0 ? body.since : 0;
    const push = cleanPush(body.push);
    const del = cleanDel(body.del, new Set(push.map(entry => entry.key)));
    const writing = push.length > 0 || del.length > 0;

    const minute = Math.floor(Date.now() / 60_000);
    const limitKey = `ac:${sub}:rl:${minute}`;
    const first = [['INCR', limitKey], ['EXPIRE', limitKey, 120], ['GET', k.rev]];
    if (writing) first.push(['HLEN', k.sections]);
    const [used, , revRaw, length] = await redis(first, false);
    if (Number(used) > SYNC_PER_MINUTE) throw new HttpError(429, 'rate_limited');
    const serverRev = Number(revRaw) || 0;

    // Sin cambios en el servidor desde la revisión del móvil no hace falta leer nada (no puede haber conflictos)
    let sections = null;
    if (serverRev !== since || since === 0) {
        const [flat] = await redis([['HGETALL', k.sections]], false);
        sections = readSections(flat);
    }
    if (!writing && sections === null) return { ok: true, rev: serverRev, unchanged: true, changed: [], conflicts: [] };

    const accepted = [];
    const conflicts = [];
    for (const entry of push) {
        const current = sections?.get(entry.key);
        if (current && current.r > since) conflicts.push(entry.key);
        else accepted.push(entry);
    }
    const removed = del.filter(key => !(sections?.get(key)?.r > since));
    if (accepted.length && Number(length) + accepted.length > MAX_SECTIONS) throw new HttpError(413, 'too_many_sections');

    let rev = serverRev;
    if (accepted.length || removed.length) {
        rev = serverRev + 1;
        const commands = [];
        for (const entry of accepted) commands.push(['HSET', k.sections, entry.key, `{"r":${rev},"v":${entry.json}}`]);
        if (removed.length) commands.push(['HDEL', k.sections, ...removed]);
        commands.push(['SET', k.rev, String(rev)], ['EXPIRE', k.rev, DATA_TTL], ['EXPIRE', k.sections, DATA_TTL]);
        await redis(commands, true);
    }
    const written = new Set(accepted.map(entry => entry.key));
    const changed = [];
    if (sections) {
        for (const [key, section] of sections) {
            if (section.r > since && !written.has(key) && !removed.includes(key)) changed.push({ key, r: section.r, v: section.v });
        }
    }
    return { ok: true, rev, changed, conflicts, accepted: [...written] };
}

// ---------- Entrada ----------

function send(res, status, body) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('x-listtype-sync', '1');
    return res.status(status).json(body);
}

export default async function handler(req, res) {
    const { url, token } = credentials();
    if (req.method === 'GET') {
        const configured = Boolean(url && token && googleClientId());
        // LOGIN_REQUIRED=1 en Vercel: sin cuenta no se puede usar la app (interruptor del dueño; solo vale si Google está configurado)
        const required = configured && ['1', 'true', 'si', 'sí'].includes((process.env.LOGIN_REQUIRED || '').trim().toLowerCase());
        return send(res, 200, { ok: true, configured, clientId: googleClientId() || null, required });
    }
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
            case 'finish':
                return send(res, 200, await finish(body, req));
            case 'claim':
                return send(res, 200, await claim(body, req, res));
            case 'logout':
                return send(res, 200, await logout(req, res));
            case 'sync':
                return send(res, 200, await sync(body, req));
            case 'delete':
                return send(res, 200, await deleteAccount(req, res));
            default:
                return send(res, 400, { error: 'invalid_op' });
        }
    } catch (error) {
        if (error instanceof HttpError) return send(res, error.status, { error: error.code });
        console.error('cuenta', error);
        return send(res, 500, { error: 'server_error' });
    }
}
