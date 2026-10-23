import type { listItem, orderItem } from "../types/types";
import { applyOps, sortByAdded, wireItem, type ListOp } from "./listOps";

// ---------- Lista compartida entre varios móviles ----------
// El servidor (api/lista.js) guarda la lista; cada móvil guarda una copia y los cambios que aún no ha enviado.
// Lo que se ve = la última lista del servidor + los cambios pendientes de este móvil (así se ve al momento,
// aunque no haya cobertura). Los cambios se envían en lotes y la lista se consulta solo con la app a la vista.

export const SHARE_HASH = "#lista=";
const ID_RE = /^[A-Za-z0-9_-]{22}$/;
const MAX_BATCH = 50;

export type SyncStatus = "local" | "syncing" | "synced" | "offline" | "error" | "limit" | "gone";

export type SharedState = {
    id: string,
    version: number,
    base: orderItem[],
    pending: ListOp[],
    // Lote enviado y aún sin respuesta: si se reintenta, va con el mismo identificador (el servidor no lo repite)
    batch?: { id: string, count: number },
};

export class SyncError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string) {
        super(code);
        this.status = status;
        this.code = code;
    }
}

// Mensaje para cada fallo al compartir o unirse
export function syncErrorText(error: unknown): string {
    const status = error instanceof SyncError ? error.status : -1;
    const code = error instanceof SyncError ? error.code : "";
    if (code === "not_configured") return "Compartir todavía no está activado en la app.";
    if (status === 0) return "Sin conexión. Inténtalo cuando tengas internet.";
    if (status === 404) return "Ese enlace no vale o la lista ya no existe.";
    if (status === 429) return "Se ha llegado al límite gratuito de este mes. Prueba más tarde.";
    return "No se ha podido. Inténtalo otra vez en un momento.";
}

// ---------- Servidor ----------

type ServerList = { version: number, items: orderItem[], unchanged?: boolean, id?: string };

async function post(body: unknown): Promise<ServerList> {
    let response: Response;
    try {
        response = await fetch("/api/lista", {
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
    return {
        version: Number(record.version) || 0,
        items: Array.isArray(record.items) ? cleanItems(record.items) : [],
        unchanged: record.unchanged === true,
        id: typeof record.id === "string" && ID_RE.test(record.id) ? record.id : undefined,
    };
}

function cleanItems(items: unknown[]): orderItem[] {
    const out: orderItem[] = [];
    for (const raw of items) {
        if (!raw || typeof raw !== "object") continue;
        const item = raw as orderItem;
        if (typeof item.id !== "number" || typeof item.name !== "string") continue;
        out.push({
            ...wireItem({ ...item, type: typeof item.type === "string" ? item.type : "", price: Number(item.price) || 0 }),
            quantity: Math.max(1, Math.min(999, Number(item.quantity) || 1)),
            done: item.done === true || undefined,
        });
    }
    return sortByAdded(out);
}

const wireOp = (op: ListOp): ListOp => {
    if (op.op === "add") return { op: "add", item: wireItem(op.item) };
    if (op.op === "restore") return { op: "restore", items: op.items.map(item => ({ ...wireItem(item), quantity: item.quantity, done: item.done })) };
    return op;
};

export const pingShared = () => post({ op: "ping" });

export async function createShared(order: orderItem[]): Promise<{ id: string, version: number, items: orderItem[] }> {
    const result = await post({ op: "create", items: order.map(item => ({ ...wireItem(item), quantity: item.quantity, done: item.done })) });
    if (!result.id) throw new SyncError(502, "bad_response");
    return { id: result.id, version: result.version, items: result.items };
}

export const fetchShared = (id: string, version = 0) => post({ op: "get", id, v: version });

function randomId(): string {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------- Enlaces ----------

export const shareLink = (id: string) => `${location.origin}/${SHARE_HASH}${id}`;

// Vale el enlace entero (lo que se pega desde WhatsApp) o solo el código
export function readShareCode(text: string): string | null {
    const match = text.trim().match(/#lista=([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])/) ?? text.trim().match(/^([A-Za-z0-9_-]{22})$/);
    return match ? match[1] : null;
}

// Al abrir la app por un enlace de invitación: se lee el código y se quita de la dirección
export function takeShareFromHash(): string | null {
    if (!location.hash.startsWith(SHARE_HASH)) return null;
    const code = readShareCode(location.hash);
    history.replaceState(null, "", location.pathname + location.search);
    return code;
}

// ---------- Almacenamiento en el móvil ----------

// Comprueba lo guardado de una lista compartida (lo escribe la propia app, pero por si acaso)
export function parseSharedState(raw: unknown): SharedState | null {
    if (!raw || typeof raw !== "object") return null;
    const parsed = raw as Record<string, unknown>;
    if (typeof parsed.id !== "string" || !ID_RE.test(parsed.id)) return null;
    return {
        id: parsed.id,
        version: Number(parsed.version) || 0,
        base: Array.isArray(parsed.base) ? parsed.base as orderItem[] : [],
        pending: Array.isArray(parsed.pending) ? parsed.pending as ListOp[] : [],
        batch: parsed.batch && typeof (parsed.batch as { id?: unknown }).id === "string" ? parsed.batch as { id: string, count: number } : undefined,
    };
}

// ---------- Motor de sincronización ----------

// Cada cuánto se pregunta "¿ha cambiado algo?" con la app a la vista, según el rato sin actividad.
// Recién tocada (o recién cambiada por otro): cada 4 s; luego cada 10 s, 30 s y, tras media hora, cada minuto.
// En segundo plano no se pregunta nada. Así un móvil olvidado con la app abierta gasta poco.
export function pollInterval(idleMs: number): number {
    if (idleMs < 60_000) return 4_000;
    if (idleMs < 5 * 60_000) return 10_000;
    if (idleMs < 30 * 60_000) return 30_000;
    return 60_000;
}

type EngineEvents = {
    onOrder: (order: orderItem[]) => void,
    onStatus: (status: SyncStatus, detail?: { lastSync?: number }) => void,
    // Guarda el estado de la lista compartida (la capa de listas decide bajo qué clave)
    onPersist: (state: SharedState) => void,
};

export class SyncEngine {
    private state: SharedState;
    private events: EngineEvents;
    private busy = false;
    private stopped = false;
    private timer: number | null = null;
    private flushTimer: number | null = null;
    private retryDelay = 0;
    private lastActivity = Date.now();
    private readonly onVisible = () => {
        if (document.visibilityState === "visible") this.tick(true);
    };
    private readonly onOnline = () => this.tick(true);

    constructor(state: SharedState, events: EngineEvents) {
        this.state = state;
        this.events = events;
        this.events.onPersist(this.state);
        document.addEventListener("visibilitychange", this.onVisible);
        window.addEventListener("online", this.onOnline);
        this.emit();
        this.tick(true);
    }

    get id() {
        return this.state.id;
    }

    // Lo que se ve: la última lista del servidor con los cambios aún sin enviar encima
    view(): orderItem[] {
        return applyOps(this.state.base, this.state.pending);
    }

    private emit() {
        this.events.onOrder(this.view());
    }

    private persist() {
        this.events.onPersist(this.state);
    }

    push(op: ListOp) {
        if (this.stopped) return;
        this.state.pending.push(op);
        this.lastActivity = Date.now();
        this.persist();
        this.emit();
        // Pequeña espera: varios toques seguidos (+ + +) salen en un solo envío
        if (this.flushTimer !== null) window.clearTimeout(this.flushTimer);
        this.flushTimer = window.setTimeout(() => {
            this.flushTimer = null;
            this.tick(true);
        }, 400);
    }

    // Precios y fotos nuevos de Mercadona: solo en este móvil (no es un cambio de la lista)
    refreshBase(fresh: Map<number, listItem>) {
        let changed = false;
        this.state.base = this.state.base.map(item => {
            const update = fresh.get(item.id);
            if (!update || (update.price === item.price && update.image === item.image && update.packaging === item.packaging
                && update.unitPrice === item.unitPrice && update.name === item.name && update.isNew === item.isNew)) return item;
            changed = true;
            return { ...item, ...update, quantity: item.quantity, done: item.done, addedAt: item.addedAt };
        });
        if (changed) {
            this.persist();
            this.emit();
        }
    }

    stop() {
        this.stopped = true;
        if (this.timer !== null) window.clearTimeout(this.timer);
        if (this.flushTimer !== null) window.clearTimeout(this.flushTimer);
        document.removeEventListener("visibilitychange", this.onVisible);
        window.removeEventListener("online", this.onOnline);
    }

    private schedule(delay: number) {
        if (this.stopped) return;
        if (this.timer !== null) window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => this.tick(false), delay);
    }

    // now: tras un cambio, al volver a la app o al recuperar la conexión
    private async tick(now: boolean) {
        if (this.stopped) return;
        if (this.busy) {
            if (now) this.schedule(500);
            return;
        }
        const visible = document.visibilityState === "visible";
        // En segundo plano solo se envían cambios pendientes (por si se cierra la app); no se consulta
        if (!visible && this.state.pending.length === 0) return;
        this.busy = true;
        let nextDelay = pollInterval(Date.now() - this.lastActivity);
        try {
            if (this.state.pending.length > 0) {
                this.events.onStatus("syncing");
                await this.flush();
            } else {
                await this.poll();
            }
            this.retryDelay = 0;
            this.events.onStatus(this.state.pending.length ? "syncing" : "synced", { lastSync: Date.now() });
            if (this.state.pending.length) nextDelay = 0;
        } catch (error) {
            const status = error instanceof SyncError ? error.status : 0;
            if (status === 404) {
                this.gone();
                return;
            }
            if (status === 400 && this.state.pending.length) {
                // Un cambio que el servidor nunca aceptará (no debería pasar): se descarta para no atascar la cola
                const count = this.state.batch?.count ?? 1;
                this.state.pending.splice(0, count);
                this.state.batch = undefined;
                this.persist();
                this.emit();
                nextDelay = 1_000;
            } else if (status === 429) {
                // Límite del plan gratis: se deja tranquilo un buen rato; la lista sigue en el móvil
                this.events.onStatus("limit");
                nextDelay = 10 * 60_000;
            } else {
                this.events.onStatus(status === 0 ? "offline" : "error");
                this.retryDelay = Math.min(60_000, Math.max(5_000, this.retryDelay * 2));
                nextDelay = this.retryDelay;
            }
        } finally {
            this.busy = false;
        }
        if (!this.stopped) this.schedule(nextDelay);
    }

    private async flush() {
        const batch = this.state.batch ?? { id: randomId(), count: Math.min(MAX_BATCH, this.state.pending.length) };
        this.state.batch = batch;
        this.persist();
        const ops = this.state.pending.slice(0, batch.count).map(wireOp);
        const result = await post({ op: "apply", id: this.state.id, batch: batch.id, ops });
        if (this.stopped) return;
        this.state.pending.splice(0, batch.count);
        this.state.batch = undefined;
        this.state.base = result.items;
        this.state.version = result.version;
        this.persist();
        this.emit();
    }

    private async poll() {
        const result = await fetchShared(this.state.id, this.state.version);
        if (this.stopped || result.unchanged) return;
        // Ha cambiado en otro móvil: se pinta y se pregunta más a menudo un rato
        if (this.state.pending.length === 0) {
            this.state.base = result.items;
            this.state.version = result.version;
            this.lastActivity = Date.now();
            this.persist();
            this.emit();
        }
    }

    private gone() {
        // La lista ya no existe en el servidor (caducó tras 90 días sin cambios o se perdió):
        // se deja de compartir y lo que se ve se queda en este móvil
        const view = this.view();
        this.stop();
        this.events.onOrder(view);
        this.events.onStatus("gone");
    }
}

// Datos para empezar a sincronizar una lista recién creada o a la que uno se une
export function newSharedState(id: string, version: number, base: orderItem[], pending: ListOp[] = []): SharedState {
    return { id, version, base, pending };
}
