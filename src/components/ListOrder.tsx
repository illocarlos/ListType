import { Info, Minus, Plus, Trash2 } from "lucide-react"
import { formatCurrency } from "../helpers/formatPrice"
import type { listItem, orderItem } from "../types/types"
import Thumb from "./Thumb"

type ListOrderProps = {
    order: orderItem[],
    addItem: (item: listItem) => void,
    decreaseItem: (id: listItem['id']) => void,
    removeItem: (id: listItem['id']) => void,
    onOpenDetails?: (item: listItem) => void
}

const ListOrder = ({ order, addItem, decreaseItem, removeItem, onOpenDetails }: ListOrderProps) => {
    if (order.length === 0) {
        return (
            <div className="px-4 py-10 text-center">
                <p className="text-lg font-semibold">Tu lista está vacía</p>
                <p className="text-base text-muted mt-1">Busca un producto arriba y pulsa «Añadir» para apuntarlo.</p>
            </div>
        )
    }

    return (
        <ul className="divide-y divide-border">
            {order.map(item => {
                const detail = [item.packaging, item.unitPrice].filter(Boolean).join(" · ")
                return (
                    <li key={item.id} className="flex gap-3 px-4 py-3">
                        <Thumb item={item} size="sm" />

                        <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-1">
                                <p className="flex-1 font-semibold leading-snug break-words">{item.name}</p>
                                <button
                                    type="button"
                                    onClick={() => removeItem(item.id)}
                                    aria-label={`Quitar ${item.name} de la lista`}
                                    className="flex-none -mt-2 -mr-2 h-11 w-11 grid place-items-center rounded-full text-danger hover:bg-danger hover:text-on-danger"
                                >
                                    <Trash2 size={20} aria-hidden="true" />
                                </button>
                            </div>
                            {detail && <p className="text-sm text-muted break-words">{detail}</p>}

                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center rounded-pill border border-border bg-surface">
                                    <button
                                        type="button"
                                        onClick={() => decreaseItem(item.id)}
                                        disabled={item.quantity <= 1}
                                        aria-label={`Quitar una unidad de ${item.name}`}
                                        className="h-11 w-11 grid place-items-center rounded-full text-accent-strong hover:bg-surface-sunk disabled:opacity-40 disabled:hover:bg-transparent"
                                    >
                                        <Minus size={20} aria-hidden="true" />
                                    </button>
                                    <span className="min-w-[2.25rem] text-center text-base font-bold tabular">
                                        X{item.quantity}
                                        <span className="sr-only"> unidades</span>
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => addItem(item)}
                                        aria-label={`Añadir una unidad de ${item.name}`}
                                        className="h-11 w-11 grid place-items-center rounded-full text-accent-strong hover:bg-surface-sunk"
                                    >
                                        <Plus size={20} aria-hidden="true" />
                                    </button>
                                </div>
                                <span className="text-base text-muted tabular">total: {formatCurrency(item.price * item.quantity)}</span>
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
                            </div>
                        </div>
                    </li>
                )
            })}
        </ul>
    )
}

export default ListOrder
