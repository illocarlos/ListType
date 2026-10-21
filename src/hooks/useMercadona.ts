import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    fetchGroups,
    getCachedProducts,
    getWarehouse,
    getZone,
    indexAllAisles,
    MercadonaError,
    normalizeText,
    resolvePostalCode,
    setWarehouse,
    ZoneError,
} from "../helpers/mercadona";
import type { IndexProgress, Zone } from "../helpers/mercadona";
import type { MercadonaGroup, MercadonaProduct } from "../types/types";

export type LoadState = "idle" | "loading" | "ready" | "error";
export type IndexState = "idle" | "running" | "done" | "stopped";

export type SearchableProduct = MercadonaProduct & { searchName: string };

const errorMessage = (error: unknown) =>
    error instanceof MercadonaError ? error.message : "No se ha podido cargar el catálogo de Mercadona.";

// Estado del catálogo de Mercadona: pasillos, carga completa para el buscador y almacén
export default function useMercadona() {
    const [wh, setWh] = useState<string>(() => getWarehouse());

    const [groups, setGroups] = useState<MercadonaGroup[]>([]);
    const [groupsState, setGroupsState] = useState<LoadState>("idle");
    const [groupsError, setGroupsError] = useState<string>("");

    const [pool, setPool] = useState<Map<string, MercadonaProduct>>(() => new Map());
    const [indexState, setIndexState] = useState<IndexState>("idle");
    const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null);
    const [wantIndex, setWantIndex] = useState<boolean>(false);
    const runRef = useRef<number>(0);

    const loadGroups = useCallback(async (force = false) => {
        setGroupsState("loading");
        try {
            setGroups(await fetchGroups(wh, force));
            setGroupsState("ready");
        } catch (error) {
            setGroupsError(errorMessage(error));
            setGroupsState("error");
        }
    }, [wh]);

    useEffect(() => {
        loadGroups();
    }, [loadGroups]);

    // Productos ya guardados en caché: el buscador funciona al instante con lo que haya
    useEffect(() => {
        setPool(new Map(getCachedProducts(wh).map(product => [product.mercadonaId, product])));
    }, [wh]);

    useEffect(() => () => {
        runRef.current++;
    }, []);

    const startIndex = useCallback(() => {
        const run = ++runRef.current;
        setIndexState("running");
        indexAllAisles(
            wh,
            groups,
            loaded => setPool(previous => {
                const next = new Map(previous);
                for (const product of loaded) next.set(product.mercadonaId, product);
                return next;
            }),
            progress => {
                if (runRef.current === run) setIndexProgress(progress);
            },
            () => runRef.current !== run
        ).then(result => {
            if (runRef.current !== run) return;
            setIndexState(result.done === result.total && result.failed === 0 ? "done" : "stopped");
        });
    }, [wh, groups]);

    // Carga completa del catálogo: se pide al enfocar o escribir en el buscador
    const ensureIndex = useCallback(() => setWantIndex(true), []);

    useEffect(() => {
        if (wantIndex && groupsState === "ready" && indexState === "idle") startIndex();
    }, [wantIndex, groupsState, indexState, startIndex]);

    const retry = useCallback(() => {
        if (groupsState === "error") {
            loadGroups(true);
            setIndexState("idle");
        } else {
            startIndex();
        }
    }, [groupsState, loadGroups, startIndex]);

    const [zone, setZone] = useState<Zone | null>(() => getZone());

    const applyWarehouse = useCallback((code: string) => {
        if (!setWarehouse(code)) return;
        runRef.current++;
        setIndexState("idle");
        setIndexProgress(null);
        setWh(code.trim().toLowerCase());
    }, []);

    // El usuario escribe su código postal; la app averigua el almacén y recarga los precios de su zona.
    // Devuelve el mensaje de error para enseñarlo, o null si ha ido bien.
    const changePostalCode = useCallback(async (postalCode: string): Promise<string | null> => {
        try {
            const resolved = await resolvePostalCode(postalCode);
            setZone(resolved);
            applyWarehouse(resolved.wh);
            return null;
        } catch (error) {
            return error instanceof ZoneError ? error.message : "No se ha podido comprobar el código postal.";
        }
    }, [applyWarehouse]);

    // Lista preparada para buscar: nombre normalizado una sola vez
    const searchable = useMemo<SearchableProduct[]>(
        () => [...pool.values()].map(product => ({ ...product, searchName: normalizeText(product.name) })),
        [pool]
    );

    return {
        wh,
        zone,
        changePostalCode,
        groups,
        groupsState,
        groupsError,
        loadGroups,
        searchable,
        indexState,
        indexProgress,
        ensureIndex,
        retry,
    };
}
