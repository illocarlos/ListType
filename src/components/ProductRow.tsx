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

// Fila de producto compacta pensada para todo el mundo:
// nombre completo (sin cortar), textos de 14 px como mínimo y botones de 44 px.
// Precio y botón + van en la misma línea; la ficha se abre tocando el nombre (lleva el icono de información).
const ProductRow = ({ item, detail, previousPrice, quantity, onAdd, onDecrease, favorite = false, onToggleFavorite, note, onOpenDetails }: ProductRowProps) => {
    const inList = quantity > 0;
    const canOpen = Boolean(onOpenDetails && item.mercadonaId);

    return (
        <li
            className={`flex gap-3 px-3 py-2 rounded-md transition-colors duration-200 ${inList ? "bg-accent-soft" : "bg-surface"}`}
        >
            <div className="pt-1">
                <Thumb item={item} />
            </div>

            <div className="min-w-0 flex-1">
                <div className="flex items-start gap-1">
                    <p className="flex-1 pt-1 text-base font-semibold leading-snug break-words">
                        {item.isNew && (
                            <span className="mr-1.5 inline-block rounded-pill bg-highlight px-2 align-[2px] text-sm font-bold leading-6 text-on-highlight">
                                Novedad
                            </span>
                        )}
                        {canOpen ? (
                            <button
                                type="button"
                                onClick={() => onOpenDetails?.(item)}
                                className="inline text-left font-semibold leading-snug break-words hover:underline underline-offset-2 rounded-sm"
                            >
                                <span className="sr-only">Ficha de </span>
                                {item.name}
                                <Info size={16} aria-hidden="true" className="ml-1 inline-block align-[-2px] text-accent" />
                            </button>
                        ) : item.name}
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

                {note && (
                    <p className={`mt-1 flex items-center gap-1.5 text-sm font-semibold ${note.direction === "up" ? "text-danger" : "text-accent-strong"}`}>
                        {note.direction === "up"
                            ? <TrendingUp size={18} aria-hidden="true" className="flex-none" />
                            : <TrendingDown size={18} aria-hidden="true" className="flex-none" />}
                        {note.text}
                    </p>
                )}

                <div className="mt-0.5 flex items-center gap-2">
                    <p className="min-w-0 flex-1 tabular leading-snug">
                        {item.price > 0 && (
                            <span className="text-base font-bold">
                                {formatCurrency(item.price)}
                                {item.byWeight && <span className="text-sm font-semibold"> /kg<span className="sr-only">, a granel</span></span>}
                            </span>
                        )}
                        {previousPrice && previousPrice > item.price && item.price > 0 ? (
                            <>
                                <span className="ml-2 text-sm text-muted">
                                    <span className="sr-only">antes </span>
                                    <span className="line-through">{formatCurrency(previousPrice)}</span>
                                </span>
                                <span className="ml-2 rounded-pill bg-highlight px-2 text-sm font-bold text-on-highlight">
                                    −{Math.round(((previousPrice - item.price) / previousPrice) * 100)} %
                                    <span className="sr-only"> de descuento</span>
                                </span>
                            </>
                        ) : null}
                        {detail && <span className="block text-sm text-muted break-words">{detail}</span>}
                    </p>

                    <div className="flex-none flex items-center">
                    {inList ? (
                        <div className="flex items-center rounded-pill bg-surface border border-border">
                            <button
                                type="button"
                                onClick={() => onDecrease(item)}
                                aria-label={quantity === 1 ? `Quitar ${item.name} de la lista` : `Quitar ${item.byWeight ? "un kilo" : "una unidad"} de ${item.name}`}
                                className="h-11 w-11 grid place-items-center rounded-full text-accent-strong hover:bg-surface-sunk"
                            >
                                <Minus size={20} aria-hidden="true" />
                            </button>
                            <span className="min-w-[1.75rem] text-center text-lg font-bold tabular">
                                {quantity}
                                {item.byWeight && <span className="text-sm font-semibold"> kg</span>}
                                <span className="sr-only">{item.byWeight ? " aproximados" : ""} en la lista</span>
                            </span>
                            <button
                                type="button"
                                onClick={() => onAdd(item)}
                                aria-label={`Añadir ${item.byWeight ? "un kilo" : "una unidad"} de ${item.name}`}
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
                            className="h-11 w-11 grid place-items-center rounded-full bg-accent text-on-accent hover:bg-accent-strong"
                        >
                            <Plus size={22} aria-hidden="true" />
                        </button>
                    )}
                    </div>
                </div>
            </div>
        </li>
    );
};

export default ProductRow;
