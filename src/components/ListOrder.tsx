import { Minus, Plus, Trash2 } from "lucide-react"
import { formatCurrency } from "../helpers/formatPrice"
import type { listItem, orderItem } from "../types/types"
import { Thumb } from "./ProductRow"

type ListOrderProps = {
    order: orderItem[],
    addItem: (item: listItem) => void,
    decreaseItem: (id: listItem['id']) => void,
    removeItem: (id: listItem['id']) => void
}

const ListOrder = ({ order, addItem, decreaseItem, removeItem }: ListOrderProps) => {
    if (order.length === 0) {
        return (
            <div className="px-4 py-10 text-center">
                <p className="text-lg font-semibold">Tu lista está vacía</p>
                <p className="text-sm text-muted mt-1">Busca un producto arriba y pulsa + para apuntarlo.</p>
            </div>
        )
    }

    return (
        <ul className="divide-y divide-border">
            {order.map(item => {
                const detail = [item.packaging, item.unitPrice].filter(Boolean).join(" · ")
                return (
                    <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                        <Thumb item={item} size="sm" />

                        <div className="min-w-0 flex-1">
                            <p className="font-semibold leading-tight line-clamp-2">{item.name}</p>
                            {detail && <p className="text-xs text-muted line-clamp-1">{detail}</p>}
                            <div className="mt-1.5 flex items-center gap-2">
                                <div className="flex items-center rounded-pill border border-border bg-surface">
                                    <button
                                        type="button"
                                        onClick={() => decreaseItem(item.id)}
                                        disabled={item.quantity <= 1}
                                        aria-label={`Quitar una unidad de ${item.name}`}
                                        className="h-9 w-9 grid place-items-center rounded-full text-accent-strong hover:bg-surface-sunk disabled:opacity-40 disabled:hover:bg-transparent"
                                    >
                                        <Minus size={16} aria-hidden="true" />
                                    </button>
                                    <span className="min-w-[1.5rem] text-center text-sm font-bold tabular">X{item.quantity}</span>
                                    <button
                                        type="button"
                                        onClick={() => addItem(item)}
                                        aria-label={`Añadir una unidad de ${item.name}`}
                                        className="h-9 w-9 grid place-items-center rounded-full text-accent-strong hover:bg-surface-sunk"
                                    >
                                        <Plus size={16} aria-hidden="true" />
                                    </button>
                                </div>
                                <span className="text-sm text-muted tabular">total: {formatCurrency(item.price * item.quantity)}</span>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            aria-label={`Quitar ${item.name} de la lista`}
                            className="flex-none h-11 w-11 grid place-items-center rounded-full text-danger hover:bg-danger hover:text-on-danger"
                        >
                            <Trash2 size={18} aria-hidden="true" />
                        </button>
                    </li>
                )
            })}
        </ul>
    )
}

export default ListOrder
