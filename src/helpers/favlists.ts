import type { listItem } from "../types/types";
import { saveImportant } from "./mercadona";

// Varias colecciones de favoritos (como las varias listas de la compra): "Mis favoritos", los que te comparte
// otra persona y guardas aparte, etc. Cada colección tiene un id local (solo de este móvil), un nombre y sus
// productos en su propia clave. Antes había una sola colección (clave "favorites"); al abrir la app nueva
// pasa a ser la primera, sin perder nada.

const REGISTRY_KEY = "favlists:v1";
const OLD_KEY = "favorites";
const itemsKey = (id: string) => `F:${id}:items`;

export type FavMeta = { id: string, name: string };
// pinned: la colección "fijada" (opcional): al tocar «Favoritos» se abre directamente, sin pasar por la lista de colecciones
export type FavRegistry = { current: string, pinned: string | null, lists: FavMeta[] };

export const DEFAULT_FAV_NAME = "Mis favoritos";
export const MAX_COLLECTIONS = 20;
export const cleanFavName = (text: string) => text.trim().replace(/\s+/g, " ").slice(0, 40);

function newLocalId(): string {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

function readJson(key: string): unknown {
    try {
        return JSON.parse(localStorage.getItem(key) || "null");
    } catch {
        return null;
    }
}

function remove(key: string) {
    try {
        localStorage.removeItem(key);
    } catch {
        // nada que borrar
    }
}

// Lo guardado (o recibido) se comprueba por si acaso: un producto sin id, nombre o precio válidos no entra
const isItem = (value: unknown): value is listItem => {
    if (!value || typeof value !== "object") return false;
    const item = value as listItem;
    return typeof item.id === "number" && Number.isFinite(item.id) && typeof item.name === "string" && item.name.length > 0
        && typeof item.price === "number" && Number.isFinite(item.price);
};

const validItems = (value: unknown): listItem[] => Array.isArray(value) ? value.filter(isItem) : [];

// ---------- Registro de colecciones ----------

function writeRegistry(registry: FavRegistry) {
    saveImportant(REGISTRY_KEY, JSON.stringify(registry));
}

export function loadFavRegistry(): FavRegistry {
    const raw = readJson(REGISTRY_KEY);
    if (raw && typeof raw === "object") {
        const parsed = raw as { current?: unknown, pinned?: unknown, lists?: unknown };
        const lists = Array.isArray(parsed.lists)
            ? parsed.lists.filter((entry): entry is FavMeta => Boolean(entry) && typeof (entry as FavMeta).id === "string" && typeof (entry as FavMeta).name === "string")
            : [];
        if (lists.length) {
            const current = typeof parsed.current === "string" && lists.some(list => list.id === parsed.current) ? parsed.current : lists[0].id;
            adoptLegacy(current);
            const pinned = typeof parsed.pinned === "string" && lists.some(list => list.id === parsed.pinned) ? parsed.pinned : null;
            return { current, pinned, lists };
        }
    }
    return migrate();
}

// Puente con la versión anterior (y con la mudanza de dirección, que escribe la clave antigua): si vuelve a
// aparecer "favorites", se UNE a la colección actual (nunca se pisa) y se borra la clave antigua.
function adoptLegacy(current: string) {
    const legacy = readJson(OLD_KEY);
    if (legacy === null) return;
    const here = loadFavItems(current);
    const ids = new Set(here.map(item => item.id));
    saveImportant(itemsKey(current), JSON.stringify([...here, ...validItems(legacy).filter(item => !ids.has(item.id))]));
    remove(OLD_KEY);
}

// Los favoritos de la versión anterior pasan a ser la primera colección.
function migrate(): FavRegistry {
    const id = newLocalId();
    saveImportant(itemsKey(id), JSON.stringify(validItems(readJson(OLD_KEY))));
    remove(OLD_KEY);
    const registry: FavRegistry = { current: id, pinned: null, lists: [{ id, name: DEFAULT_FAV_NAME }] };
    writeRegistry(registry);
    return registry;
}

export function setPinnedCollection(id: string | null): FavRegistry {
    const registry = loadFavRegistry();
    const next = { ...registry, pinned: id !== null && registry.lists.some(list => list.id === id) ? id : null };
    writeRegistry(next);
    return next;
}

export function setCurrentCollection(id: string): FavRegistry {
    const registry = loadFavRegistry();
    if (!registry.lists.some(list => list.id === id)) return registry;
    const next = { ...registry, current: id };
    writeRegistry(next);
    return next;
}

// Crea una colección (con productos si vienen) y la deja como la abierta
export function createCollection(name: string, items: listItem[] = []): FavRegistry {
    const registry = loadFavRegistry();
    if (registry.lists.length >= MAX_COLLECTIONS) return registry;
    const id = newLocalId();
    saveImportant(itemsKey(id), JSON.stringify(validItems(items)));
    const next: FavRegistry = { ...registry, current: id, lists: [...registry.lists, { id, name: cleanFavName(name) || "Favoritos" }] };
    writeRegistry(next);
    return next;
}

export function renameCollection(id: string, name: string): FavRegistry {
    const registry = loadFavRegistry();
    const next = { ...registry, lists: registry.lists.map(list => list.id === id ? { ...list, name: cleanFavName(name) || list.name } : list) };
    writeRegistry(next);
    return next;
}

// Borra una colección de este móvil. Nunca deja cero: si se borra la última, queda una vacía.
export function deleteCollection(id: string): FavRegistry {
    const registry = loadFavRegistry();
    remove(itemsKey(id));
    let lists = registry.lists.filter(list => list.id !== id);
    let current = registry.current;
    if (lists.length === 0) {
        const fresh = newLocalId();
        saveImportant(itemsKey(fresh), JSON.stringify([]));
        lists = [{ id: fresh, name: DEFAULT_FAV_NAME }];
        current = fresh;
    } else if (current === id) {
        current = lists[0].id;
    }
    const next: FavRegistry = { current, pinned: registry.pinned && lists.some(list => list.id === registry.pinned) ? registry.pinned : null, lists };
    writeRegistry(next);
    return next;
}

// ---------- Productos de cada colección ----------

export const loadFavItems = (id: string): listItem[] => validItems(readJson(itemsKey(id)));

export function saveFavItems(id: string, items: listItem[]) {
    saveImportant(itemsKey(id), JSON.stringify(items));
}

// Resumen para la lista de colecciones, sin entrar: nº de productos y los primeros nombres
export type FavSummary = FavMeta & { count: number, preview: string };

export function favSummaryOf(meta: FavMeta, items: listItem[]): FavSummary {
    return { ...meta, count: items.length, preview: items.slice(0, 3).map(item => item.name).join(", ") };
}

export const favSummary = (meta: FavMeta): FavSummary => favSummaryOf(meta, loadFavItems(meta.id));

// ---------- Unir favoritos de otra persona con los míos ----------

const sameText = (a: string, b: string) => a.toLocaleLowerCase("es") === b.toLocaleLowerCase("es");

// Añade a "mine" los productos de "incoming" que no tengo. Los de Mercadona se reconocen por su id; los que
// la gente apunta a mano (cada móvil les pone un id al azar) por nombre y tienda, como al añadirlos.
// Mis productos nunca se tocan ni se reordenan: los nuevos van al final.
export function mergeFavorites(mine: listItem[], incoming: listItem[]): { items: listItem[], added: number } {
    const ids = new Set(mine.map(item => item.id));
    const manual = mine.filter(item => !item.mercadonaId);
    const added: listItem[] = [];
    for (const item of validItems(incoming)) {
        if (ids.has(item.id)) continue;
        const pool = [...manual, ...added.filter(other => !other.mercadonaId)];
        if (!item.mercadonaId && pool.some(other => sameText(other.name, item.name) && sameText(other.store ?? "", item.store ?? ""))) continue;
        ids.add(item.id);
        added.push(item);
    }
    return { items: added.length ? [...mine, ...added] : mine, added: added.length };
}
