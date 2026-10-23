import { useCallback, useEffect, useRef, useState } from "react";
import { listItem, orderItem } from "../types/types";
import { saveImportant } from "../helpers/mercadona";
import { applyOp, applyOps, withAddedAt, type ListOp } from "../helpers/listOps";
import { createShared, fetchShared, newSharedState, SyncEngine, type SharedState, type SyncStatus } from "../helpers/sync";
import {
    cleanListName, createList as createListStore, deleteList as deleteListStore, listSummary,
    loadListOrder, loadListShared, loadRegistry, renameList as renameListStore, saveListOrder,
    saveListShared, setCurrentList, setPinnedList, type ListSummary,
} from "../helpers/lists";

export type JoinMode = "merge" | "replace";

// Nombre con el que este móvil firma lo que apunta en una lista compartida ("Apuntado por Ana")
const NAME_KEY = "shared-name:v1";
const loadName = (): string => {
    try {
        return (localStorage.getItem(NAME_KEY) || "").slice(0, 30);
    } catch {
        return "";
    }
};
export const cleanName = (text: string) => text.trim().replace(/\s+/g, " ").slice(0, 30);

export default function useList() {
    // Al arrancar, con una lista fijada se empieza en ella
    const [registry, setRegistry] = useState(() => {
        const loaded = loadRegistry();
        return loaded.pinned && loaded.current !== loaded.pinned ? setCurrentList(loaded.pinned) : loaded;
    });
    const currentId = registry.current;
    const currentIdRef = useRef(currentId);
    currentIdRef.current = currentId;
    const currentMeta = registry.lists.find(list => list.id === currentId) ?? registry.lists[0];

    const [order, setOrder] = useState<orderItem[]>(() => loadListOrder(currentId));
    const engineRef = useRef<SyncEngine | null>(null);
    const [sharedListId, setSharedListId] = useState<string | null>(() => loadListShared(currentId)?.id ?? null);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => loadListShared(currentId) ? "syncing" : "local");

    // Arranca el motor de una lista compartida; guarda su estado bajo la lista a la que pertenece
    const startEngine = useCallback((listId: string, state: SharedState) => {
        engineRef.current?.stop();
        setSharedListId(state.id);
        setSyncStatus("syncing");
        engineRef.current = new SyncEngine(state, {
            onOrder: setOrder,
            onPersist: next => saveListShared(listId, next),
            onStatus: (status) => {
                setSyncStatus(status);
                if (status === "gone") {
                    engineRef.current = null;
                    saveListShared(listId, null);
                    setSharedListId(null);
                }
            },
        });
    }, []);

    // Al cambiar de lista actual: para el motor anterior y engancha la nueva (compartida o solo de este móvil)
    const attach = useCallback((listId: string) => {
        engineRef.current?.stop();
        engineRef.current = null;
        const binding = loadListShared(listId);
        if (binding) {
            setOrder(applyOps(binding.base, binding.pending));
            startEngine(listId, binding);
        } else {
            setSharedListId(null);
            setSyncStatus("local");
            setOrder(loadListOrder(listId));
        }
    }, [startEngine]);

    useEffect(() => {
        attach(currentIdRef.current);
        return () => {
            engineRef.current?.stop();
            engineRef.current = null;
        };
        // Solo al montar: los cambios de lista pasan por openList, que llama a attach
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // La copia de la lista actual se guarda en su propia clave (para enseñarla en "Mis listas" sin entrar)
    useEffect(() => {
        saveListOrder(currentIdRef.current, order);
    }, [order]);

    const [myName, setMyNameState] = useState<string>(loadName);
    const nameRef = useRef<string>(myName);
    const setMyName = useCallback((text: string) => {
        const name = cleanName(text);
        nameRef.current = name;
        setMyNameState(name);
        if (name) saveImportant(NAME_KEY, name);
        else {
            try {
                localStorage.removeItem(NAME_KEY);
            } catch {
                // nada que borrar
            }
        }
    }, []);
    const signed = useCallback((items: orderItem[]) => items.map(item => item.addedBy || !nameRef.current ? item : { ...item, addedBy: nameRef.current }), []);

    // Todos los cambios pasan por aquí: en una lista compartida se envían; si no, solo cambian el móvil
    const change = useCallback((op: ListOp) => {
        if (engineRef.current) {
            const name = nameRef.current;
            engineRef.current.push(op.op === "add" && name && !op.item.addedBy ? { op: "add", item: { ...op.item, addedBy: name } } : op);
        } else setOrder(previous => applyOp(previous, op));
    }, []);

    const addItem = useCallback((item: listItem) => change({ op: "add", item }), [change]);
    const decreaseItem = useCallback((id: listItem['id']) => change({ op: "dec", id }), [change]);
    const removeItem = useCallback((id: listItem['id']) => change({ op: "remove", id }), [change]);
    const setDone = useCallback((id: listItem['id'], value: boolean) => change({ op: "done", id, value }), [change]);

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

    const clearOrder = useCallback(() => change({ op: "clear" }), [change]);
    const restoreOrder = useCallback((items: orderItem[]) => change({ op: "restore", items }), [change]);

    // ---------- Varias listas ----------

    const openList = useCallback((id: string) => {
        setRegistry(setCurrentList(id));
        attach(id);
    }, [attach]);

    const newList = useCallback((name: string) => {
        const next = createListStore(name);
        setRegistry(next);
        attach(next.current);
        return next.current;
    }, [attach]);

    const pinList = useCallback((id: string | null) => setRegistry(setPinnedList(id)), []);

    const renameList = useCallback((id: string, name: string) => setRegistry(renameListStore(id, name)), []);

    const deleteList = useCallback((id: string) => {
        const next = deleteListStore(id);
        setRegistry(next);
        if (id === currentIdRef.current) attach(next.current);
    }, [attach]);

    // Resúmenes para "Mis listas"; la lista abierta usa lo que hay en memoria, las demás lo guardado
    const summaries = useCallback((): ListSummary[] => registry.lists.map(meta => meta.id === currentIdRef.current
        ? {
            ...meta,
            count: order.length,
            total: order.reduce((sum, item) => sum + item.price * item.quantity, 0),
            people: [...new Set(order.map(item => item.addedBy).filter((name): name is string => Boolean(name)))],
            shared: sharedListId !== null,
        }
        : listSummary(meta)), [registry.lists, order, sharedListId]);

    // ---------- Compartir (la lista actual) ----------

    const share = useCallback(async () => {
        const created = await createShared(signed(withAddedAt(order)));
        startEngine(currentIdRef.current, newSharedState(created.id, created.version, created.items));
        return created.id;
    }, [order, startEngine, signed]);

    // Unirse a una lista compartida por su enlace: se añade como una lista NUEVA (como en Tricount).
    // Si ya estás en ella (otra de tus listas la tiene), solo se abre.
    const join = useCallback(async (id: string) => {
        const already = registry.lists.find(meta => loadListShared(meta.id)?.id === id);
        if (already) {
            openList(already.id);
            return loadListOrder(already.id).length;
        }
        const remote = await fetchShared(id, 0);
        const created = createListStore("Lista compartida");
        setRegistry(created);
        startEngine(created.current, newSharedState(id, remote.version, remote.items));
        return remote.items.length;
    }, [registry.lists, openList, startEngine]);

    const isJoined = useCallback((sharedIdValue: string) => registry.lists.some(meta => loadListShared(meta.id)?.id === sharedIdValue), [registry.lists]);

    const leave = useCallback(() => {
        engineRef.current?.stop();
        engineRef.current = null;
        saveListShared(currentIdRef.current, null);
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
        share,
        join,
        isJoined,
        leave,
        myName,
        setMyName,
        lists: registry.lists,
        pinnedId: registry.pinned,
        pinList,
        currentId,
        currentName: currentMeta?.name ?? "La compra",
        openList,
        newList,
        renameList,
        deleteList,
        summaries,
        cleanListName,
    };
}
