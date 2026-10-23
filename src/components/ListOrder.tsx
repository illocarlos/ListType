import { useEffect, useRef } from "react"
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
    // Al quitar un producto con la papelera su fila desaparece: el foco pasa a la papelera del siguiente
    // (o del anterior), o al aviso de lista vacía, para que el teclado y el lector de pantalla no se pierdan
    const listRef = useRef<HTMLUListElement>(null)
    const emptyRef = useRef<HTMLParagraphElement>(null)
    const pendingFocus = useRef<number | "empty" | null>(null)
    useEffect(() => {
        const target = pendingFocus.current
        pendingFocus.current = null
        if (target === "empty") emptyRef.current?.focus()
        else if (target !== null) listRef.current?.querySelector<HTMLButtonElement>(`[data-row-id="${target}"] [data-trash]`)?.focus()
    }, [order.length])

    const remove = (item: orderItem, button: HTMLButtonElement) => {
        if (document.activeElement === button) {
            const index = order.findIndex(entry => entry.id === item.id)
            const next = order[index + 1] ?? order[index - 1]
            pendingFocus.current = next ? next.id : "empty"
        }
        removeItem(item.id)
    }

    if (order.length === 0) {
        return (
            <div className="px-4 py-10 text-center">
                <p ref={emptyRef} tabIndex={-1} className="text-lg font-semibold focus:outline-none">Tu lista está vacía</p>
                <p className="text-base text-muted mt-1">Busca un producto arriba y pulsa el botón + para apuntarlo.</p>
            </div>
        )
    }

    return (
        <ul ref={listRef} className="divide-y divide-border">
            {order.map(item => {
                const detail = [item.store, item.packaging, item.unitPrice].filter(Boolean).join(" · ")
                return (
                    <li key={item.id} data-row-id={item.id} className="flex gap-3 px-4 py-3">
                        <Thumb item={item} size="sm" />

                        <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-1">
                                <p className="flex-1 font-semibold leading-snug break-words">{item.name}</p>
                                <button
                                    type="button"
                                    data-trash
                                    onClick={event => remove(item, event.currentTarget)}
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
                                        aria-label={`Quitar ${item.byWeight ? "un kilo" : "una unidad"} de ${item.name}`}
                                        className="h-11 w-11 grid place-items-center rounded-full text-accent-strong hover:bg-surface-sunk disabled:opacity-40 disabled:hover:bg-transparent"
                                    >
                                        <Minus size={20} aria-hidden="true" />
                                    </button>
                                    <span className="min-w-[2.25rem] text-center text-base font-bold tabular">
                                        {item.byWeight ? `${item.quantity} kg` : `X${item.quantity}`}
                                        <span className="sr-only">{item.byWeight ? " aproximados" : " unidades"}</span>
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => addItem(item)}
                                        aria-label={`Añadir ${item.byWeight ? "un kilo" : "una unidad"} de ${item.name}`}
                                        className="h-11 w-11 grid place-items-center rounded-full text-accent-strong hover:bg-surface-sunk"
                                    >
                                        <Plus size={20} aria-hidden="true" />
                                    </button>
                                </div>
                                {item.price > 0 && (
                                    <span className="text-base text-muted tabular">total{item.byWeight ? " aprox." : ""}: {formatCurrency(item.price * item.quantity)}</span>
                                )}
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
