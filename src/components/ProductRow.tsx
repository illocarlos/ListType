import { Heart, Minus, Plus } from "lucide-react";
import { formatCurrency } from "../helpers/formatPrice";
import type { listItem } from "../types/types";

type ProductRowProps = {
    item: listItem,
    detail?: string,
    previousPrice?: number | null,
    quantity: number,
    onAdd: (item: listItem) => void,
    onDecrease: (item: listItem) => void,
    favorite?: boolean,
    onToggleFavorite?: (item: listItem) => void,
}

export const Thumb = ({ item, size = "md" }: { item: listItem, size?: "sm" | "md" }) => {
    const box = size === "md" ? "h-14 w-14" : "h-12 w-12";
    if (item.image) {
        return (
            <img
                src={item.image}
                alt=""
                loading="lazy"
                className={`${box} flex-none rounded-sm bg-surface object-contain`}
            />
        );
    }
    return (
        <span
            aria-hidden="true"
            className={`${box} flex-none rounded-sm bg-surface-sunk text-on-accent-soft grid place-items-center text-lg font-bold`}
        >
            {item.name.trim().charAt(0).toUpperCase()}
        </span>
    );
};

const ProductRow = ({ item, detail, previousPrice, quantity, onAdd, onDecrease, favorite = false, onToggleFavorite }: ProductRowProps) => {
    const inList = quantity > 0;

    return (
        <li
            className={`flex items-center gap-3 px-3 py-2 min-h-[72px] rounded-md transition-colors duration-200 ${inList ? "bg-accent-soft" : "bg-surface"}`}
        >
            <Thumb item={item} />

            {/* Nombre arriba (hasta 2 líneas) y debajo precio + formato: el nombre usa todo el ancho */}
            <div className="min-w-0 flex-1">
                <p className="text-base font-semibold leading-tight line-clamp-2">
                    {item.isNew && (
                        <span className="mr-1.5 inline-block translate-y-[-1px] rounded-pill bg-highlight px-2 py-0.5 align-middle text-xs font-bold text-on-highlight">
                            Novedad
                        </span>
                    )}
                    {item.name}
                </p>
                <p className="mt-1 flex items-baseline gap-2 min-w-0">
                    {item.price > 0 && (
                        <span className="flex-none text-sm font-bold tabular">{formatCurrency(item.price)}</span>
                    )}
                    {previousPrice ? (
                        <span className="flex-none text-xs text-muted line-through tabular">{formatCurrency(previousPrice)}</span>
                    ) : null}
                    {detail && <span className="text-xs text-muted truncate">{detail}</span>}
                </p>
            </div>

            {onToggleFavorite && (
                <button
                    type="button"
                    onClick={() => onToggleFavorite(item)}
                    aria-pressed={favorite}
                    aria-label={favorite ? `Quitar ${item.name} de favoritos` : `Guardar ${item.name} en favoritos`}
                    className={`flex-none h-11 w-9 -mx-1 grid place-items-center rounded-full ${favorite ? "text-danger" : "text-muted hover:text-danger"}`}
                >
                    <Heart size={20} aria-hidden="true" fill={favorite ? "currentColor" : "none"} />
                </button>
            )}

            {inList ? (
                <div className="flex-none flex items-center rounded-pill bg-surface border border-border">
                    <button
                        type="button"
                        onClick={() => onDecrease(item)}
                        aria-label={quantity === 1 ? `Quitar ${item.name} de la lista` : `Quitar una unidad de ${item.name}`}
                        className="h-11 w-10 grid place-items-center rounded-full text-accent-strong hover:bg-surface-sunk"
                    >
                        <Minus size={18} aria-hidden="true" />
                    </button>
                    <span className="min-w-[1.25rem] text-center font-bold tabular" aria-label={`${quantity} en la lista`}>{quantity}</span>
                    <button
                        type="button"
                        onClick={() => onAdd(item)}
                        aria-label={`Añadir una unidad de ${item.name}`}
                        className="h-11 w-10 grid place-items-center rounded-full text-accent-strong hover:bg-surface-sunk"
                    >
                        <Plus size={18} aria-hidden="true" />
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => onAdd(item)}
                    aria-label={`Añadir ${item.name} a la lista`}
                    className="flex-none h-11 w-11 grid place-items-center rounded-full bg-accent text-on-accent hover:bg-accent-strong"
                >
                    <Plus size={20} aria-hidden="true" />
                </button>
            )}
        </li>
    );
};

export default ProductRow;
