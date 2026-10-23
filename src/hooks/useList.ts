import { useCallback, useEffect, useRef, useState } from "react";
import { listItem, orderItem } from "../types/types";
import { saveImportant } from "../helpers/mercadona";
import { applyOp, applyOps, withAddedAt, type ListOp } from "../helpers/listOps";
import { createShared, fetchShared, loadShared, newSharedState, stopSharing, SyncEngine, type SyncStatus } from "../helpers/sync";

// Si no hay espacio se borra caché de Mercadona (la más antigua primero): la lista siempre tiene prioridad.
// Sin espacio ni así: se mantiene en memoria hasta el siguiente cambio.
function saveOrder(order: orderItem[]) {
    saveImportant("order", JSON.stringify(order));
}

export type JoinMode = "merge" | "replace";

export default function useList() {

    // Inicializar el estado order con lo guardado en localStorage (o vacío)
    const [order, setOrder] = useState<orderItem[]>(() => {
        try {
            const savedOrder = localStorage.getItem("order");
            const parsed = savedOrder ? JSON.parse(savedOrder) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    });

    // Lista compartida: el motor envía los cambios y trae los de los demás móviles
    const engineRef = useRef<SyncEngine | null>(null);
    const [sharedListId, setSharedListId] = useState<string | null>(() => loadShared()?.id ?? null);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => loadShared() ? "syncing" : "local");
    const [lastSync, setLastSync] = useState<number | null>(null);

    const startEngine = useCallback((state: ReturnType<typeof newSharedState>) => {
        engineRef.current?.stop();
        setSharedListId(state.id);
        setSyncStatus("syncing");
        engineRef.current = new SyncEngine(state, {
            onOrder: setOrder,
            onStatus: (status, detail) => {
                setSyncStatus(status);
                if (detail?.lastSync) setLastSync(detail.lastSync);
                if (status === "gone") {
                    engineRef.current = null;
                    setSharedListId(null);
                }
            },
        });
    }, []);

    useEffect(() => {
        const saved = loadShared();
        if (saved) startEngine(saved);
        return () => {
            engineRef.current?.stop();
            engineRef.current = null;
        };
    }, [startEngine]);

    // Guardar order en localStorage cada vez que cambie
    useEffect(() => {
        saveOrder(order);
    }, [order]);

    // Todos los cambios pasan por aquí: en una lista compartida se envían; si no, solo cambian el móvil
    const change = useCallback((op: ListOp) => {
        if (engineRef.current) engineRef.current.push(op);
        else setOrder(previous => applyOp(previous, op));
    }, []);

    const addItem = useCallback((item: listItem) => change({ op: "add", item }), [change]);
    const decreaseItem = useCallback((id: listItem['id']) => change({ op: "dec", id }), [change]);
    const removeItem = useCallback((id: listItem['id']) => change({ op: "remove", id }), [change]);
    // En la tienda: tachar lo que ya está en el carro (y destacharlo)
    const setDone = useCallback((id: listItem['id'], value: boolean) => change({ op: "done", id, value }), [change]);

    // Actualiza precio, foto, formato y novedad de los productos de Mercadona ya apuntados
    // con datos más recientes. La cantidad no se toca. En una lista compartida es solo de este móvil.
    const refreshOrder = useCallback((fresh: Map<number, listItem>) => {
        if (engineRef.current) {
            engineRef.current.refreshBase(fresh);
            return;
        }
        setOrder(prevOrder => {
            let changed = false;
            const next = prevOrder.map(orderItem => {
                const update = fresh.get(orderItem.id);
                if (!update) return orderItem;
                if (update.price === orderItem.price && update.image === orderItem.image
                    && update.packaging === orderItem.packaging && update.unitPrice === orderItem.unitPrice
                    && update.name === orderItem.name && update.isNew === orderItem.isNew) return orderItem;
                changed = true;
                return { ...orderItem, ...update, quantity: orderItem.quantity };
            });
            return changed ? next : prevOrder;
        });
    }, []);

    // Vaciar la lista de golpe (tras la compra) y deshacerlo: se devuelve lo que había tal cual
    const clearOrder = useCallback(() => change({ op: "clear" }), [change]);
    // Se unen por producto: vale para deshacer "Vaciar la lista" y "Quitar lo del carro"
    const restoreOrder = useCallback((items: orderItem[]) => change({ op: "restore", items }), [change]);

    // ---------- Compartir ----------

    // Crea la lista compartida con lo que ya hay en este móvil
    const share = useCallback(async () => {
        const created = await createShared(withAddedAt(order));
        startEngine(newSharedState(created.id, created.version, created.items));
        return created.id;
    }, [order, startEngine]);

    // Unirse a una lista de otro móvil. "merge": lo que solo estaba en este móvil se añade a la compartida;
    // "replace": se usa la compartida tal cual (lo de este móvil se descarta)
    const join = useCallback(async (id: string, mode: JoinMode) => {
        const remote = await fetchShared(id, 0);
        const remoteIds = new Set(remote.items.map(item => item.id));
        const onlyHere = withAddedAt(order).filter(item => !remoteIds.has(item.id));
        const pending: ListOp[] = mode === "merge" && onlyHere.length ? [{ op: "restore", items: onlyHere.slice(0, 300) }] : [];
        startEngine(newSharedState(id, remote.version, remote.items, pending));
        return applyOps(remote.items, pending).length;
    }, [order, startEngine]);

    // Deja de compartir en este móvil: la lista se queda aquí tal como está y los demás siguen con la suya
    const leave = useCallback(() => {
        engineRef.current?.stop();
        engineRef.current = null;
        stopSharing();
        setSharedListId(null);
        setSyncStatus("local");
    }, []);

    return {
        order,
        addItem,
        decreaseItem,
        removeItem,
        setDone,
        refreshOrder,
        clearOrder,
        restoreOrder,
        sharedListId,
        syncStatus,
        lastSync,
        share,
        join,
        leave,
    };
}
