import type { listItem, orderItem } from "../types/types";
import { saveImportant } from "./mercadona";
import {
    DEFAULT_LIST_NAME, dropListData, loadListOrder, loadListShared, loadRegistry, replaceRegistry, saveListOrder, saveListShared,
    type ListMeta,
} from "./lists";
import {
    DEFAULT_FAV_NAME, dropCollectionData, loadFavItems, loadFavRegistry, mergeFavorites, replaceFavRegistry, saveFavItems,
    type FavMeta,
} from "./favlists";
import { newSharedState } from "./sync";

// Cuenta opcional con Google: una copia de los datos de la persona (listas, favoritos, colecciones y ajustes) para
// recuperarla en otro móvil. Sin cuenta, nada de esto se usa.
//
// Los datos viajan en «secciones»: meta (nombres, fijadas, ajustes), hist (historial de precios), una por lista
// (L:id) y una por colección de favoritos (F:id). Cada móvil recuerda hasta qué revisión del servidor ha llegado y
// una huella de cada sección tal como la tiene el servidor: lo que difiere es lo que hay que subir.
//
// Importante: las listas y los favoritos viven en memoria dentro de la app. Escribir en el almacenamiento mientras la
// persona la usa haría que la app pisara lo escrito en su siguiente cambio. Por eso lo que llega de otros móviles
// solo se aplica «en un momento seguro» (al abrir, al volver a la app o tras un rato sin tocar nada) y después se
// recarga la página; mientras tanto solo se SUBE (sin tocar el almacenamiento) y lo que llega se guarda aparte.

const ACCOUNT_KEY = "account:v1";
const LAST_KEY = "account:last";
const NONCE_KEY = "account:nonce";
const NAME_KEY = "shared-name:v1";
const ZONE_KEY = "mercadona-zone:v1";
const WAREHOUSE_KEY = "mercadona:v1:wh";
const HISTORY_KEY = "price-history:v1";
const GONE_DAYS = 60;

type Section = Record<string, unknown>;
type Sections = Record<string, Section>;
type Remote = Record<string, { r: number, v: Section }>;

export type AccountState = {
    uid: string,
    email: string,
    name: string,
    // Hasta qué revisión del servidor ha llegado este móvil
    rev: number,
    // Huella de cada sección tal como la tiene el servidor
    hashes: Record<string, string>,
    // Listas y colecciones borradas aquí (para que se borren también en los demás móviles)
    gone: Record<string, number>,
    // Lo que han cambiado otros móviles y aún no se ha aplicado aquí
    pending: Remote,
    // Ya se hizo la primera unión con lo que había en el servidor
    linked: boolean,
    // La sesión caducó o se cerró desde otro sitio: hay que volver a entrar
    signedOut?: boolean,
};

export class AccountError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string) {
        super(code);
        this.status = status;
        this.code = code;
    }
}

export function accountErrorText(error: unknown): string {
    const status = error instanceof AccountError ? error.status : -1;
    const code = error instanceof AccountError ? error.code : "";
    if (code === "not_configured") return "Entrar con Google todavía no está activado en la app.";
    if (status === 0) return "Sin conexión. Inténtalo cuando tengas internet.";
    if (status === 401) return "Google no ha podido confirmar que eres tú. Vuelve a intentarlo.";
    if (status === 429) return "Demasiados intentos o límite gratuito alcanzado. Prueba más tarde.";
    if (status === 413) return "Hay demasiados datos para guardar en la cuenta (alguna lista es enorme).";
    return "No se ha podido. Inténtalo otra vez en un momento.";
}

// ---------- Almacenamiento ----------

const readRaw = (key: string): string | null => {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};

function readJson(key: string): unknown {
    try {
        return JSON.parse(localStorage.getItem(key) || "null");
    } catch {
        return null;
    }
}

function removeKey(key: string) {
    try {
        localStorage.removeItem(key);
    } catch {
        // nada que borrar
    }
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const asArray = <T,>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

export function loadAccount(): AccountState | null {
    const raw = readJson(ACCOUNT_KEY);
    if (!isObject(raw) || typeof raw.uid !== "string") return null;
    return {
        uid: raw.uid,
        email: typeof raw.email === "string" ? raw.email : "",
        name: typeof raw.name === "string" ? raw.name : "",
        rev: Number.isSafeInteger(raw.rev) ? raw.rev as number : 0,
        hashes: isObject(raw.hashes) ? raw.hashes as Record<string, string> : {},
        gone: isObject(raw.gone) ? raw.gone as Record<string, number> : {},
        pending: isObject(raw.pending) ? raw.pending as Remote : {},
        linked: raw.linked === true,
        signedOut: raw.signedOut === true || undefined,
    };
}

function saveAccount(state: AccountState) {
    saveImportant(ACCOUNT_KEY, JSON.stringify(state));
}

// ---------- Huellas ----------

// JSON con las claves ordenadas: la misma sección da siempre el mismo texto
function canon(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
    if (isObject(value)) return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${canon(value[key])}`).join(",")}}`;
    return JSON.stringify(value) ?? "null";
}

// Huella de 53 bits (cyrb53): no es criptográfica, solo sirve para saber si algo ha cambiado
export function hashOf(value: unknown): string {
    const text = canon(value);
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ code, 2654435761);
        h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return `${(h2 >>> 0).toString(16)}${(h1 >>> 0).toString(16)}:${text.length}`;
}

// ---------- Datos locales <-> secciones ----------

export function exportSections(gone: Record<string, number>): Sections {
    const registry = loadRegistry();
    const favRegistry = loadFavRegistry();
    const out: Sections = {};
    out.meta = {
        lists: registry.lists,
        pinned: registry.pinned,
        flists: favRegistry.lists,
        fpinned: favRegistry.pinned,
        name: readRaw(NAME_KEY),
        zone: readRaw(ZONE_KEY),
        wh: readRaw(WAREHOUSE_KEY),
        gone,
    };
    const history = readJson(HISTORY_KEY);
    out.hist = isObject(history) ? history : {};
    for (const list of registry.lists) {
        const binding = loadListShared(list.id);
        // Una lista compartida vive en su propio servidor: aquí solo se apunta que lo es (para entrar en ella desde otro móvil)
        out[`L:${list.id}`] = { shared: binding?.id ?? null, order: binding ? [] : loadListOrder(list.id) };
    }
    for (const collection of favRegistry.lists) out[`F:${collection.id}`] = { items: loadFavItems(collection.id) };
    return out;
}

const hashesOf = (sections: Sections): Record<string, string> => Object.fromEntries(Object.entries(sections).map(([key, value]) => [key, hashOf(value)]));

const isId = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{16}$/.test(value);
const cleanLists = (value: unknown): ListMeta[] => asArray<ListMeta>(value).filter(entry => isObject(entry) && isId(entry.id) && typeof entry.name === "string");
const cleanCollections = (value: unknown): FavMeta[] => cleanLists(value);
const keyOf = (prefix: "L" | "F", id: string) => `${prefix}:${id}`;

function unionById<T extends { id: string }>(first: T[], second: T[]): T[] {
    const seen = new Set(first.map(entry => entry.id));
    return [...first, ...second.filter(entry => !seen.has(entry.id))];
}

function mergeNumberedItems<T extends { id: number }>(local: T[], remote: T[]): T[] {
    const seen = new Set(local.map(item => item.id));
    return [...local, ...remote.filter(item => item && typeof item.id === "number" && !seen.has(item.id))];
}

function mergeHistory(local: Section, remote: Section): Section {
    const out: Record<string, unknown> = { ...remote };
    for (const [key, points] of Object.entries(local)) {
        const other = asArray<unknown>(out[key]);
        if (!(key in out) || asArray<unknown>(points).length >= other.length) out[key] = points;
    }
    return out;
}

const withoutGone = <T extends { id: string }>(entries: T[], prefix: "L" | "F", gone: Record<string, number>) => entries.filter(entry => !(keyOf(prefix, entry.id) in gone));

// Une la «meta» de aquí con la del servidor. Sin cambios aquí gana la del servidor; con cambios en los dos sitios se
// juntan las listas (los nombres de aquí mandan) y lo escalar de aquí manda si existe.
function mergeMeta(local: Section, remote: Section, dirty: boolean): Section {
    const gone: Record<string, number> = { ...(isObject(remote.gone) ? remote.gone as Record<string, number> : {}), ...(isObject(local.gone) ? local.gone as Record<string, number> : {}) };
    const pick = (key: string): unknown => dirty ? (local[key] ?? remote[key] ?? null) : (remote[key] ?? local[key] ?? null);
    const localLists = cleanLists(local.lists);
    const localFavs = cleanCollections(local.flists);
    const lists = withoutGone(dirty ? unionById(localLists, cleanLists(remote.lists)) : cleanLists(remote.lists), "L", gone);
    const flists = withoutGone(dirty ? unionById(localFavs, cleanCollections(remote.flists)) : cleanCollections(remote.flists), "F", gone);
    const pinned = pick("pinned");
    const fpinned = pick("fpinned");
    return {
        lists,
        pinned: typeof pinned === "string" && lists.some(list => list.id === pinned) ? pinned : null,
        flists,
        fpinned: typeof fpinned === "string" && flists.some(collection => collection.id === fpinned) ? fpinned : null,
        name: pick("name"),
        zone: pick("zone"),
        wh: pick("wh"),
        gone,
    };
}

function mergeSection(key: string, local: Section | undefined, remote: Section, dirty: boolean): Section {
    if (!local || !dirty) return remote;
    if (key === "meta") return mergeMeta(local, remote, true);
    if (key === "hist") return mergeHistory(local, remote);
    if (key.startsWith("L:")) {
        return { shared: local.shared ?? remote.shared ?? null, order: mergeNumberedItems(asArray<orderItem>(local.order), asArray<orderItem>(remote.order)) };
    }
    return { items: mergeFavorites(asArray<listItem>(local.items), asArray<listItem>(remote.items)).items };
}

// Resultado de juntar lo de aquí con lo que han cambiado otros móviles
function mergeInto(local: Sections, remote: Remote, dirty: Set<string>): Sections {
    const metaRemote = remote.meta?.v;
    const meta = metaRemote ? mergeMeta(local.meta ?? {}, metaRemote, dirty.has("meta")) : local.meta;
    const gone = (meta?.gone ?? {}) as Record<string, number>;
    const out: Sections = { ...local, meta };
    for (const [key, section] of Object.entries(remote)) {
        if (key === "meta") continue;
        if ((key.startsWith("L:") || key.startsWith("F:")) && key in gone) continue;
        out[key] = mergeSection(key, local[key], section.v, dirty.has(key));
    }
    // Lo que ya no está en las listas de la meta (borrado en otro móvil) desaparece también de aquí
    const keep = new Set([...cleanLists(meta?.lists).map(list => keyOf("L", list.id)), ...cleanCollections(meta?.flists).map(entry => keyOf("F", entry.id))]);
    for (const key of Object.keys(out)) {
        if ((key.startsWith("L:") || key.startsWith("F:")) && !keep.has(key)) delete out[key];
    }
    return out;
}

// Escribe las secciones en el almacenamiento del móvil (sustituyendo lo que había)
function writeSections(sections: Sections) {
    const meta = sections.meta;
    if (!meta) return;
    const lists = cleanLists(meta.lists);
    const collections = cleanCollections(meta.flists);
    const registry = loadRegistry();
    const favRegistry = loadFavRegistry();
    if (lists.length) {
        replaceRegistry({
            current: lists.some(list => list.id === registry.current) ? registry.current : lists[0].id,
            pinned: typeof meta.pinned === "string" && lists.some(list => list.id === meta.pinned) ? meta.pinned : null,
            lists,
        });
    }
    if (collections.length) {
        replaceFavRegistry({
            current: collections.some(entry => entry.id === favRegistry.current) ? favRegistry.current : collections[0].id,
            pinned: typeof meta.fpinned === "string" && collections.some(entry => entry.id === meta.fpinned) ? meta.fpinned : null,
            lists: collections,
        });
    }
    if (lists.length) for (const old of registry.lists) if (!lists.some(list => list.id === old.id)) dropListData(old.id);
    if (collections.length) for (const old of favRegistry.lists) if (!collections.some(entry => entry.id === old.id)) dropCollectionData(old.id);
    for (const list of lists) {
        const section = sections[keyOf("L", list.id)];
        if (!section) continue;
        const sharedId = typeof section.shared === "string" ? section.shared : null;
        const binding = loadListShared(list.id);
        if (sharedId && !binding) {
            // Compartida desde otro móvil: aquí se entra en ella (la lista se baja sola del servidor de listas)
            saveListShared(list.id, newSharedState(sharedId, 0, []));
            saveListOrder(list.id, []);
        } else if (!binding) {
            saveListOrder(list.id, asArray<orderItem>(section.order).filter(item => isObject(item) && typeof item.id === "number"));
        }
    }
    for (const entry of collections) {
        const section = sections[keyOf("F", entry.id)];
        if (section) saveFavItems(entry.id, asArray<listItem>(section.items).filter(item => isObject(item) && typeof item.id === "number"));
    }
    if (typeof meta.name === "string") saveImportant(NAME_KEY, meta.name);
    if (typeof meta.zone === "string") saveImportant(ZONE_KEY, meta.zone);
    if (typeof meta.wh === "string") saveImportant(WAREHOUSE_KEY, meta.wh);
    if (sections.hist && Object.keys(sections.hist).length) saveImportant(HISTORY_KEY, JSON.stringify(sections.hist));
}

// ---------- Primera unión (un móvil que se conecta a una cuenta que ya tiene datos) ----------

// Lo habitual: un móvil nuevo, con la «La compra» y «Mis favoritos» vacías de fábrica → se sustituyen por las de la
// cuenta. Si el móvil ya tenía cosas en la lista o la colección de siempre, se juntan con las de la cuenta que tienen
// el mismo nombre de siempre; el resto de lo de este móvil se conserva como listas y colecciones aparte.
function linkSections(local: Sections, remote: Remote): Sections {
    const remoteMeta = remote.meta?.v ?? {};
    const remoteLists = cleanLists(remoteMeta.lists);
    const remoteCollections = cleanCollections(remoteMeta.flists);
    const out: Sections = { hist: mergeHistory(local.hist ?? {}, remote.hist?.v ?? {}) };
    for (const [key, section] of Object.entries(remote)) {
        if (key.startsWith("L:") || key.startsWith("F:")) out[key] = section.v;
    }
    const lists = [...remoteLists];
    for (const mine of cleanLists(local.meta?.lists)) {
        const section = local[keyOf("L", mine.id)] ?? { shared: null, order: [] };
        const items = asArray<orderItem>(section.order);
        if (remoteLists.some(entry => entry.id === mine.id)) {
            // La misma lista (volver a entrar con la misma cuenta): se juntan sus productos, sin duplicar la lista
            const target = out[keyOf("L", mine.id)] ?? { shared: null, order: [] };
            out[keyOf("L", mine.id)] = mergeSection(keyOf("L", mine.id), section, target, true);
            continue;
        }
        if (mine.name === DEFAULT_LIST_NAME && !section.shared && items.length === 0 && remoteLists.length > 0) continue;
        const twin = remoteLists.find(entry => entry.name === DEFAULT_LIST_NAME && mine.name === DEFAULT_LIST_NAME && !remote[keyOf("L", entry.id)]?.v.shared);
        if (twin && !section.shared) {
            // La de siempre de este móvil se junta con la de siempre de la cuenta (si está vacía, no suma nada)
            const target = out[keyOf("L", twin.id)] ?? { shared: null, order: [] };
            out[keyOf("L", twin.id)] = { ...target, order: mergeNumberedItems(asArray<orderItem>(target.order), items) };
        } else {
            lists.push(mine);
            out[keyOf("L", mine.id)] = section;
        }
    }
    const collections = [...remoteCollections];
    for (const mine of cleanCollections(local.meta?.flists)) {
        const section = local[keyOf("F", mine.id)] ?? { items: [] };
        if (remoteCollections.some(entry => entry.id === mine.id)) {
            const target = out[keyOf("F", mine.id)] ?? { items: [] };
            out[keyOf("F", mine.id)] = mergeSection(keyOf("F", mine.id), section, target, true);
            continue;
        }
        if (mine.name === DEFAULT_FAV_NAME && asArray<listItem>(section.items).length === 0 && remoteCollections.length > 0) continue;
        const twin = remoteCollections.find(entry => entry.name === DEFAULT_FAV_NAME && mine.name === DEFAULT_FAV_NAME);
        if (twin) {
            const target = out[keyOf("F", twin.id)] ?? { items: [] };
            out[keyOf("F", twin.id)] = { items: mergeFavorites(asArray<listItem>(target.items), asArray<listItem>(section.items)).items };
        } else {
            collections.push(mine);
            out[keyOf("F", mine.id)] = section;
        }
    }
    const localMeta = local.meta ?? {};
    out.meta = {
        lists,
        pinned: remoteMeta.pinned ?? null,
        flists: collections,
        fpinned: remoteMeta.fpinned ?? null,
        name: remoteMeta.name ?? localMeta.name ?? null,
        zone: remoteMeta.zone ?? localMeta.zone ?? null,
        wh: remoteMeta.wh ?? localMeta.wh ?? null,
        gone: isObject(remoteMeta.gone) ? remoteMeta.gone : {},
    };
    return out;
}

// ---------- Servidor ----------

async function call(body: unknown): Promise<Record<string, unknown>> {
    let response: Response;
    try {
        response = await fetch("/api/cuenta", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(body),
            cache: "no-store",
            credentials: "same-origin",
        });
    } catch {
        throw new AccountError(0, "offline");
    }
    let data: unknown = null;
    try {
        data = await response.json();
    } catch {
        // respuesta cortada o sin JSON (p. ej. la función no existe en desarrollo)
    }
    const record = isObject(data) ? data : {};
    if (!response.ok) throw new AccountError(response.status, typeof record.error === "string" ? record.error : "error");
    if (!record.ok) throw new AccountError(502, "bad_response");
    return record;
}

export async function fetchAccountConfig(): Promise<{ configured: boolean, clientId: string | null }> {
    try {
        const response = await fetch("/api/cuenta", { cache: "no-store" });
        const data: unknown = await response.json();
        if (isObject(data) && data.ok && data.configured === true && typeof data.clientId === "string") return { configured: true, clientId: data.clientId };
    } catch {
        // sin función o sin conexión: la cuenta no se ofrece
    }
    return { configured: false, clientId: null };
}

// ---------- Entrar con Google (por redirección) ----------

function randomHex(bytes: number): string {
    const data = new Uint8Array(bytes);
    crypto.getRandomValues(data);
    return Array.from(data, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function startGoogleLogin(clientId: string) {
    const nonce = randomHex(16);
    try {
        localStorage.setItem(NONCE_KEY, nonce);
    } catch {
        throw new AccountError(0, "storage");
    }
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: `${location.origin}/`,
        response_type: "id_token",
        scope: "openid email profile",
        nonce,
        prompt: "select_account",
    });
    location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

// Al volver de Google, el token viene en la dirección (#id_token=…): se lee y se quita enseguida
export function takeGoogleResult(): { credential: string } | { error: string } | null {
    if (!location.hash.startsWith("#id_token=") && !location.hash.startsWith("#error=")) return null;
    const params = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, "", location.pathname + location.search);
    const credential = params.get("id_token");
    if (credential) return { credential };
    return { error: params.get("error") || "error" };
}

// Borra los datos de la persona de este móvil (no la caché de Mercadona)
export function wipeLocalData() {
    const doomed: string[] = ["lists:v1", "favlists:v1", "order", "favorites", "shared-list:v1", NAME_KEY, ZONE_KEY, WAREHOUSE_KEY, HISTORY_KEY];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (/^L:[a-f0-9]{16}:(order|shared)$/.test(key) || /^F:[a-f0-9]{16}:items$/.test(key))) doomed.push(key);
        }
    } catch {
        // sin almacenamiento
    }
    for (const key of doomed) removeKey(key);
}

// Completa la entrada: comprueba el token en el servidor y deja la cuenta guardada en este móvil.
// Devuelve true si se han borrado datos de otra cuenta (la página hay que recargarla).
export async function finishLogin(credential: string): Promise<boolean> {
    const nonce = readRaw(NONCE_KEY);
    removeKey(NONCE_KEY);
    if (!nonce) throw new AccountError(401, "no_nonce");
    const result = await call({ op: "login", credential, nonce });
    const uid = String(result.uid ?? "");
    if (!uid) throw new AccountError(502, "bad_response");
    // Si en este móvil estaban los datos de OTRA cuenta, no se mezclan con los de esta persona
    const previous = readRaw(LAST_KEY);
    let wiped = false;
    if (previous && previous !== uid) {
        wipeLocalData();
        wiped = true;
    }
    saveImportant(LAST_KEY, uid);
    const old = loadAccount();
    if (old && old.uid === uid) {
        // La misma cuenta que la última vez (la sesión había caducado): se sigue desde donde se quedó
        saveAccount({ ...old, email: typeof result.email === "string" ? result.email : old.email, name: typeof result.name === "string" ? result.name : old.name, signedOut: undefined });
        return wiped;
    }
    saveAccount({
        uid,
        email: typeof result.email === "string" ? result.email : "",
        name: typeof result.name === "string" ? result.name : "",
        rev: 0, hashes: {}, gone: {}, pending: {}, linked: false,
    });
    return wiped;
}

// ---------- Salir y borrar ----------

export async function signOut(wipe: boolean) {
    try {
        await call({ op: "logout" });
    } catch {
        // sin conexión: la sesión caduca sola; en este móvil se sale igualmente
    }
    removeKey(ACCOUNT_KEY);
    if (wipe) {
        wipeLocalData();
        removeKey(LAST_KEY);
    }
}

export async function deleteAccountData() {
    await call({ op: "delete" });
    removeKey(ACCOUNT_KEY);
    removeKey(LAST_KEY);
}

// ---------- Sincronizar ----------

export type SyncState = "off" | "idle" | "syncing" | "ok" | "offline" | "error" | "signedout";
let state: SyncState = loadAccount() ? "idle" : "off";
const listeners = new Set<() => void>();
export const getSyncState = () => state;
export function onSyncState(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
function setState(next: SyncState) {
    if (state === next) return;
    state = next;
    listeners.forEach(listener => listener());
}
export const resetSyncState = () => setState(loadAccount() ? "idle" : "off");

export const hasPendingRemote = () => Object.keys(loadAccount()?.pending ?? {}).length > 0;

let running = false;
let again: "apply" | "push" | null = null;

// mode "push": solo sube (nunca toca lo que la app tiene en pantalla); lo que llega se guarda aparte.
// mode "apply": además aplica lo que llegó de otros móviles. Devuelve true si hay que recargar la página.
export async function syncNow(mode: "apply" | "push"): Promise<boolean> {
    if (running) {
        again = again === "apply" || mode === "apply" ? "apply" : "push";
        return false;
    }
    running = true;
    let reload = false;
    try {
        for (let pass = 0; pass < 4; pass++) {
            const account = loadAccount();
            if (!account || account.signedOut) {
                setState(account ? "signedout" : "off");
                return false;
            }
            setState("syncing");
            let local = exportSections(account.gone);

            if (!account.linked) {
                // Primera vez con esta cuenta en este móvil: se baja lo que hubiera y se junta con lo de aquí
                const first = await call({ op: "sync", since: 0 });
                const remote: Remote = {};
                for (const entry of asArray<{ key: string, r: number, v: Section }>(first.changed)) remote[entry.key] = { r: entry.r, v: entry.v };
                account.rev = Number(first.rev) || 0;
                if (remote.meta) {
                    if (mode === "push") {
                        // La unión cambia lo que la app tiene en pantalla: espera a un momento seguro
                        account.pending = remote;
                        saveAccount(account);
                        setState("idle");
                        return false;
                    }
                    writeSections(linkSections(local, remote));
                    account.hashes = Object.fromEntries(Object.entries(remote).map(([key, entry]) => [key, hashOf(entry.v)]));
                    reload = true;
                }
                account.linked = true;
                account.pending = {};
                saveAccount(account);
                continue;
            }

            // Lo borrado aquí desde la última vez se anota para borrarlo también en los demás móviles
            const now = Date.now();
            const gone = { ...account.gone };
            const del: string[] = [];
            for (const key of Object.keys(account.hashes)) {
                if ((key.startsWith("L:") || key.startsWith("F:")) && !(key in local)) {
                    gone[key] = now;
                    del.push(key);
                }
            }
            for (const [key, when] of Object.entries(gone)) if (now - when > GONE_DAYS * 86_400_000) delete gone[key];
            if (del.length) {
                account.gone = gone;
                local = exportSections(gone);
            }
            const pendingKeys = new Set(Object.keys(account.pending));
            if (mode === "push" && pendingKeys.size && !del.length) {
                // Hay cosas de otros móviles sin aplicar: no se sube nada hasta aplicarlas (se pisarían)
                setState("idle");
                return false;
            }
            const current = hashesOf(local);
            const dirty = Object.keys(current).filter(key => current[key] !== account.hashes[key] && !pendingKeys.has(key));
            const result = await call({
                op: "sync",
                since: account.rev,
                push: dirty.map(key => ({ key, v: local[key] })),
                del,
            });

            account.rev = Number(result.rev) || account.rev;
            const accepted = new Set(asArray<string>(result.accepted));
            const conflicts = new Set(asArray<string>(result.conflicts));
            for (const key of accepted) account.hashes[key] = current[key];
            for (const key of del) delete account.hashes[key];
            account.gone = gone;
            const incoming: Remote = { ...account.pending };
            for (const entry of asArray<{ key: string, r: number, v: Section }>(result.changed)) incoming[entry.key] = { r: entry.r, v: entry.v };

            if (mode === "push" || Object.keys(incoming).length === 0) {
                account.pending = incoming;
                saveAccount(account);
                if (conflicts.size === 0 || mode === "push") break;
                continue;
            }

            // Momento seguro: se juntan los cambios de otros móviles con los de aquí y se guardan
            const stillDirty = new Set(Object.keys(current).filter(key => current[key] !== account.hashes[key]));
            const before = hashesOf(exportSections(account.gone));
            const merged = mergeInto(exportSections(account.gone), incoming, stillDirty);
            writeSections(merged);
            const after = exportSections(account.gone);
            const afterHashes = hashesOf(after);
            for (const key of Object.keys(incoming)) {
                if (!stillDirty.has(key)) account.hashes[key] = afterHashes[key] ?? account.hashes[key];
            }
            for (const key of Object.keys(account.hashes)) if (!(key in after)) delete account.hashes[key];
            account.pending = {};
            saveAccount(account);
            if (Object.keys(afterHashes).some(key => afterHashes[key] !== before[key]) || Object.keys(before).some(key => !(key in afterHashes))) reload = true;
            // Si queda algo por subir (lo fusionado), otra vuelta
            const remaining = Object.keys(afterHashes).filter(key => afterHashes[key] !== account.hashes[key]);
            if (remaining.length === 0 && conflicts.size === 0) break;
        }
        setState("ok");
        return reload;
    } catch (error) {
        if (error instanceof AccountError && error.status === 401) {
            const account = loadAccount();
            if (account) saveAccount({ ...account, signedOut: true });
            setState("signedout");
        } else if (error instanceof AccountError && error.status === 0) setState("offline");
        else setState("error");
        return false;
    } finally {
        running = false;
        const next = again;
        again = null;
        if (next && !reload) void syncNow(next);
    }
}

// ¿Esta clave del almacenamiento es de las que viajan con la cuenta?
export const isAccountKey = (key: string): boolean =>
    key === "lists:v1" || key === "favlists:v1" || key === NAME_KEY || key === ZONE_KEY || key === WAREHOUSE_KEY || key === HISTORY_KEY
    || /^L:[a-f0-9]{16}:(order|shared)$/.test(key) || /^F:[a-f0-9]{16}:items$/.test(key);
