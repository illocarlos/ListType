import { Heart, Info, Minus, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { formatCurrency } from "../helpers/formatPrice";
import type { listItem } from "../types/types";
import Thumb from "./Thumb";

type ProductRowProps = {
    item: listItem,
    detail?: string,
    previousPrice?: number | null,
    quantity: number,
    onAdd: (item: listItem) => void,
    onDecrease: (item: listItem) => void,
    favorite?: boolean,
    onToggleFavorite?: (item: listItem) => void,
    // Cambio de precio desde que se guardó en favoritos
    note?: { text: string, direction: "up" | "down" } | null,
    // Abre la ficha (ingredientes, alérgenos, parecidos más baratos)
    onOpenDetails?: (item: listItem) => void,
}

// Fila de producto pensada para todo el mundo:
// nombre completo (sin cortar), textos de 14 px como mínimo, botones de 44 px y "Añadir" escrito.
const ProductRow = ({ item, detail, previousPrice, quantity, onAdd, onDecrease, favorite = false, onToggleFavorite, note, onOpenDetails }: ProductRowProps) => {
    const inList = quantity > 0;

    return (
        <li
            className={`flex gap-3 px-3 py-3 rounded-md transition-colors duration-200 ${inList ? "bg-accent-soft" : "bg-surface"}`}
        >
            <Thumb item={item} />

            <div className="min-w-0 flex-1">
                <div className="flex items-start gap-1">
                    <p className="flex-1 text-base font-semibold leading-snug break-words">
                        {item.isNew && (
                            <span className="mr-1.5 inline-block rounded-pill bg-highlight px-2 align-[2px] text-sm font-bold leading-6 text-on-highlight">
                                Novedad
                            </span>
                        )}
                        {item.name}
                    </p>
                    {onToggleFavorite && (
                        <button
                            type="button"
                            onClick={() => onToggleFavorite(item)}
                            aria-pressed={favorite}
                            aria-label={favorite ? `Quitar ${item.name} de favoritos` : `Guardar ${item.name} en favoritos`}
                            className={`flex-none -mt-2 -mr-2 h-11 w-11 grid place-items-center rounded-full ${favorite ? "text-danger" : "text-muted hover:text-danger"}`}
                        >
                            <Heart size={22} aria-hidden="true" fill={favorite ? "currentColor" : "none"} />
                        </button>
                    )}
                </div>

                {detail && <p className="text-sm text-muted break-words">{detail}</p>}

                {note && (
                    <p className={`mt-1 flex items-center gap-1.5 text-sm font-semibold ${note.direction === "up" ? "text-danger" : "text-accent-strong"}`}>
                        {note.direction === "up"
                            ? <TrendingUp size={18} aria-hidden="true" className="flex-none" />
                            : <TrendingDown size={18} aria-hidden="true" className="flex-none" />}
                        {note.text}
                    </p>
                )}

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="tabular">
                        {item.price > 0 && <span className="text-base font-bold">{formatCurrency(item.price)}</span>}
                        {previousPrice ? (
                            <span className="ml-2 text-sm text-muted">
                                <span className="sr-only">antes </span>
                                <span className="line-through">{formatCurrency(previousPrice)}</span>
                            </span>
                        ) : null}
                    </p>

                    <div className="flex items-center gap-1">
                    {onOpenDetails && item.mercadonaId && (
                        <button
                            type="button"
                            onClick={() => onOpenDetails(item)}
                            className="h-11 px-3 inline-flex items-center gap-1 rounded-pill text-base font-semibold text-accent-strong hover:bg-surface-sunk"
                        >
                            <Info size={18} aria-hidden="true" />
                            Ficha<span className="sr-only"> de {item.name}</span>
                        </button>
                    )}

                    {inList ? (
                        <div className="flex items-center rounded-pill bg-surface border border-border">
                            <button
                                type="button"
                                onClick={() => onDecrease(item)}
                                aria-label={quantity === 1 ? `Quitar ${item.name} de la lista` : `Quitar una unidad de ${item.name}`}
                                className="h-11 w-11 grid place-items-center rounded-full text-accent-strong hover:bg-surface-sunk"
                            >
                                <Minus size={20} aria-hidden="true" />
                            </button>
                            <span className="min-w-[1.75rem] text-center text-lg font-bold tabular">
                                {quantity}
                                <span className="sr-only"> en la lista</span>
                            </span>
                            <button
                                type="button"
                                onClick={() => onAdd(item)}
                                aria-label={`Añadir una unidad de ${item.name}`}
                                className="h-11 w-11 grid place-items-center rounded-full text-accent-strong hover:bg-surface-sunk"
                            >
                                <Plus size={20} aria-hidden="true" />
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => onAdd(item)}
                            aria-label={`Añadir ${item.name} a la lista`}
                            className="h-11 px-4 inline-flex items-center gap-1.5 rounded-pill bg-accent text-on-accent text-base font-semibold hover:bg-accent-strong"
                        >
                            <Plus size={20} aria-hidden="true" />
                            Añadir
                        </button>
                    )}
                    </div>
                </div>
            </div>
        </li>
    );
};

export default ProductRow;
