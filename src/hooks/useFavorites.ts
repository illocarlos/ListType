import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { listItem } from "../types/types";
import {
    createCollection, deleteCollection as deleteCollectionStore, favSummary, favSummaryOf, loadFavItems,
    loadFavRegistry, mergeFavorites, renameCollection as renameCollectionStore, saveFavItems,
    setCurrentCollection, setPinnedCollection, type FavSummary,
} from "../helpers/favlists";

// Favoritos: copias de productos de Mercadona guardadas en localStorage, repartidas en colecciones
// («Mis favoritos», los de otra persona guardados aparte…). Todo lo de la app (corazón, pestaña, rebajas,
// tienda) trabaja con la colección ABIERTA; las demás solo se enseñan en la lista de colecciones.
// Se guarda la copia entera (nombre, foto, precio…) para que se vean aunque Mercadona no responda.
// También los de otras tiendas apuntados a mano (sin mercadonaId: no se actualizan solos).
export default function useFavorites() {
    // Al arrancar, con una colección fijada se empieza en ella
    const [registry, setRegistry] = useState(() => {
        const loaded = loadFavRegistry();
        return loaded.pinned && loaded.current !== loaded.pinned ? setCurrentCollection(loaded.pinned) : loaded;
    });
    // El id y los productos van juntos: así nunca se guardan los de una colección bajo el id de otra al cambiar
    const [state, setState] = useState(() => ({ id: registry.current, items: loadFavItems(registry.current) }));
    const stateRef = useRef(state);
    stateRef.current = state;
    const favorites = state.items;

    // Si el móvil está lleno, se hace sitio borrando caché de Mercadona: un favorito nunca se pierde por eso
    useEffect(() => {
        saveFavItems(state.id, state.items);
    }, [state]);

    const favoriteIds = useMemo(() => new Set(favorites.map(item => item.id)), [favorites]);

    const isFavorite = useCallback((id: number) => favoriteIds.has(id), [favoriteIds]);

    const setItems = useCallback((change: (previous: listItem[]) => listItem[]) => {
        setState(previous => {
            const items = change(previous.items);
            return items === previous.items ? previous : { id: previous.id, items };
        });
    }, []);

    const toggleFavorite = useCallback((item: listItem) => {
        setItems(previous => previous.some(favorite => favorite.id === item.id)
            ? previous.filter(favorite => favorite.id !== item.id)
            : [...previous, item]);
    }, [setItems]);

    // Deshacer: vuelve a poner un favorito quitado en el sitio donde estaba
    const restoreFavorite = useCallback((item: listItem, index: number) => {
        setItems(previous => {
            if (previous.some(favorite => favorite.id === item.id)) return previous;
            const next = [...previous];
            next.splice(Math.min(Math.max(index, 0), next.length), 0, item);
            return next;
        });
    }, [setItems]);

    // Actualiza precio, foto o formato de un favorito con datos más recientes de Mercadona
    const refreshFavorites = useCallback((fresh: Map<number, listItem>) => {
        setItems(previous => {
            let changed = false;
            const next = previous.map(favorite => {
                const update = fresh.get(favorite.id);
                if (!update) return favorite;
                if (update.price === favorite.price && update.image === favorite.image
                    && update.packaging === favorite.packaging && update.unitPrice === favorite.unitPrice
                    && update.name === favorite.name && update.isNew === favorite.isNew) return favorite;
                changed = true;
                return { ...favorite, ...update };
            });
            return changed ? next : previous;
        });
    }, [setItems]);

    // ---------- Varias colecciones ----------

    // Cambia de colección: antes de soltar la actual se guarda lo que tiene
    const openCollection = useCallback((id: string) => {
        const { id: from, items } = stateRef.current;
        if (id === from) return;
        saveFavItems(from, items);
        const next = setCurrentCollection(id);
        setRegistry(next);
        setState({ id: next.current, items: loadFavItems(next.current) });
    }, []);

    // Crea una colección (con productos si vienen) y la abre
    const newCollection = useCallback((name: string, items: listItem[] = []) => {
        const { id: from, items: mine } = stateRef.current;
        saveFavItems(from, mine);
        const next = createCollection(name, items);
        setRegistry(next);
        setState({ id: next.current, items: loadFavItems(next.current) });
        return next.current;
    }, []);

    const pinCollection = useCallback((id: string | null) => setRegistry(setPinnedCollection(id)), []);

    const renameCollection = useCallback((id: string, name: string) => setRegistry(renameCollectionStore(id, name)), []);

    const deleteCollection = useCallback((id: string) => {
        const next = deleteCollectionStore(id);
        setRegistry(next);
        if (id === stateRef.current.id) setState({ id: next.current, items: loadFavItems(next.current) });
    }, []);

    // Une los favoritos de otra persona con los de la colección abierta: se añaden los que me faltan
    const mergeIntoCurrent = useCallback((incoming: listItem[]): number => {
        const { added } = mergeFavorites(stateRef.current.items, incoming);
        if (added) setItems(previous => mergeFavorites(previous, incoming).items);
        return added;
    }, [setItems]);

    // Resúmenes para la lista de colecciones; la abierta usa lo que hay en memoria, las demás lo guardado
    const summaries = useCallback((): FavSummary[] => registry.lists.map(meta => meta.id === state.id
        ? favSummaryOf(meta, state.items)
        : favSummary(meta)), [registry.lists, state]);

    const currentMeta = registry.lists.find(meta => meta.id === state.id) ?? registry.lists[0];

    return {
        favorites, isFavorite, toggleFavorite, restoreFavorite, refreshFavorites,
        collections: registry.lists,
        currentCollectionId: state.id,
        currentCollectionName: currentMeta.name,
        pinnedCollectionId: registry.pinned,
        openCollection, newCollection, pinCollection, renameCollection, deleteCollection,
        mergeIntoCurrent, summaries,
    };
}
