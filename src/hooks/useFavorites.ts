import { useCallback, useEffect, useMemo, useState } from "react";
import type { listItem } from "../types/types";
import { saveImportant } from "../helpers/mercadona";

const FAVORITES_KEY = "favorites";

// Favoritos: copias de productos de Mercadona guardadas en localStorage.
// Se guarda la copia entera (nombre, foto, precio…) para que se vean aunque Mercadona no responda.
// También los de otras tiendas apuntados a mano (sin mercadonaId: no se actualizan solos).
export default function useFavorites() {
    const [favorites, setFavorites] = useState<listItem[]>(() => {
        try {
            const saved = localStorage.getItem(FAVORITES_KEY);
            const parsed = saved ? JSON.parse(saved) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    });

    // Si el móvil está lleno, se hace sitio borrando caché de Mercadona: un favorito nunca se pierde por eso
    useEffect(() => {
        saveImportant(FAVORITES_KEY, JSON.stringify(favorites));
    }, [favorites]);

    const favoriteIds = useMemo(() => new Set(favorites.map(item => item.id)), [favorites]);

    const isFavorite = useCallback((id: number) => favoriteIds.has(id), [favoriteIds]);

    const toggleFavorite = useCallback((item: listItem) => {
        setFavorites(previous => previous.some(favorite => favorite.id === item.id)
            ? previous.filter(favorite => favorite.id !== item.id)
            : [...previous, item]);
    }, []);

    // Deshacer: vuelve a poner un favorito quitado en el sitio donde estaba
    const restoreFavorite = useCallback((item: listItem, index: number) => {
        setFavorites(previous => {
            if (previous.some(favorite => favorite.id === item.id)) return previous;
            const next = [...previous];
            next.splice(Math.min(Math.max(index, 0), next.length), 0, item);
            return next;
        });
    }, []);

    // Actualiza precio, foto o formato de un favorito con datos más recientes de Mercadona
    const refreshFavorites = useCallback((fresh: Map<number, listItem>) => {
        setFavorites(previous => {
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
    }, []);

    return { favorites, isFavorite, toggleFavorite, restoreFavorite, refreshFavorites };
}
