import { saveImportant } from "./mercadona";

// ---------- Mudanza a la dirección nueva (mercalista.vercel.app) ----------
// La lista, los favoritos, la zona y el historial de precios se guardan en el navegador, y el navegador
// los guarda por dirección: en una dirección nueva la app empezaría vacía. En la dirección vieja se
// prepara un código con esos datos y en la nueva se mete:
// - con el enlace "Llevar mis datos" (el código va tras la #, que no llega a ningún servidor), y
// - pegándolo: en el iPhone la app de la pantalla de inicio no comparte datos con Safari (decisión de
//   Apple), así que la app nueva instalada empieza vacía aunque el enlace se abriera en Safari.

export const OLD_HOST = "anita-y-su-comprita.vercel.app";
export const NEW_HOST = "mercalista.vercel.app";
export const NEW_ORIGIN = `https://${NEW_HOST}`;
export const MOVE_HASH = "#mudanza=";

const ORDER_KEY = "order";
const FAVORITES_KEY = "favorites";
const ZONE_KEY = "mercadona-zone:v1";
const WAREHOUSE_KEY = "mercadona:v1:wh";
const HISTORY_KEY = "price-history:v1";
const RESULT_KEY = "move-result";
const DISMISSED_KEY = "move-dismissed";

// Comprimido (deflate) o tal cual si el navegador no sabe comprimir
const PREFIX_DEFLATE = "ML1z.";
const PREFIX_PLAIN = "ML1j.";
const MAX_CODE_LENGTH = 2_000_000;

export const isOldHost = () => typeof location !== "undefined" && location.hostname === OLD_HOST;
export const isNewHost = () => typeof location !== "undefined" && location.hostname === NEW_HOST;

export class MoveError extends Error {}

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function toBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
    const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
    return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
    const output = await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer();
    return new Uint8Array(output);
}

function readJson(key: string): unknown {
    try {
        return JSON.parse(localStorage.getItem(key) || "null");
    } catch {
        return null;
    }
}

// ---------- Comprobación de lo que llega (el código lo puede haber pegado cualquiera) ----------

function validItems(value: unknown, needsQuantity: boolean): Obj[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Obj => isObj(item)
        && typeof item.id === "number" && Number.isFinite(item.id)
        && typeof item.name === "string" && item.name.length > 0 && item.name.length <= 300
        && (item.price === undefined || (typeof item.price === "number" && Number.isFinite(item.price) && item.price >= 0))
        && (!needsQuantity || (typeof item.quantity === "number" && item.quantity > 0 && item.quantity <= 999)))
        .slice(0, 1000);
}

function validZone(value: unknown): Obj | null {
    return isObj(value) && typeof value.postalCode === "string" && /^\d{5}$/.test(value.postalCode)
        && typeof value.wh === "string" && /^[a-z0-9]{2,10}$/.test(value.wh) ? { postalCode: value.postalCode, wh: value.wh } : null;
}

function validHistory(value: unknown): Record<string, { d: number, p: number }[]> {
    const result: Record<string, { d: number, p: number }[]> = {};
    if (!isObj(value)) return result;
    for (const [key, points] of Object.entries(value).slice(0, 2000)) {
        if (!Array.isArray(points)) continue;
        const clean = points.filter((point): point is { d: number, p: number } => isObj(point)
            && typeof point.d === "number" && typeof point.p === "number" && Number.isFinite(point.p)).slice(-24);
        if (clean.length) result[key.slice(0, 80)] = clean.map(point => ({ d: point.d, p: point.p }));
    }
    return result;
}

export type MoveData = {
    order: Obj[],
    favorites: Obj[],
    zone: Obj | null,
    wh: string | null,
    history: Record<string, { d: number, p: number }[]>,
};

// ---------- Vieja: preparar el código ----------

// La lista y los favoritos llegan de la app (lo que se ve ahora); lo demás se lee del almacenamiento
export async function buildMoveCode(order: unknown[], favorites: unknown[]): Promise<string> {
    const wh = localStorage.getItem(WAREHOUSE_KEY);
    const payload = {
        v: 1,
        order,
        favorites,
        zone: readJson(ZONE_KEY),
        wh: wh && /^[a-z0-9]{2,10}$/.test(wh) ? wh : null,
        history: readJson(HISTORY_KEY) ?? {},
    };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    if (typeof CompressionStream === "function") {
        try {
            return PREFIX_DEFLATE + toBase64Url(await pipe(bytes, new CompressionStream("deflate-raw")));
        } catch {
            // sin compresión: el código sale más largo pero sirve igual
        }
    }
    return PREFIX_PLAIN + toBase64Url(bytes);
}

// ---------- Nueva: leer el código y guardar los datos ----------

export async function readMoveCode(text: string): Promise<MoveData> {
    // Vale el código solo o el enlace entero (con lo que haya delante de la #)
    const code = text.trim().replace(/^[\s\S]*#mudanza=/, "").replace(/\s+/g, "");
    if (!code || code.length > MAX_CODE_LENGTH) throw new MoveError("vacío");
    let bytes: Uint8Array;
    try {
        if (code.startsWith(PREFIX_DEFLATE)) {
            if (typeof DecompressionStream !== "function") throw new MoveError("sin descompresión");
            bytes = await pipe(fromBase64Url(code.slice(PREFIX_DEFLATE.length)), new DecompressionStream("deflate-raw"));
        } else if (code.startsWith(PREFIX_PLAIN)) {
            bytes = fromBase64Url(code.slice(PREFIX_PLAIN.length));
        } else {
            throw new MoveError("formato");
        }
    } catch (error) {
        throw error instanceof MoveError ? error : new MoveError("corrupto");
    }
    let payload: unknown;
    try {
        payload = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        throw new MoveError("corrupto");
    }
    if (!isObj(payload) || payload.v !== 1) throw new MoveError("versión");
    return {
        order: validItems(payload.order, true),
        favorites: validItems(payload.favorites, false),
        zone: validZone(payload.zone),
        wh: typeof payload.wh === "string" && /^[a-z0-9]{2,10}$/.test(payload.wh) ? payload.wh : null,
        history: validHistory(payload.history),
    };
}

// Une lo que llega con lo que ya hubiera aquí: no se pisa nada.
// Lista y favoritos: se añaden los que falten. Zona: se queda la de aquí si ya había una.
// Historial: de cada producto, la serie más larga.
export function applyMove(data: MoveData): { products: number, favorites: number } {
    const unite = (key: string, incoming: Obj[], needsQuantity: boolean) => {
        const local = validItems(readJson(key), needsQuantity);
        const ids = new Set(local.map(item => item.id));
        const merged = [...local, ...incoming.filter(item => !ids.has(item.id))];
        saveImportant(key, JSON.stringify(merged));
        return merged.length;
    };
    const products = unite(ORDER_KEY, data.order, true);
    const favorites = unite(FAVORITES_KEY, data.favorites, false);

    if (!validZone(readJson(ZONE_KEY))) {
        if (data.zone) saveImportant(ZONE_KEY, JSON.stringify(data.zone));
        else if (data.wh && !localStorage.getItem(WAREHOUSE_KEY)) saveImportant(WAREHOUSE_KEY, data.wh);
    }

    const prices = validHistory(readJson(HISTORY_KEY));
    for (const [key, points] of Object.entries(data.history)) {
        if (!prices[key] || prices[key].length < points.length) prices[key] = points;
    }
    if (Object.keys(prices).length) saveImportant(HISTORY_KEY, JSON.stringify(prices));

    const result = { products, favorites };
    try {
        sessionStorage.setItem(RESULT_KEY, JSON.stringify(result));
    } catch {
        // sin aviso de resultado: los datos ya están guardados
    }
    return result;
}

// Al abrir la app por el enlace "Llevar mis datos": se meten los datos antes de pintar nada
// (la lista y los favoritos se leen del almacenamiento al arrancar) y se quita el código de la dirección.
export async function importFromLink(): Promise<void> {
    if (!location.hash.startsWith(MOVE_HASH)) return;
    const code = location.hash.slice(MOVE_HASH.length);
    history.replaceState(null, "", location.pathname + location.search);
    try {
        applyMove(await readMoveCode(code));
    } catch {
        try {
            sessionStorage.setItem(RESULT_KEY, JSON.stringify({ error: true }));
        } catch {
            // nada que avisar
        }
    }
}

// Resultado de la mudanza para avisar una vez (se borra al leerlo)
export function takeMoveResult(): { products: number, favorites: number } | { error: true } | null {
    try {
        const raw = sessionStorage.getItem(RESULT_KEY);
        sessionStorage.removeItem(RESULT_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return isObj(parsed) ? parsed as { products: number, favorites: number } | { error: true } : null;
    } catch {
        return null;
    }
}

export function moveDismissed(): boolean {
    try {
        return localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
        return false;
    }
}

export function dismissMove() {
    saveImportant(DISMISSED_KEY, "1");
}
