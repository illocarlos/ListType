import { formatCurrency } from "./formatPrice";
import type { listItem, MercadonaGroup, MercadonaProduct } from "../types/types";

// Todas las peticiones pasan por el proxy de Vercel (api/mercadona.js) o, en local, por el proxy de Vite
const API_BASE = "/api/mercadona";
const IMG_PROXY = "/api/mercadona-img";
const CACHE_PREFIX = "mercadona:v1:";
const WAREHOUSE_KEY = `${CACHE_PREFIX}wh`;
const TTL_MS = 24 * 60 * 60 * 1000;

// Almacén de Sevilla. Sin verificar: se puede cambiar desde el panel de Mercadona
export const DEFAULT_WAREHOUSE = "svq1";

type CacheEntry<T> = { savedAt: number, data: T };

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

function saveZone(zone: Zone) {
    try {
        localStorage.setItem(ZONE_KEY, JSON.stringify(zone));
    } catch {
        // sin espacio: se usará durante esta sesión igualmente
    }
}

export type ZoneErrorReason = "invalid" | "no-service" | "busy" | "connection";

export class ZoneError extends Error {
    reason: ZoneErrorReason;
    constructor(reason: ZoneErrorReason) {
        const messages: Record<ZoneErrorReason, string> = {
            invalid: "El código postal tiene que tener 5 números. Por ejemplo: 41300.",
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
    if (!/^\d{5}$/.test(postalCode)) throw new ZoneError("invalid");
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
    if (response.status === 429) throw new ZoneError("busy");
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
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5 * 60 * 1000 });
    });
}

// Pide la ubicación (con permiso del usuario) y la convierte en código postal con OpenStreetMap, vía el proxy.
// La ubicación no se guarda en ningún sitio.
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
    try {
        localStorage.setItem(WAREHOUSE_KEY, clean);
    } catch {
        // sin espacio: se usará durante esta sesión igualmente
    }
    return true;
}

// ---------- Caché en localStorage ----------

function readCache<T>(key: string, allowStale = false): T | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const entry = JSON.parse(raw) as CacheEntry<T>;
        if (!entry || typeof entry.savedAt !== "number") return null;
        if (!allowStale && Date.now() - entry.savedAt > TTL_MS) return null;
        return entry.data;
    } catch {
        return null;
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

function writeCache<T>(key: string, data: T) {
    const value = JSON.stringify({ savedAt: Date.now(), data });
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

// Vacía toda la caché de Mercadona (se usa si la lista no cabe al guardarse)
export function freeCacheSpace() {
    for (const key of cacheKeys()) {
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
    const price = num(priceInfo?.unit_price) ?? num(priceInfo?.bulk_price) ?? 0;
    const previous = num(priceInfo?.previous_unit_price);

    const referencePrice = num(priceInfo?.reference_price);
    const referenceFormat = str(priceInfo?.reference_format);
    const unitPrice = referencePrice !== null && referenceFormat
        ? `${formatCurrency(referencePrice)}/${referenceFormat}`
        : "";

    const unitSize = num(priceInfo?.unit_size);
    const sizeFormat = str(priceInfo?.size_format);
    const size = unitSize !== null && sizeFormat ? `${unitSize.toLocaleString("es-ES")} ${sizeFormat}` : "";
    const packaging = [str(product.packaging), size].filter(Boolean).join(" ");

    // Marca propia de Mercadona de producto nuevo (no da fecha de lanzamiento)
    const badges = asObj(product.badges);
    const isNew = priceInfo?.is_new === true || product.is_new === true || badges?.is_new === true;

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
    };
}

// ---------- Novedades detectadas por la app ----------
// Mercadona no publica la fecha de lanzamiento. La app apunta el día en que ve cada producto por primera vez
// y el día en que vio cada pasillo por primera vez. Un producto que aparece en un pasillo ya conocido
// es novedad durante NEW_DAYS días. Va en una clave aparte para que la limpieza de caché no la borre.

const SEEN_PREFIX = "mercadona-seen:v1:";
const NEW_DAYS = 60;

type SeenStore = { aisles: Record<string, number>, products: Record<string, number> };

const today = () => Math.floor(Date.now() / 86_400_000);

function readSeen(wh: string): SeenStore {
    try {
        const raw = localStorage.getItem(`${SEEN_PREFIX}${wh}`);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === "object" && parsed.aisles && parsed.products) return parsed as SeenStore;
    } catch {
        // dato corrupto: se empieza de cero
    }
    return { aisles: {}, products: {} };
}

function writeSeen(wh: string, store: SeenStore) {
    try {
        localStorage.setItem(`${SEEN_PREFIX}${wh}`, JSON.stringify(store));
    } catch {
        // sin espacio: se pierde solo la detección de novedades
    }
}

// Apunta los productos vistos y marca como novedad los que han aparecido hace menos de NEW_DAYS días
function markNewProducts(wh: string, aisleId: number, products: MercadonaProduct[]): MercadonaProduct[] {
    const store = readSeen(wh);
    const day = today();
    const aisleKey = String(aisleId);
    const firstVisit = store.aisles[aisleKey] === undefined;
    if (firstVisit) store.aisles[aisleKey] = day;
    const aisleBaseline = store.aisles[aisleKey];

    let changed = firstVisit;
    const marked = products.map(product => {
        if (store.products[product.mercadonaId] === undefined) {
            store.products[product.mercadonaId] = day;
            changed = true;
        }
        const firstSeen = store.products[product.mercadonaId];
        const appearedLater = firstSeen > aisleBaseline;
        const recent = day - firstSeen <= NEW_DAYS;
        return appearedLater && recent && !product.isNew ? { ...product, isNew: true } : product;
    });
    if (changed) writeSeen(wh, store);
    return marked;
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

// Se llama a la función directamente (sin reglas de reescritura en vercel.json)
async function getJson(path: string, wh: string): Promise<unknown> {
    const params = new URLSearchParams({ path, lang: "es", wh });
    let response: Response;
    try {
        response = await fetch(`${API_BASE}?${params.toString()}`, {
            headers: { Accept: "application/json" },
        });
    } catch {
        throw new MercadonaError(0, "red");
    }
    if (!response.ok) {
        let fromProxy = response.headers.get("x-listtype-proxy") === "1";
        try {
            const body = await response.json();
            if (body && typeof body === "object" && (body as { source?: string }).source === "proxy") fromProxy = true;
        } catch {
            // cuerpo no JSON: lo ha respondido Vercel, no la función
        }
        throw new MercadonaError(response.status, fromProxy ? "mercadona" : "vercel");
    }
    try {
        return await response.json();
    } catch {
        throw new MercadonaError(502);
    }
}

export async function fetchGroups(wh: string, force = false): Promise<MercadonaGroup[]> {
    const key = `${CACHE_PREFIX}${wh}:categories`;
    if (!force) {
        const cached = readCache<MercadonaGroup[]>(key);
        if (cached && cached.length) return cached;
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

export async function fetchAisle(wh: string, aisleId: number, aisleName: string, force = false): Promise<MercadonaProduct[]> {
    const key = `${CACHE_PREFIX}${wh}:cat:${aisleId}`;
    if (!force) {
        const cached = readCache<MercadonaProduct[]>(key);
        if (cached) return cached;
    }
    try {
        const products = markNewProducts(wh, aisleId, parseAisle(await getJson(`categories/${aisleId}/`, wh), aisleName));
        writeCache(key, products);
        return products;
    } catch (error) {
        const stale = readCache<MercadonaProduct[]>(key, true);
        if (stale) return stale;
        throw error;
    }
}

function isAisleCached(wh: string, aisleId: number): boolean {
    return readCache<MercadonaProduct[]>(`${CACHE_PREFIX}${wh}:cat:${aisleId}`) !== null;
}

const wait = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms));

export type IndexProgress = { done: number, total: number, failed: number };

// Carga todos los pasillos que falten en caché para que el buscador encuentre cualquier producto.
// De dos en dos y con pausa entre peticiones; reintenta una vez los 429/5xx y para tras 3 fallos seguidos.
export async function indexAllAisles(
    wh: string,
    groups: MercadonaGroup[],
    onAisle: (products: MercadonaProduct[]) => void,
    onProgress: (progress: IndexProgress) => void,
    isCancelled: () => boolean
): Promise<IndexProgress> {
    const aisles = groups.flatMap(group => group.aisles);
    const pending = aisles.filter(aisle => !isAisleCached(wh, aisle.id));
    const progress: IndexProgress = { done: aisles.length - pending.length, total: aisles.length, failed: 0 };
    onProgress({ ...progress });

    let next = 0;
    let consecutiveFailures = 0;

    const worker = async () => {
        while (next < pending.length && consecutiveFailures < 3 && !isCancelled()) {
            const aisle = pending[next++];
            let products: MercadonaProduct[] | null = null;
            for (let attempt = 0; attempt < 2 && products === null && !isCancelled(); attempt++) {
                try {
                    products = await fetchAisle(wh, aisle.id, aisle.name);
                } catch (error) {
                    const retryable = error instanceof MercadonaError
                        && (error.status === 429 || error.status === 0 || error.status >= 500);
                    if (attempt === 0 && retryable) await wait(3000);
                    else break;
                }
            }
            if (isCancelled()) return;
            if (products) {
                consecutiveFailures = 0;
                onAisle(products);
            } else {
                consecutiveFailures++;
                progress.failed++;
            }
            progress.done++;
            onProgress({ ...progress });
            await wait(250);
        }
    };

    await Promise.all([worker(), worker()]);
    return { ...progress };
}

// Todos los productos de los pasillos ya cargados (para el buscador)
export function getCachedProducts(wh: string): MercadonaProduct[] {
    const prefix = `${CACHE_PREFIX}${wh}:cat:`;
    const all: MercadonaProduct[] = [];
    for (const key of cacheKeys()) {
        if (!key.startsWith(prefix)) continue;
        const products = readCache<MercadonaProduct[]>(key, true);
        if (products) all.push(...products);
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
