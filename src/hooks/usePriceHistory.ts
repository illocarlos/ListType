import { useCallback, useEffect, useState } from "react";
import type { listItem } from "../types/types";
import { saveImportant } from "../helpers/mercadona";

const HISTORY_KEY = "price-history:v1";
const MAX_POINTS = 24;

export type PricePoint = { d: number, p: number };
type History = Record<string, PricePoint[]>;

const today = () => Math.floor(Date.now() / 86_400_000);

function readHistory(): History {
    try {
        const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "{}");
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as History : {};
    } catch {
        return {};
    }
}

// Historial de precios de los favoritos, guardado solo en el móvil.
// Se apunta un punto cada vez que el precio de un favorito cambia (la app ya los actualiza sola).
// Va por zona (almacén): al cambiar de código postal los precios son otros, y eso no es "ha subido".
const entryKey = (wh: string, mercadonaId: string) => `${wh}|${mercadonaId}`;

export default function usePriceHistory(favorites: listItem[], wh: string) {
    const [history, setHistory] = useState<History>(readHistory);

    useEffect(() => {
        setHistory(previous => {
            let changed = false;
            const next: History = { ...previous };
            for (const favorite of favorites) {
                if (!favorite.mercadonaId || !(favorite.price > 0)) continue;
                const key = entryKey(wh, favorite.mercadonaId);
                const points = next[key] ?? [];
                const last = points[points.length - 1];
                if (last && Math.abs(last.p - favorite.price) < 0.005) continue;
                next[key] = [...points, { d: today(), p: favorite.price }].slice(-MAX_POINTS);
                changed = true;
            }
            if (!changed) return previous;
            // Si no cabe, se hace sitio borrando caché de Mercadona; si ni así, se mantiene en memoria
            saveImportant(HISTORY_KEY, JSON.stringify(next));
            return next;
        });
    }, [favorites, wh]);

    const historyOf = useCallback((mercadonaId?: string): PricePoint[] => (mercadonaId ? history[entryKey(wh, mercadonaId)] ?? [] : []), [history, wh]);

    // "Ha subido un 12 % desde que lo guardaste" (o bajado), o vacío si no ha cambiado
    const changeNote = useCallback((item: listItem): { text: string, direction: "up" | "down" } | null => {
        const points = item.mercadonaId ? history[entryKey(wh, item.mercadonaId)] : undefined;
        if (!points || points.length < 2 || !(item.price > 0)) return null;
        const first = points[0].p;
        const change = Math.round(((item.price - first) / first) * 100);
        if (change === 0) return null;
        return change > 0
            ? { text: `Ha subido un ${change} % desde que lo guardaste`, direction: "up" }
            : { text: `Ha bajado un ${Math.abs(change)} % desde que lo guardaste`, direction: "down" };
    }, [history, wh]);

    return { historyOf, changeNote };
}
