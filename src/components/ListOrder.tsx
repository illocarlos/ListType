import { useEffect, useId, useRef } from "react"
import { Check, Info, Minus, Plus, Trash2 } from "lucide-react"
import { formatCurrency } from "../helpers/formatPrice"
import type { listItem, orderItem } from "../types/types"
import Thumb from "./Thumb"

type ListOrderProps = {
    order: orderItem[],
    addItem: (item: listItem) => void,
    decreaseItem: (id: listItem['id']) => void,
    removeItem: (id: listItem['id']) => void,
    onOpenDetails?: (item: listItem) => void,
    // En la tienda: marcar lo que ya está en el carro
    onToggleDone?: (item: orderItem) => void,
}

const ListOrder = ({ order, addItem, decreaseItem, removeItem, onOpenDetails, onToggleDone }: ListOrderProps) => {
    // Al quitar un producto con la papelera su fila desaparece: el foco pasa a la papelera del siguiente
    // (o del anterior), o al aviso de lista vacía, para que el teclado y el lector de pantalla no se pierdan.
    // Al marcarlo como "en el carro" la fila se mueve abajo: el foco va con ella.
    const listRef = useRef<HTMLDivElement>(null)
    const emptyRef = useRef<HTMLParagraphElement>(null)
    const pendingFocus = useRef<number | "empty" | null>(null)
    const pendingCheck = useRef<number | null>(null)
    const cartTitleId = useId()
    useEffect(() => {
        const target = pendingFocus.current
        pendingFocus.current = null
        if (target === "empty") emptyRef.current?.focus()
        else if (target !== null) listRef.current?.querySelector<HTMLButtonElement>(`[data-row-id="${target}"] [data-trash]`)?.focus()
    }, [order.length])
    useEffect(() => {
        const target = pendingCheck.current
        if (target === null) return
        pendingCheck.current = null
        listRef.current?.querySelector<HTMLButtonElement>(`[data-row-id="${target}"] [role="checkbox"]`)?.focus()
    }, [order])

    const pending = order.filter(item => !item.done)
    const inCart = order.filter(item => item.done)
    // Orden en pantalla: primero lo que falta y luego lo del carro (el foco de la papelera sigue ese orden)
    const shown = [...pending, ...inCart]

    const remove = (item: orderItem, button: HTMLButtonElement) => {
        if (document.activeElement === button) {
            const index = shown.findIndex(entry => entry.id === item.id)
            const next = shown[index + 1] ?? shown[index - 1]
            pendingFocus.current = next ? next.id : "empty"
        }
        removeItem(item.id)
    }

    const toggle = (item: orderItem, button: HTMLButtonElement) => {
        if (document.activeElement === button) pendingCheck.current = item.id
        onToggleDone?.(item)
    }

    if (order.length === 0) {
        return (
            <div className="px-4 py-10 text-center">
                <p ref={emptyRef} tabIndex={-1} className="text-lg font-semibold focus:outline-none">Tu lista está vacía</p>
                <p className="text-base text-muted mt-1">Busca un producto arriba y pulsa el botón + para apuntarlo.</p>
            </div>
        )
    }

    const row = (item: orderItem) => {
        const detail = [item.store, item.packaging, item.unitPrice].filter(Boolean).join(" · ")
        const done = Boolean(item.done)
        return (
            <li key={item.id} data-row-id={item.id} className={`flex gap-3 px-4 py-3 ${done ? "bg-surface-sunk" : ""}`}>
                {onToggleDone && (
                    <button
                        type="button"
                        role="checkbox"
                        aria-checked={done}
                        aria-label={`${item.name}: en el carro`}
                        onClick={event => toggle(item, event.currentTarget)}
                        className="flex-none -ml-2 -mr-1 h-11 w-11 grid place-items-center rounded-full hover:bg-surface-sunk"
                    >
                        <span aria-hidden="true" className={`h-7 w-7 grid place-items-center rounded-sm border-2 ${done ? "border-accent bg-accent text-on-accent" : "border-border-input bg-surface"}`}>
                            {done && <Check size={18} strokeWidth={3} />}
                        </span>
                    </button>
                )}
                <div className={done ? "opacity-60" : ""}>
                    <Thumb item={item} size="sm" />
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-1">
                        <p className={`flex-1 font-semibold leading-snug break-words ${done ? "text-muted line-through" : ""}`}>{item.name}</p>
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

                    {done ? (
                        // En el carro: sin botones de cantidad (ya no se van a tocar), solo lo que se ha cogido
                        <p className="mt-1 text-base text-muted tabular">
                            {item.byWeight ? `${item.quantity} kg` : `X${item.quantity}`}
                            {item.price > 0 && <> · {formatCurrency(item.price * item.quantity)}</>}
                        </p>
                    ) : (
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
                    )}
                </div>
            </li>
        )
    }

    return (
        <div ref={listRef}>
            {pending.length > 0 && (
                <ul className="divide-y divide-border">
                    {pending.map(row)}
                </ul>
            )}
            {pending.length === 0 && inCart.length > 0 && (
                <p className="px-4 pt-4 text-base font-semibold text-accent-strong">¡Ya está todo en el carro!</p>
            )}
            {inCart.length > 0 && (
                <section aria-labelledby={cartTitleId} className="mt-2">
                    <h3 id={cartTitleId} className="px-4 py-2 text-sm font-semibold text-muted">
                        En el carro <span className="tabular">({inCart.length})</span>
                    </h3>
                    <ul className="divide-y divide-border border-t border-border">
                        {inCart.map(row)}
                    </ul>
                </section>
            )}
        </div>
    )
}

export default ListOrder
