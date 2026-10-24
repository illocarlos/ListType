import { formatCurrency } from "./formatPrice";
import type { listItem, MercadonaAisle, MercadonaGroup, MercadonaProduct } from "../types/types";

// Todas las peticiones pasan por el proxy de Vercel (api/mercadona.js) o, en local, por el proxy de Vite
const API_BASE = "/api/mercadona";
const IMG_PROXY = "/api/mercadona-img";
const CACHE_PREFIX = "mercadona:v1:";
const WAREHOUSE_KEY = `${CACHE_PREFIX}wh`;
const TTL_MS = 24 * 60 * 60 * 1000;
// Rebajas y novedades: el móvil las renueva cada 24 h, igual que los pasillos (a petición del dueño: se
// publican a diario). El CDN de Vercel y la base de datos renuevan su copia cada 24 h. Si un producto llega también por su
// pasillo, manda el precio con contenido más reciente (fetchedAt), no el camino por el que llegó.
const HOME_TTL_MS = 24 * 60 * 60 * 1000;
// Si los precios guardados tienen más de esto y no se han podido renovar, se avisa
export const STALE_WARNING_MS = 48 * 60 * 60 * 1000;
// Tras un rechazo o fallo de Mercadona, las renovaciones automáticas esperan este tiempo
// (se sigue enseñando lo guardado). Así nadie insiste mientras Mercadona está rechazando.
const PAUSE_MS = 30 * 60 * 1000;
const PAUSE_KEY = "mercadona-pause:v1";
// Un dato con menos de esto lo acaba de sacar el proxy de Mercadona (no es una copia guardada del CDN)
const FRESH_FROM_MERCADONA_MS = 2 * 60 * 1000;

// Almacén de Sevilla. Sin verificar: se puede cambiar desde el panel de Mercadona
export const DEFAULT_WAREHOUSE = "svq1";

// savedAt: cuándo lo guardó el móvil (para caducar). fetchedAt: cuándo lo sacó el proxy de Mercadona
// (la edad real del precio; puede ser anterior si llegó una copia del CDN). Las entradas antiguas no lo tienen.
type CacheEntry<T> = { savedAt: number, fetchedAt?: number, data: T };

const contentAge = <T>(entry: CacheEntry<T>) => entry.fetchedAt ?? entry.savedAt;

// De dónde viene el error: la función de Vercel (proxy) responde siempre con source: 'proxy';
// si no viene, el error lo ha dado Vercel antes de llegar a la función (por ejemplo, 404 porque no existe)
export type ErrorOrigin = "mercadona" | "vercel" | "red";

// Mensajes en lenguaje llano para cualquier usuario, con un código corto al final para diagnosticar:
// M = lo ha respondido Mercadona, V = el servidor de la app (Vercel), R = sin conexión
function describeStatus(status: number, origin: ErrorOrigin): string {
    const calm = "Tu lista y tus favoritos siguen funcionando.";
    if (origin === "red") return `No hay conexión a internet. ${calm} (Código R0)`;
    if (origin === "vercel") return `Ahora mismo no se pueden ver los productos de Mercadona. ${calm} (Código V${status})`;
    if (status === 429) return `Mercadona está muy ocupado. Inténtalo otra vez en un minuto. ${calm} (Código M429)`;
    if (status === 404) return `Mercadona no tiene esto disponible ahora mismo en tu zona. ${calm} (Código M404)`;
    return `Ahora mismo Mercadona no responde. ${calm} (Código M${status})`;
}

export class MercadonaError extends Error {
    status: number;
    origin: ErrorOrigin;
    constructor(status: number, origin: ErrorOrigin = "mercadona") {
        super(describeStatus(status, origin));
        this.status = status;
        this.origin = origin;
    }
}

// ---------- Zona (código postal → almacén) ----------
// Cada usuario escribe su código postal y la app guarda el almacén que le corresponde.
// Va en una clave aparte para que la limpieza de caché nunca la borre.

const ZONE_KEY = "mercadona-zone:v1";

export type Zone = { postalCode: string, wh: string };

export function getZone(): Zone | null {
    try {
        const parsed = JSON.parse(localStorage.getItem(ZONE_KEY) || "null");
        if (parsed && /^\d{5}$/.test(parsed.postalCode) && /^[a-z0-9]{2,10}$/.test(parsed.wh)) return parsed as Zone;
    } catch {
        // dato corrupto: como si no hubiera zona
    }
    return null;
}

// «Ahora no» en la pantalla de zona que sale tras entrar con la cuenta: no se le vuelve a poner esa pantalla
const ZONE_SKIP_KEY = "mercadona-zone:skipped";

export function zoneSkipped(): boolean {
    try {
        return localStorage.getItem(ZONE_SKIP_KEY) === "1";
    } catch {
        return false;
    }
}

export function skipZone() {
    saveImportant(ZONE_SKIP_KEY, "1");
}

function saveZone(zone: Zone) {
    // Si no cabe, se hace sitio borrando caché; si ni así, se usa durante esta sesión igualmente
    saveImportant(ZONE_KEY, JSON.stringify(zone));
}

export type ZoneErrorReason = "invalid" | "no-service" | "busy" | "connection";

export class ZoneError extends Error {
    reason: ZoneErrorReason;
    constructor(reason: ZoneErrorReason) {
        const messages: Record<ZoneErrorReason, string> = {
            invalid: "Ese código postal no existe. Tiene que tener 5 números, por ejemplo: 41300.",
            "no-service": "Mercadona no reparte por internet en ese código postal. Verás los precios generales.",
            busy: "Mercadona está muy ocupado ahora mismo. Inténtalo otra vez en un minuto.",
            connection: "No se ha podido comprobar el código postal. Revisa la conexión e inténtalo otra vez.",
        };
        super(messages[reason]);
        this.reason = reason;
    }
}

// Pregunta a Mercadona (a través del proxy) qué almacén corresponde a un código postal y lo guarda
export async function resolvePostalCode(input: string): Promise<Zone> {
    const postalCode = input.replace(/\D/g, "");
    // Las dos primeras cifras son la provincia (01 a 52): lo demás no existe y no se pregunta a nadie
    if (!/^(0[1-9]|[1-4]\d|5[0-2])\d{3}$/.test(postalCode)) throw new ZoneError("invalid");
    let response: Response;
    try {
        response = await fetch(`${API_BASE}?${new URLSearchParams({ path: "zone", pc: postalCode }).toString()}`, {
            headers: { Accept: "application/json" },
        });
    } catch {
        throw new ZoneError("connection");
    }
    if (response.status === 400) throw new ZoneError("invalid");
    if (response.status === 404) throw new ZoneError("no-service");
    if (response.status === 429 || response.status === 503) throw new ZoneError("busy");
    if (!response.ok) throw new ZoneError("connection");
    let wh = "";
    try {
        wh = String((await response.json()).wh || "").toLowerCase();
    } catch {
        throw new ZoneError("connection");
    }
    if (!/^[a-z0-9]{2,10}$/.test(wh)) throw new ZoneError("no-service");
    const zone = { postalCode, wh };
    saveZone(zone);
    setWarehouse(wh);
    return zone;
}

// ---------- Código postal desde la ubicación del móvil ----------

export type LocationErrorReason = "unsupported" | "denied" | "unavailable" | "outside" | "not-found" | "connection";

export class LocationError extends Error {
    reason: LocationErrorReason;
    constructor(reason: LocationErrorReason) {
        const messages: Record<LocationErrorReason, string> = {
            unsupported: "Este móvil no permite usar la ubicación. Escribe el código postal, por favor.",
            denied: "No has dado permiso para usar tu ubicación. Puedes escribir el código postal.",
            unavailable: "No se ha podido saber dónde estás. Escribe el código postal, por favor.",
            outside: "Parece que no estás en España. Escribe el código postal de donde haces la compra.",
            "not-found": "No hemos encontrado el código postal de tu ubicación. Escríbelo, por favor.",
            connection: "No se ha podido comprobar tu ubicación. Revisa la conexión o escribe el código postal.",
        };
        super(messages[reason]);
        this.reason = reason;
    }
}

function currentPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
        if (!("geolocation" in navigator)) {
            reject(new LocationError("unsupported"));
            return;
        }
        navigator.geolocation.getCurrentPosition(resolve, error => {
            reject(new LocationError(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"));
        // Sin alta precisión: para el código postal basta la ubicación aproximada (no hace falta el GPS)
        }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 });
    });
}

// Pide la ubicación (con permiso del usuario) y la convierte en código postal con OpenStreetMap, vía el proxy.
// La app no guarda la ubicación (viaja redondeada a unos 100 m solo para pedir el código postal).
export async function postalCodeFromLocation(): Promise<string> {
    const position = await currentPosition();
    const params = new URLSearchParams({
        path: "geo",
        lat: position.coords.latitude.toFixed(3),
        lon: position.coords.longitude.toFixed(3),
    });
    let response: Response;
    try {
        response = await fetch(`${API_BASE}?${params.toString()}`, { headers: { Accept: "application/json" } });
    } catch {
        throw new LocationError("connection");
    }
    if (response.status === 404) {
        let error = "";
        try {
            error = String((await response.json()).error || "");
        } catch {
            error = "";
        }
        throw new LocationError(error === "outside_spain" ? "outside" : "not-found");
    }
    if (!response.ok) throw new LocationError("connection");
    try {
        const postalCode = String((await response.json()).pc || "");
        if (/^\d{5}$/.test(postalCode)) return postalCode;
    } catch {
        // respuesta rara: se trata como no encontrado
    }
    throw new LocationError("not-found");
}

// ---------- Almacén ----------

export function getWarehouse(): string {
    const zone = getZone();
    if (zone) return zone.wh;
    try {
        return localStorage.getItem(WAREHOUSE_KEY) || DEFAULT_WAREHOUSE;
    } catch {
        return DEFAULT_WAREHOUSE;
    }
}

export function setWarehouse(wh: string): boolean {
    const clean = wh.trim().toLowerCase();
    if (!/^[a-z0-9]{2,10}$/.test(clean)) return false;
    saveImportant(WAREHOUSE_KEY, clean);
    return true;
}

// ---------- Caché en localStorage ----------

function readCacheEntry<T>(key: string, allowStale = false, ttl = TTL_MS): CacheEntry<T> | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const entry = JSON.parse(raw) as CacheEntry<T>;
        if (!entry || typeof entry.savedAt !== "number") return null;
        if (!allowStale && Date.now() - entry.savedAt > ttl) return null;
        return entry;
    } catch {
        return null;
    }
}

function readCache<T>(key: string, allowStale = false, ttl = TTL_MS): T | null {
    return readCacheEntry<T>(key, allowStale, ttl)?.data ?? null;
}

// Productos con la fecha en que se descargaron (se pone al leer: no ocupa sitio en el móvil)
const stamp = (products: MercadonaProduct[], fetchedAt: number): MercadonaProduct[] =>
    products.map(product => ({ ...product, fetchedAt }));

// ---------- Pausa tras un rechazo de Mercadona ----------

export function isMercadonaPaused(): boolean {
    try {
        return Date.now() < Number(localStorage.getItem(PAUSE_KEY) || 0);
    } catch {
        return false;
    }
}

function clearPause() {
    try {
        if (localStorage.getItem(PAUSE_KEY)) localStorage.removeItem(PAUSE_KEY);
    } catch {
        // nada que hacer
    }
}

// Solo cuando Mercadona rechaza (401/403/429) o está caída o inalcanzable (502/503/504, que también es lo que
// devuelve el proxy si Mercadona responde con una página anti-bots en vez de datos). No por un 500 suelto de un
// pasillo (si no, un pasillo roto pararía el buscador entero), ni por 404 ("no existe"), ni sin conexión (no le
// llega nada a Mercadona y al recuperarla conviene renovar enseguida).
const PAUSE_STATUSES = new Set([401, 403, 429, 502, 503, 504]);

function pauseAfter(error: unknown) {
    if (!(error instanceof MercadonaError) || error.origin !== "mercadona" || !PAUSE_STATUSES.has(error.status)) return;
    try {
        localStorage.setItem(PAUSE_KEY, String(Date.now() + PAUSE_MS));
    } catch {
        // sin espacio: sin pausa guardada; la ronda en curso ya para igualmente
    }
}

function cacheKeys(): string[] {
    const keys: string[] = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(CACHE_PREFIX) && key !== WAREHOUSE_KEY) keys.push(key);
        }
    } catch {
        // localStorage no disponible
    }
    return keys;
}

function evictOldest(except: string): boolean {
    let oldestKey: string | null = null;
    let oldest = Infinity;
    for (const key of cacheKeys()) {
        if (key === except) continue;
        let savedAt = 0;
        try {
            savedAt = JSON.parse(localStorage.getItem(key) || "{}").savedAt ?? 0;
        } catch {
            savedAt = 0;
        }
        if (savedAt < oldest) {
            oldest = savedAt;
            oldestKey = key;
        }
    }
    if (!oldestKey) return false;
    try {
        localStorage.removeItem(oldestKey);
    } catch {
        return false;
    }
    return true;
}

function writeCache<T>(key: string, data: T, fetchedAt?: number) {
    // Orden fijo (savedAt, fetchedAt, data): pricesFetchedAt lee solo el principio
    const value = JSON.stringify(fetchedAt ? { savedAt: Date.now(), fetchedAt, data } : { savedAt: Date.now(), data });
    for (let attempt = 0; attempt < 50; attempt++) {
        try {
            localStorage.setItem(key, value);
            return;
        } catch {
            // Cuota llena: se borra la caché más antigua y se reintenta. Nunca se toca la lista.
            if (!evictOldest(key)) return;
        }
    }
}

// Guarda un dato del usuario (lista, favoritos, zona, historial) aunque el móvil esté lleno:
// si no cabe, va borrando la caché de Mercadona más antigua hasta que quepa. La caché se puede
// volver a descargar; lo que guarda el usuario no. Devuelve false solo si ni así cabe.
export function saveImportant(key: string, value: string): boolean {
    for (;;) {
        try {
            localStorage.setItem(key, value);
            // Aviso para quien quiera enterarse de que un dato del usuario ha cambiado (la sincronización de la cuenta)
            window.dispatchEvent(new CustomEvent("mercalista:data", { detail: key }));
            return true;
        } catch {
            if (!evictOldest(key)) return false;
        }
    }
}

// Borra la caché de otros almacenes (al cambiar de código postal deja de servir y ocupa sitio)
export function dropOtherWarehouses(wh: string) {
    const own = `${CACHE_PREFIX}${wh}:`;
    for (const key of cacheKeys()) {
        if (key.startsWith(own)) continue;
        try {
            localStorage.removeItem(key);
        } catch {
            // nada que hacer
        }
    }
}

// ---------- Lectura tolerante del JSON de Mercadona ----------

type Obj = Record<string, unknown>;

const asObj = (value: unknown): Obj | null =>
    value && typeof value === "object" && !Array.isArray(value) ? value as Obj : null;

const asArr = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

const str = (value: unknown): string =>
    typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";

const num = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = typeof value === "number" ? value : parseFloat(String(value).replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
};

function parseGroups(json: unknown): MercadonaGroup[] {
    const root = asObj(json);
    const list = root ? asArr(root.results) : asArr(json);
    const groups: MercadonaGroup[] = [];
    for (const rawGroup of list) {
        const group = asObj(rawGroup);
        if (!group || group.published === false) continue;
        const id = num(group.id);
        const name = str(group.name);
        if (id === null || !name) continue;
        const aisles = asArr(group.categories)
            .map(asObj)
            .filter((aisle): aisle is Obj => aisle !== null && aisle.published !== false)
            .map(aisle => ({ id: num(aisle.id), name: str(aisle.name) }))
            .filter((aisle): aisle is { id: number, name: string } => aisle.id !== null && aisle.name !== "");
        if (aisles.length > 0) groups.push({ id, name, aisles });
    }
    return groups;
}

function safeImageUrl(value: unknown): string {
    const url = str(value);
    return url.startsWith("https://") ? url : "";
}

function parseProduct(rawProduct: unknown, subcategory: string, aisle: string): MercadonaProduct | null {
    const product = asObj(rawProduct);
    if (!product || product.published === false) return null;
    const mercadonaId = str(product.id);
    const name = str(product.display_name) || str(product.name);
    if (!mercadonaId || !name) return null;

    const priceInfo = asObj(product.price_instructions);
    // Granel (selling_method 1): en datos reales unit_price no es el precio (p. ej. 1084,05 para un
    // gambón a 10,95 €/kg). El precio de verdad es bulk_price, por kilo. Su precio anterior no es comparable.
    const byWeight = num(priceInfo?.selling_method) === 1;
    const price = byWeight
        ? num(priceInfo?.bulk_price) ?? num(priceInfo?.reference_price) ?? 0
        : num(priceInfo?.unit_price) ?? num(priceInfo?.bulk_price) ?? 0;
    // En datos reales price_decreased viene siempre en falso aunque haya bajada: no se usa.
    const previous = byWeight ? null : num(priceInfo?.previous_unit_price);

    const referencePrice = num(priceInfo?.reference_price);
    const referenceFormat = str(priceInfo?.reference_format);
    const unitPrice = referencePrice !== null && referenceFormat
        ? `${formatCurrency(referencePrice)}/${referenceFormat}`
        : "";

    const unitSize = num(priceInfo?.unit_size);
    const sizeFormat = str(priceInfo?.size_format);
    const size = unitSize !== null && sizeFormat ? `${unitSize.toLocaleString("es-ES")} ${sizeFormat}` : "";
    const packaging = [str(product.packaging), size].filter(Boolean).join(" ");

    // Marcas propias de Mercadona de producto nuevo (no da fecha de lanzamiento)
    const badges = asObj(product.badges);
    const isNew = priceInfo?.is_new === true || product.is_new === true || badges?.is_new === true || product.is_new_arrival === true;

    return {
        mercadonaId,
        name,
        price,
        previousPrice: previous !== null && previous > price ? previous : null,
        unitPrice,
        packaging,
        image: safeImageUrl(product.thumbnail),
        subcategory,
        aisle,
        isNew,
        byWeight,
    };
}

function parseAisle(json: unknown, aisleName: string): MercadonaProduct[] {
    const root = asObj(json);
    if (!root) return [];
    const products: MercadonaProduct[] = [];
    const seen = new Set<string>();
    const push = (rawProduct: unknown, subcategory: string) => {
        const product = parseProduct(rawProduct, subcategory, aisleName);
        if (product && !seen.has(product.mercadonaId)) {
            seen.add(product.mercadonaId);
            products.push(product);
        }
    };
    for (const rawSub of asArr(root.categories)) {
        const sub = asObj(rawSub);
        if (!sub) continue;
        const subName = str(sub.name) || aisleName;
        for (const rawProduct of asArr(sub.products)) push(rawProduct, subName);
    }
    // Por si algún pasillo trae los productos directamente
    for (const rawProduct of asArr(root.products)) push(rawProduct, aisleName);
    return products;
}

// ---------- Peticiones ----------

type Fetched = { data: unknown, fetchedAt: number };

// Peticiones en curso: si dos partes de la app piden lo mismo a la vez (p. ej. las rebajas al abrir),
// sale una sola petición y las dos reciben la misma respuesta
const inflight = new Map<string, Promise<Fetched>>();

// Dato de Mercadona con la hora a la que se obtuvo. Se llama a la función directamente (sin reescrituras).
function getJsonWithTime(path: string, wh: string): Promise<Fetched> {
    const url = `${API_BASE}?${new URLSearchParams({ path, lang: "es", wh }).toString()}`;
    const pending = inflight.get(url);
    if (pending) return pending;
    const request = requestJson(url).finally(() => inflight.delete(url));
    inflight.set(url, request);
    return request;
}

async function getJson(path: string, wh: string): Promise<unknown> {
    return (await getJsonWithTime(path, wh)).data;
}

async function requestJson(url: string): Promise<Fetched> {
    let response: Response;
    try {
        response = await fetch(url, {
            headers: { Accept: "application/json" },
        });
    } catch {
        throw new MercadonaError(0, "red");
    }
    if (!response.ok) {
        let fromProxy = response.headers.get("x-listtype-proxy") === "1";
        let status = response.status;
        try {
            const body = await response.json() as { source?: string, error?: string, upstreamStatus?: number };
            if (body && typeof body === "object" && body.source === "proxy") fromProxy = true;
            // El proxy devuelve los rechazos de Mercadona como 503 (para que el CDN siga dando la copia buena);
            // el código real (401/403/429) viene en upstreamStatus
            if (body?.error === "upstream_refused" && typeof body.upstreamStatus === "number") status = body.upstreamStatus;
        } catch {
            // cuerpo no JSON: lo ha respondido Vercel, no la función
        }
        const error = new MercadonaError(status, fromProxy ? "mercadona" : "vercel");
        pauseAfter(error);
        throw error;
    }
    let data: unknown;
    try {
        data = await response.json();
    } catch (cause) {
        // Respuesta cortada a medias (se va la conexión, o la app se recarga con "Desliza para actualizar"):
        // no es un rechazo de Mercadona y no debe pausar 30 minutos. Solo un JSON roto de verdad cuenta como fallo.
        if (!(cause instanceof SyntaxError)) throw new MercadonaError(0, "red");
        const error = new MercadonaError(502);
        pauseAfter(error);
        throw error;
    }
    const fetchedAt = contentTime(response);
    // Solo un dato recién sacado de Mercadona demuestra que ya responde: una copia del CDN de hace horas
    // llega con 200 aunque Mercadona siga rechazando, y no debe levantar la pausa
    if (Date.now() - fetchedAt < FRESH_FROM_MERCADONA_MS) clearPause();
    return { data, fetchedAt };
}

// Hora a la que el proxy sacó el dato de Mercadona (viaja con la copia del CDN). Sin ella (en local)
// o si es rara (en el futuro por relojes desajustados), la hora de ahora.
function contentTime(response: Response): number {
    const now = Date.now();
    const stamped = Number(response.headers.get("x-listtype-fetched-at"));
    return Number.isFinite(stamped) && stamped > 0 && stamped <= now + 5 * 60 * 1000 ? Math.min(stamped, now) : now;
}

export async function fetchGroups(wh: string, force = false): Promise<MercadonaGroup[]> {
    const key = `${CACHE_PREFIX}${wh}:categories`;
    if (!force) {
        const cached = readCache<MercadonaGroup[]>(key);
        if (cached && cached.length) return cached;
        // En pausa tras un rechazo: lo guardado, aunque esté caducado
        const stale = isMercadonaPaused() ? readCache<MercadonaGroup[]>(key, true) : null;
        if (stale && stale.length) return stale;
    }
    try {
        const groups = parseGroups(await getJson("categories/", wh));
        if (groups.length === 0) throw new MercadonaError(502);
        writeCache(key, groups);
        return groups;
    } catch (error) {
        // Sin conexión o con Mercadona caído: mejor categorías antiguas que nada
        const stale = readCache<MercadonaGroup[]>(key, true);
        if (stale && stale.length) return stale;
        throw error;
    }
}

// Descarga un pasillo de Mercadona y lo guarda en caché (si falla, lanza el error)
async function downloadAisle(wh: string, aisleId: number, aisleName: string): Promise<MercadonaProduct[]> {
    const key = `${CACHE_PREFIX}${wh}:cat:${aisleId}`;
    const { data, fetchedAt } = await getJsonWithTime(`categories/${aisleId}/`, wh);
    const products = parseAisle(data, aisleName);
    writeCache(key, products, fetchedAt);
    return stamp(products, fetchedAt);
}

export async function fetchAisle(wh: string, aisleId: number, aisleName: string, force = false): Promise<MercadonaProduct[]> {
    const key = `${CACHE_PREFIX}${wh}:cat:${aisleId}`;
    if (!force) {
        const cached = readCacheEntry<MercadonaProduct[]>(key);
        if (cached) return stamp(cached.data, contentAge(cached));
    }
    try {
        return await downloadAisle(wh, aisleId, aisleName);
    } catch (error) {
        const stale = readCacheEntry<MercadonaProduct[]>(key, true);
        if (stale) return stamp(stale.data, contentAge(stale));
        throw error;
    }
}

// Edad de los precios de los pasillos de esta zona: cuándo los sacó el proxy de Mercadona
// (o, en entradas antiguas, cuándo los guardó el móvil). Se lee solo el principio de cada entrada.
export function pricesFetchedAt(wh: string, aisleIds?: Set<number>): number | null {
    // El MÁS ANTIGUO de los pasillos guardados que siguen en el catálogo: si Mercadona deja renovar
    // unos pocos y rechaza el resto, el aviso no debe desaparecer por esos pocos.
    const prefix = `${CACHE_PREFIX}${wh}:cat:`;
    let oldest: number | null = null;
    for (const key of cacheKeys()) {
        if (!key.startsWith(prefix)) continue;
        if (aisleIds && aisleIds.size > 0 && !aisleIds.has(Number(key.slice(prefix.length)))) continue;
        try {
            const match = (localStorage.getItem(key) || "").slice(0, 60).match(/^\{"savedAt":(\d+)(?:,"fetchedAt":(\d+))?/);
            if (match) oldest = Math.min(oldest ?? Infinity, Number(match[2] ?? match[1]));
        } catch {
            // entrada ilegible: se ignora
        }
    }
    return oldest;
}

function isAisleCached(wh: string, aisleId: number): boolean {
    return readCache<MercadonaProduct[]>(`${CACHE_PREFIX}${wh}:cat:${aisleId}`) !== null;
}

// Pasillos ya descargados alguna vez cuyos datos tienen más de 24 h
function staleAisles(wh: string, groups: MercadonaGroup[]): MercadonaAisle[] {
    return groups.flatMap(group => group.aisles).filter(aisle => {
        const key = `${CACHE_PREFIX}${wh}:cat:${aisle.id}`;
        return readCache<MercadonaProduct[]>(key) === null && readCache<MercadonaProduct[]>(key, true) !== null;
    });
}

// Actualización silenciosa: vuelve a pedir solo los pasillos caducados que el usuario ya tenía,
// de uno en uno y con pausa. Para al primer fallo (salvo 404), si se cancela o si hay pausa tras un rechazo.
export async function refreshStaleAisles(
    wh: string,
    groups: MercadonaGroup[],
    onAisle: (products: MercadonaProduct[]) => void,
    isCancelled: () => boolean
): Promise<number> {
    let refreshed = 0;
    for (const aisle of staleAisles(wh, groups)) {
        if (isCancelled() || isMercadonaPaused()) break;
        try {
            const products = await downloadAisle(wh, aisle.id, aisle.name);
            // Si mientras tanto se cambió de zona, estos productos ya no son de la zona actual
            if (isCancelled()) break;
            onAisle(products);
            refreshed++;
        } catch (error) {
            // Ese pasillo ya no existe: se borra su copia (si no, se quedaría para siempre como "precio antiguo")
            if (error instanceof MercadonaError && error.status === 404) {
                dropAisle(wh, aisle.id);
            } else {
                // Cualquier otro fallo (sin conexión, Mercadona ocupado o rechazando) para la ronda:
                // insistir con el resto de pasillos solo sumaría peticiones rechazadas.
                break;
            }
        }
        await wait(400);
    }
    return refreshed;
}

function dropAisle(wh: string, aisleId: number) {
    try {
        localStorage.removeItem(`${CACHE_PREFIX}${wh}:cat:${aisleId}`);
    } catch {
        // nada que hacer
    }
}

// Mercadona nos está rechazando o pide calma: no tiene sentido seguir con más pasillos
const isRefusal = (error: unknown) =>
    error instanceof MercadonaError && error.origin === "mercadona" && (error.status === 401 || error.status === 403 || error.status === 429);

const wait = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms));

export type IndexProgress = { done: number, total: number, failed: number };

// Carga todos los pasillos que falten (o estén caducados) para que el buscador encuentre cualquier producto.
// De dos en dos y con pausa entre peticiones. Cuenta como fallo todo lo que no se pudo descargar de verdad
// (aunque se enseñe la copia antigua). Para en seco si hay pausa tras un rechazo, si Mercadona rechaza
// (401/403/429, sin reintentar) o tras 3 fallos seguidos; solo reintenta una vez los fallos pasajeros (5xx, red).
export async function indexAllAisles(
    wh: string,
    groups: MercadonaGroup[],
    onAisle: (products: MercadonaProduct[]) => void,
    onProgress: (progress: IndexProgress) => void,
    isCancelled: () => boolean,
    // "Reintentar" pulsado a mano: se intenta aunque haya pausa (al primer rechazo se vuelve a parar)
    ignorePause = false
): Promise<IndexProgress> {
    const aisles = groups.flatMap(group => group.aisles);
    const pending = aisles.filter(aisle => !isAisleCached(wh, aisle.id));
    const progress: IndexProgress = { done: aisles.length - pending.length, total: aisles.length, failed: 0 };
    onProgress({ ...progress });

    let next = 0;
    let consecutiveFailures = 0;
    let refused = false;
    const paused = () => !ignorePause && isMercadonaPaused();
    const shouldStop = () => isCancelled() || refused || consecutiveFailures >= 3 || paused();

    // Una vuelta: descarga el siguiente pasillo pendiente
    const step = async () => {
        const aisle = pending[next++];
        let products: MercadonaProduct[] | null = null;
        let gone = false;
        for (let attempt = 0; attempt < 2 && products === null && !isCancelled(); attempt++) {
            try {
                products = await downloadAisle(wh, aisle.id, aisle.name);
            } catch (error) {
                if (isRefusal(error)) {
                    refused = true;
                    break;
                }
                if (error instanceof MercadonaError && error.status === 404) {
                    gone = true;
                    dropAisle(wh, aisle.id);
                    break;
                }
                const transient = error instanceof MercadonaError && (error.status === 0 || error.status >= 500);
                if (attempt === 0 && transient && !paused()) await wait(3000);
                else break;
            }
        }
        if (isCancelled()) return;
        if (products) {
            consecutiveFailures = 0;
            onAisle(products);
        } else if (!gone) {
            consecutiveFailures++;
            progress.failed++;
            // Para el buscador vale la copia antigua, pero cuenta como fallo: el aviso "faltan pasillos" sale
            const stale = readCacheEntry<MercadonaProduct[]>(`${CACHE_PREFIX}${wh}:cat:${aisle.id}`, true);
            if (stale) onAisle(stamp(stale.data, contentAge(stale)));
        }
        progress.done++;
        onProgress({ ...progress });
        await wait(250);
    };
    const worker = async () => {
        while (next < pending.length && !shouldStop()) await step();
    };

    // Primero un pasillo solo, como prueba: si Mercadona rechaza, sale una única petición.
    // Si no hay rechazo (aunque ese pasillo falle por otra cosa), el resto de dos en dos.
    if (next < pending.length && !shouldStop()) await step();
    if (!shouldStop()) await Promise.all([worker(), worker()]);
    // Lo que no se llegó a intentar por parar antes también falta
    progress.failed += pending.length - Math.min(next, pending.length);
    progress.done = Math.min(progress.total, progress.done + (pending.length - Math.min(next, pending.length)));
    return { ...progress };
}

// Todos los productos de los pasillos ya cargados (para el buscador)
// ---------- Rebajas, novedades, ficha y parecidos ----------
// No hay documentación de estas respuestas: se buscan los productos dentro del JSON
// esté donde esté (cualquier objeto con id, nombre y price_instructions).

function categoryNames(product: Obj): { aisle: string, subcategory: string } {
    const names: string[] = [];
    let level = asArr(product.categories);
    for (let depth = 0; depth < 3 && level.length > 0; depth++) {
        const first = asObj(level[0]);
        if (!first) break;
        const name = str(first.name);
        if (name) names.push(name);
        level = asArr(first.categories);
    }
    return { aisle: names[1] || names[0] || "Mercadona", subcategory: names[2] || names[1] || names[0] || "Mercadona" };
}

function findProducts(json: unknown, limit = 400): MercadonaProduct[] {
    const found: MercadonaProduct[] = [];
    const seen = new Set<string>();
    const visit = (value: unknown, depth: number) => {
        if (depth > 8 || found.length >= limit) return;
        if (Array.isArray(value)) {
            for (const item of value) visit(item, depth + 1);
            return;
        }
        const object = asObj(value);
        if (!object) return;
        if (object.price_instructions && (object.display_name || object.name) && object.id !== undefined) {
            const { aisle, subcategory } = categoryNames(object);
            const product = parseProduct(object, subcategory, aisle);
            if (product && !seen.has(product.mercadonaId)) {
                seen.add(product.mercadonaId);
                found.push(product);
            }
            return;
        }
        for (const child of Object.values(object)) visit(child, depth + 1);
    };
    visit(json, 0);
    return found;
}

// Dato en caché con su fecha. respectPause: si hay pausa tras un rechazo, se devuelve lo guardado
// aunque esté caducado en vez de preguntar (solo para renovaciones automáticas, no para lo que pide el usuario).
async function cachedEntry<T>(key: string, download: () => Promise<{ data: T, fetchedAt?: number }>, force = false, ttl = TTL_MS, respectPause = false): Promise<CacheEntry<T>> {
    if (!force) {
        const cached = readCacheEntry<T>(key, false, ttl);
        if (cached) return cached;
        if (respectPause && isMercadonaPaused()) {
            // En pausa no se pregunta: lo guardado aunque esté caducado, o "Mercadona no responde"
            const stale = readCacheEntry<T>(key, true);
            if (stale) return stale;
            throw new MercadonaError(503);
        }
    }
    try {
        const { data, fetchedAt } = await download();
        writeCache(key, data, fetchedAt);
        return { savedAt: Date.now(), fetchedAt, data };
    } catch (error) {
        const stale = readCacheEntry<T>(key, true);
        if (stale) return stale;
        throw error;
    }
}

async function cachedJson<T>(key: string, download: () => Promise<T>, force = false, ttl = TTL_MS): Promise<T> {
    return (await cachedEntry(key, async () => ({ data: await download() }), force, ttl)).data;
}

export type HomeList = "price-drops" | "new-arrivals";

// Rebajas o novedades oficiales de Mercadona para la zona (caché de 24 h en el móvil; ver HOME_TTL_MS),
// con la fecha de descarga en cada producto para comparar con la copia del pasillo
export async function fetchHomeList(wh: string, kind: HomeList, force = false): Promise<MercadonaProduct[]> {
    const entry = await cachedEntry(`${CACHE_PREFIX}${wh}:home:${kind}`, async () => {
        const { data, fetchedAt } = await getJsonWithTime(`home/${kind}/`, wh);
        return { data: findProducts(data), fetchedAt };
    }, force, HOME_TTL_MS, true);
    return stamp(entry.data, contentAge(entry));
}

export type ProductDetail = {
    mercadonaId: string,
    product: MercadonaProduct | null,
    photos: string[],
    brand: string,
    origin: string,
    description: string,
    ingredients: string,
    allergens: string,
    storage: string,
    usage: string,
    // Cuándo se sacó de Mercadona (para avisar si la ficha es antigua)
    fetchedAt?: number,
};

// Quita etiquetas HTML y espacios sobrantes de los textos de la ficha
function plainText(value: unknown): string {
    const text = str(value);
    if (!text) return "";
    return text
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|li|div)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n+/g, "\n")
        .trim();
}

function parseDetail(json: unknown, mercadonaId: string): ProductDetail {
    const root = asObj(json) ?? {};
    const details = asObj(root.details) ?? {};
    const nutrition = asObj(root.nutrition_information) ?? {};
    // "zoom" son 3600 px (demasiado para el móvil): se pide a 900 px; si no hay, "regular" (600 px)
    const photos = asArr(root.photos)
        .map(asObj)
        .map(photo => {
            const zoom = safeImageUrl(photo?.zoom);
            return zoom ? largeImageUrl(zoom) : safeImageUrl(photo?.regular) || safeImageUrl(photo?.thumbnail);
        })
        .filter(Boolean);
    const { aisle, subcategory } = categoryNames(root);
    const pick = (...values: unknown[]) => values.map(plainText).find(Boolean) ?? "";
    return {
        mercadonaId,
        product: parseProduct(root, subcategory, aisle),
        photos,
        brand: pick(details.brand, root.brand),
        origin: pick(details.origin, root.origin),
        description: pick(details.description, details.legal_name, root.legal_name),
        ingredients: pick(nutrition.ingredients, details.ingredients, root.ingredients),
        allergens: pick(nutrition.allergens, details.allergens, root.allergens),
        storage: pick(details.storage_instructions, root.storage_instructions),
        usage: pick(details.usage_instructions, root.usage_instructions),
    };
}

const SAFE_ID = /^\d{1,8}(\.\d{1,3})?$/;

// Ficha completa de un producto: solo se pide cuando alguien la abre
export async function fetchProductDetail(wh: string, mercadonaId: string): Promise<ProductDetail> {
    if (!SAFE_ID.test(mercadonaId)) throw new MercadonaError(400);
    const entry = await cachedEntry(`${CACHE_PREFIX}${wh}:detail:${mercadonaId}`, async () => {
        const { data, fetchedAt } = await getJsonWithTime(`products/${mercadonaId}/`, wh);
        return { data: parseDetail(data, mercadonaId), fetchedAt };
    });
    return { ...entry.data, fetchedAt: contentAge(entry) };
}

// Productos parecidos según Mercadona (para sugerir alternativas más baratas)
export async function fetchSimilars(wh: string, mercadonaId: string): Promise<MercadonaProduct[]> {
    if (!SAFE_ID.test(mercadonaId)) throw new MercadonaError(400);
    return cachedJson(`${CACHE_PREFIX}${wh}:similars:${mercadonaId}`, async () =>
        findProducts(await getJson(`products/${mercadonaId}/similars/`, wh)).filter(product => product.mercadonaId !== mercadonaId));
}

export function getCachedProducts(wh: string): MercadonaProduct[] {
    const prefix = `${CACHE_PREFIX}${wh}:cat:`;
    const all: MercadonaProduct[] = [];
    for (const key of cacheKeys()) {
        if (!key.startsWith(prefix)) continue;
        const entry = readCacheEntry<MercadonaProduct[]>(key, true);
        if (entry) all.push(...stamp(entry.data, contentAge(entry)));
    }
    return all;
}

export function normalizeText(text: string): string {
    return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// ---------- Conversión a producto de la lista ----------

// Id numérico estable y fuera de los rangos actuales (1-69 del catálogo propio, 10 dígitos de los manuales)
export function mercadonaNumericId(mercadonaId: string): number {
    let hash = 5381;
    for (let i = 0; i < mercadonaId.length; i++) {
        hash = ((hash * 33) ^ mercadonaId.charCodeAt(i)) >>> 0;
    }
    return 1_000_000_000_000 + hash;
}

export function mercadonaDetail(product: MercadonaProduct): string {
    return [product.packaging, product.unitPrice].filter(Boolean).join(" · ");
}

export function toListItem(product: MercadonaProduct): listItem {
    return {
        id: mercadonaNumericId(product.mercadonaId),
        name: product.name,
        type: product.aisle,
        price: product.price,
        source: "mercadona",
        image: product.image || undefined,
        mercadonaId: product.mercadonaId,
        packaging: product.packaging || undefined,
        unitPrice: product.unitPrice || undefined,
        isNew: product.isNew || undefined,
        byWeight: product.byWeight || undefined,
    };
}

// ---------- Imágenes para el PDF ----------

function thumbnailUrl(url: string, size: number): string {
    try {
        const parsed = new URL(url);
        parsed.searchParams.set("fit", "crop");
        parsed.searchParams.set("w", String(size));
        parsed.searchParams.set("h", String(size));
        return parsed.toString();
    } catch {
        return url;
    }
}

// Versión grande de la foto para el zoom: el CDN de Mercadona (imgix) la sirve al tamaño que se pida,
// sin recortar (fit=max) y sin agrandar más que el original
export function largeImageUrl(url: string, size = 900): string {
    try {
        const parsed = new URL(url);
        parsed.searchParams.set("fit", "max");
        parsed.searchParams.set("w", String(size));
        parsed.searchParams.set("h", String(size));
        return parsed.toString();
    } catch {
        return url;
    }
}

async function blobToJpegDataUrl(blob: Blob, size: number): Promise<string | null> {
    if (!blob.type.startsWith("image/")) return null;
    const objectUrl = URL.createObjectURL(blob);
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = objectUrl;
        });
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context) return null;
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, size, size);
        const scale = Math.min(size / image.width, size / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
        return canvas.toDataURL("image/jpeg", 0.8);
    } catch {
        return null;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

// Devuelve la miniatura como JPEG en base64, o null si no se puede (el PDF sale igual, sin foto)
export async function imageToDataUrl(url: string, size = 120): Promise<string | null> {
    if (!url) return null;
    const small = thumbnailUrl(url, size);
    const attempts = [small, `${IMG_PROXY}?url=${encodeURIComponent(small)}`];
    for (const attempt of attempts) {
        try {
            const response = await fetch(attempt);
            if (!response.ok) continue;
            const dataUrl = await blobToJpegDataUrl(await response.blob(), size);
            if (dataUrl) return dataUrl;
        } catch {
            // CORS o red: se prueba el siguiente camino
        }
    }
    return null;
}
