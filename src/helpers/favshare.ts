import type { listItem } from "../types/types";
import { SyncError } from "./sync";

// Compartir favoritos: se sube una COPIA PUNTUAL (api/favoritos) y se manda el enlace «#favoritos=código».
// Quien lo abre decide si la une a sus favoritos o la guarda aparte; después no hay ninguna conexión.

export const FAV_HASH = "#favoritos=";
export const MAX_SHARED_FAVORITES = 300;
const CODE_RE = /^[A-Za-z0-9_-]{22}$/;

export type FavCopy = { name: string, from: string, items: listItem[] };

export function favShareErrorText(error: unknown): string {
    const status = error instanceof SyncError ? error.status : -1;
    const code = error instanceof SyncError ? error.code : "";
    if (code === "not_configured") return "Compartir todavía no está activado en la app.";
    if (status === 0) return "Sin conexión. Inténtalo cuando tengas internet.";
    if (status === 404) return "Ese enlace no vale o ha caducado (duran 90 días).";
    if (status === 429) return "Se ha llegado al límite gratuito por ahora. Prueba más tarde.";
    return "No se ha podido. Inténtalo otra vez en un momento.";
}

async function post(body: unknown): Promise<Record<string, unknown>> {
    let response: Response;
    try {
        response = await fetch("/api/favoritos", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(body),
            cache: "no-store",
        });
    } catch {
        throw new SyncError(0, "offline");
    }
    let data: unknown = null;
    try {
        data = await response.json();
    } catch {
        // respuesta cortada o sin JSON (p. ej. la función no existe en desarrollo)
    }
    const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
    if (!response.ok) throw new SyncError(response.status, typeof record.error === "string" ? record.error : "error");
    if (!record.ok) throw new SyncError(502, "bad_response");
    return record;
}

// De cada favorito solo viajan sus datos de producto (nunca quién lo apuntó en una lista compartida)
const wire = (item: listItem): listItem => {
    const copy = { ...item };
    delete copy.addedBy;
    return copy;
};

export async function createFavShare(name: string, from: string, items: listItem[]): Promise<string> {
    const record = await post({ op: "create", name, from, items: items.slice(0, MAX_SHARED_FAVORITES).map(wire) });
    if (typeof record.id !== "string" || !CODE_RE.test(record.id)) throw new SyncError(502, "bad_response");
    return record.id;
}

export async function fetchFavShare(code: string): Promise<FavCopy> {
    const record = await post({ op: "get", id: code });
    const items = Array.isArray(record.items)
        ? record.items.filter((item): item is listItem => Boolean(item) && typeof (item as listItem).id === "number"
            && typeof (item as listItem).name === "string" && typeof (item as listItem).price === "number")
        : [];
    return {
        name: typeof record.name === "string" ? record.name : "",
        from: typeof record.from === "string" ? record.from : "",
        items,
    };
}

// ---------- Enlaces ----------

export const favShareLink = (code: string) => `${location.origin}/${FAV_HASH}${code}`;

// Vale el enlace entero (lo que se pega desde WhatsApp) o solo el código
export function readFavCode(text: string): string | null {
    const match = text.trim().match(/#favoritos=([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])/) ?? text.trim().match(/^([A-Za-z0-9_-]{22})$/);
    return match ? match[1] : null;
}

// El enlace pegado es de una lista de la compra (no de favoritos): para avisar en vez de decir «no vale»
export const looksLikeListLink = (text: string) => /#lista=[A-Za-z0-9_-]{22}/.test(text);

// Al abrir la app por un enlace de favoritos: se lee el código y se quita de la dirección
export function takeFavoritesFromHash(): string | null {
    if (!location.hash.startsWith(FAV_HASH)) return null;
    const code = readFavCode(location.hash);
    history.replaceState(null, "", location.pathname + location.search);
    return code;
}
