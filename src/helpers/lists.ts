import type { orderItem } from "../types/types";
import { saveImportant } from "./mercadona";
import { parseSharedState, type SharedState } from "./sync";

// Varias listas de la compra (como los "tricounts" de Tricount). Cada lista tiene:
// - un id local (solo de este móvil, nunca viaja) y un nombre,
// - su copia de productos (para enseñarla en "Mis listas" sin entrar),
// - y, si está compartida, su estado de sincronización (con el id compartido, que sí viaja en el enlace).
// Antes había una sola lista (claves "order" y "shared-list:v1"); al abrir la app nueva se convierte en la
// primera de la lista de listas, sin perder nada.

const REGISTRY_KEY = "lists:v1";
const OLD_ORDER_KEY = "order";
const OLD_SHARED_KEY = "shared-list:v1";
const orderKey = (id: string) => `L:${id}:order`;
const sharedKey = (id: string) => `L:${id}:shared`;

export type ListMeta = { id: string, name: string };
export type Registry = { current: string, lists: ListMeta[] };

export const MAX_LISTS = 20;
export const cleanListName = (text: string) => text.trim().replace(/\s+/g, " ").slice(0, 40);

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

const validOrder = (value: unknown): orderItem[] => Array.isArray(value) ? value as orderItem[] : [];

// ---------- Registro de listas ----------

function writeRegistry(registry: Registry) {
    saveImportant(REGISTRY_KEY, JSON.stringify(registry));
}

// Lee el registro; la primera vez convierte la lista única anterior en la primera lista.
export function loadRegistry(): Registry {
    const raw = readJson(REGISTRY_KEY);
    if (raw && typeof raw === "object") {
        const parsed = raw as { current?: unknown, lists?: unknown };
        const lists = Array.isArray(parsed.lists)
            ? parsed.lists.filter((entry): entry is ListMeta => Boolean(entry) && typeof (entry as ListMeta).id === "string" && typeof (entry as ListMeta).name === "string")
            : [];
        if (lists.length) {
            const current = typeof parsed.current === "string" && lists.some(list => list.id === parsed.current) ? parsed.current : lists[0].id;
            adoptLegacy(current);
            return { current, lists };
        }
    }
    const registry = migrate();
    return registry;
}

// Puente con la versión anterior (y con las pruebas): si vuelve a aparecer la clave antigua "order" o
// "shared-list:v1", se mete en la lista actual y se borra la clave antigua.
function adoptLegacy(current: string) {
    const legacyOrder = readJson(OLD_ORDER_KEY);
    if (legacyOrder !== null) {
        // Se UNE a lo que ya hubiera (la mudanza de dirección escribe aquí): nunca se pisa la lista
        const here = loadListOrder(current);
        const ids = new Set(here.map(item => item.id));
        const merged = [...here, ...validOrder(legacyOrder).filter(item => !ids.has(item.id))];
        saveImportant(orderKey(current), JSON.stringify(merged));
        remove(OLD_ORDER_KEY);
    }
    const legacyShared = parseSharedState(readJson(OLD_SHARED_KEY));
    if (legacyShared) {
        saveImportant(sharedKey(current), JSON.stringify(legacyShared));
        remove(OLD_SHARED_KEY);
    }
}

// La lista y la lista compartida de la versión anterior pasan a ser la primera lista.
function migrate(): Registry {
    const id = newLocalId();
    const oldOrder = validOrder(readJson(OLD_ORDER_KEY));
    const oldShared = parseSharedState(readJson(OLD_SHARED_KEY));
    saveImportant(orderKey(id), JSON.stringify(oldOrder));
    if (oldShared) {
        saveImportant(sharedKey(id), JSON.stringify(oldShared));
        remove(OLD_SHARED_KEY);
    }
    remove(OLD_ORDER_KEY);
    const registry: Registry = { current: id, lists: [{ id, name: "La compra" }] };
    writeRegistry(registry);
    return registry;
}

export function setCurrentList(id: string): Registry {
    const registry = loadRegistry();
    if (!registry.lists.some(list => list.id === id)) return registry;
    const next = { ...registry, current: id };
    writeRegistry(next);
    return next;
}

export function createList(name: string): Registry {
    const registry = loadRegistry();
    if (registry.lists.length >= MAX_LISTS) return registry;
    const id = newLocalId();
    saveImportant(orderKey(id), JSON.stringify([]));
    const next: Registry = { current: id, lists: [...registry.lists, { id, name: cleanListName(name) || "Lista" }] };
    writeRegistry(next);
    return next;
}

export function renameList(id: string, name: string): Registry {
    const registry = loadRegistry();
    const next = { ...registry, lists: registry.lists.map(list => list.id === id ? { ...list, name: cleanListName(name) || list.name } : list) };
    writeRegistry(next);
    return next;
}

// Borra una lista de este móvil. Si estaba compartida, los demás siguen con la suya (no se borra del servidor).
// Nunca deja cero listas: si se borra la última, queda una vacía.
export function deleteList(id: string): Registry {
    const registry = loadRegistry();
    remove(orderKey(id));
    remove(sharedKey(id));
    let lists = registry.lists.filter(list => list.id !== id);
    let current = registry.current;
    if (lists.length === 0) {
        const fresh = newLocalId();
        saveImportant(orderKey(fresh), JSON.stringify([]));
        lists = [{ id: fresh, name: "La compra" }];
        current = fresh;
    } else if (current === id) {
        current = lists[0].id;
    }
    const next = { current, lists };
    writeRegistry(next);
    return next;
}

// ---------- Datos de cada lista ----------

export const loadListOrder = (id: string): orderItem[] => validOrder(readJson(orderKey(id)));

export function saveListOrder(id: string, order: orderItem[]) {
    saveImportant(orderKey(id), JSON.stringify(order));
}

export const loadListShared = (id: string): SharedState | null => parseSharedState(readJson(sharedKey(id)));

export function saveListShared(id: string, state: SharedState | null) {
    if (state) saveImportant(sharedKey(id), JSON.stringify(state));
    else remove(sharedKey(id));
}

// Resumen de cada lista para "Mis listas", sin entrar: nombre, nº de productos, total, personas y si es compartida.
export type ListSummary = ListMeta & {
    count: number,
    total: number,
    people: string[],
    shared: boolean,
};

export function listSummary(meta: ListMeta): ListSummary {
    const order = loadListOrder(meta.id);
    const people = [...new Set(order.map(item => item.addedBy).filter((name): name is string => Boolean(name)))];
    return {
        ...meta,
        count: order.length,
        total: order.reduce((sum, item) => sum + item.price * item.quantity, 0),
        people,
        shared: loadListShared(meta.id) !== null,
    };
}
