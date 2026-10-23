// Copia compartida del catálogo de Mercadona en la base de datos (Upstash).
//
// Idea: el primer móvil de un almacén que pide una categoría o una ficha hace la petición a Mercadona;
// la respuesta se guarda aquí y los demás móviles de ese almacén reciben la copia sin que Mercadona
// vuelva a enterarse. Va por detrás del CDN de Vercel: el CDN sigue evitando la mayoría de llamadas y
// esto solo se consulta cuando el CDN no tiene la copia (o es de otra región).
//
// Todo es "mejor esfuerzo": si la base de datos no está, falla o llega al límite del plan gratis, las
// funciones devuelven "no disponible" y el proxy se comporta como antes (pide a Mercadona).
// Nada de esto guarda datos de personas: solo respuestas públicas del catálogo, por almacén y ruta.
import { gunzipSync, gzipSync } from 'node:zlib';
import { credentials } from './_redis.js';

// Una copia es "fresca" 24 h (a petición del dueño: Mercadona recibe como mucho una petición por ruta y almacén
// al día). Se conserva 3 días para poder servirla si Mercadona falla.
export const FRESH_MS = 24 * 60 * 60 * 1000;
export const KEEP_SECONDS = 3 * 24 * 60 * 60;
const LOCK_SECONDS = 20;
const REDIS_TIMEOUT_MS = 1500;
// Esta base de datos comparte con las listas compartidas los 500.000 comandos al mes del plan gratis.
// Topes diarios para que el catálogo nunca pueda gastarse la cuota (ni queriendo, inventando almacenes o
// productos): pasado el tope, ese día se pide a Mercadona como antes (el CDN sigue sirviendo copias).
// Peor caso: unos 7.000 comandos al día (~40 % de la cuota); lo normal, mucho menos.
const LOOKUPS_PER_DAY = 1500;
const WRITES_PER_DAY = 500;

export const isConfigured = () => {
    const { url, token } = credentials();
    return Boolean(url && token);
};

async function run(commands) {
    const { url, token } = credentials();
    const response = await fetch(`${url.replace(/\/+$/, '')}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(commands),
        signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`redis ${response.status}`);
    const results = await response.json();
    if (!Array.isArray(results)) throw new Error('redis format');
    return results.map(entry => {
        if (entry && typeof entry === 'object' && 'error' in entry) throw new Error('redis command');
        return entry?.result;
    });
}

export const keyFor = (wh, path) => `mc:${wh}:${path}`;

const today = () => new Date(Date.now()).toISOString().slice(0, 10);

// Cuenta un uso del día; true si todavía no se pasó el tope. El contador caduca solo a los 2 días.
async function underLimit(name, limit, alreadyCounted) {
    const count = Number(alreadyCounted);
    if (count === 1) await run([['EXPIRE', `mc:${name}:${today()}`, String(2 * 24 * 60 * 60)]]);
    return count <= limit;
}

// { down: true } si la base de datos no responde o hoy se pasó el tope; { copy: null } si no hay copia;
// { copy: { body, fetchedAt } } si la hay. count=false en las relecturas mientras se espera a otro móvil.
export async function readCopy(key, count = true) {
    try {
        const commands = [['GET', key]];
        if (count) commands.push(['INCR', `mc:r:${today()}`]);
        const [raw, used] = await run(commands);
        if (count && !(await underLimit('r', LOOKUPS_PER_DAY, used))) return { down: true };
        if (typeof raw !== 'string') return { copy: null };
        const data = JSON.parse(gunzipSync(Buffer.from(raw, 'base64')).toString('utf8'));
        if (typeof data?.b !== 'string' || !Number.isFinite(data?.t)) return { copy: null };
        return { copy: { body: data.b, fetchedAt: data.t } };
    } catch {
        return { down: true };
    }
}

// Guarda la copia. Nunca lanza error y no se espera más de ~1 s: la respuesta al móvil no puede esperar.
export async function writeCopy(key, body, fetchedAt) {
    const work = (async () => {
        const [used] = await run([['INCR', `mc:w:${today()}`]]);
        if (!(await underLimit('w', WRITES_PER_DAY, used))) return;
        const value = gzipSync(Buffer.from(JSON.stringify({ t: fetchedAt, b: body }), 'utf8')).toString('base64');
        await run([['SET', key, value, 'EX', String(KEEP_SECONDS)]]);
    })().catch(() => {});
    await Promise.race([work, new Promise(resolve => setTimeout(resolve, 1000))]);
}

// Un solo móvil (función) a la vez va a Mercadona por cada ruta: los demás esperan su copia.
// true = tienes el turno · false = otro ya está pidiéndola · null = la base de datos no responde
export async function takeTurn(key) {
    try {
        const [result] = await run([['SET', `${key}:lock`, '1', 'NX', 'EX', String(LOCK_SECONDS)]]);
        return result === 'OK';
    } catch {
        return null;
    }
}

export async function giveTurn(key) {
    try {
        await run([['DEL', `${key}:lock`]]);
    } catch {
        // caduca sola a los 20 s
    }
}

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
