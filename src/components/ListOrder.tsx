import { useEffect, useId, useLayoutEffect, useRef } from "react"
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

    // Producto recién añadido: su fila entra con un leve desplazamiento. Al abrir la lista no se anima nada (solo lo que aparece
    // después), ni con «reducir movimiento». Antes de pintar, para que la fila no se vea entera un instante.
    const known = useRef<Set<number> | null>(null)
    useLayoutEffect(() => {
        const ids = new Set(order.map(item => item.id))
        const previous = known.current
        known.current = ids
        if (!previous || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
        for (const id of ids) {
            if (previous.has(id)) continue
            listRef.current?.querySelector<HTMLElement>(`[data-row-id="${id}"]`)?.animate?.(
                [{ opacity: 0, transform: "translateY(20px) scale(.96)" }, { opacity: 1, transform: "none" }],
                { duration: 380, easing: "cubic-bezier(.2,.8,.2,1)" },
            )
        }
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

    // Misma disposición que las filas de Favoritos: foto a la izquierda, nombre (abre la ficha) arriba con la
    // papelera donde allí va el corazón, precio en negrita, detalles debajo y − cantidad + a la derecha.
    // Lo propio del carrito: la casilla "en el carro" delante y quién lo apuntó.
    const row = (item: orderItem) => {
        const detail = [item.store, item.packaging, item.unitPrice].filter(Boolean).join(" · ")
        const who = item.addedBy ? `Apuntado por ${item.addedBy}` : ""
        const done = Boolean(item.done)
        const canOpen = Boolean(onOpenDetails && item.mercadonaId)
        return (
            <li
                key={item.id}
                data-row-id={item.id}
                className={`flex gap-3 px-3 py-2 rounded-md transition-colors duration-200 ${done ? "bg-surface-sunk" : "bg-accent-soft"}`}
            >
                {/* Foto y, debajo, la casilla "en el carro": así el texto tiene el mismo ancho que en Favoritos */}
                <div className="flex-none flex flex-col items-center gap-1 pt-1">
                    <div className={done ? "opacity-60" : ""}>
                        <Thumb item={item} />
                    </div>
                    {onToggleDone && (
                        <button
                            type="button"
                            role="checkbox"
                            aria-checked={done}
                            aria-label={`${item.name}: en el carro`}
                            onClick={event => toggle(item, event.currentTarget)}
                            className="h-11 w-11 grid place-items-center rounded-full hover:bg-surface"
                        >
                            <span aria-hidden="true" className={`h-7 w-7 grid place-items-center rounded-sm border-2 ${done ? "border-accent bg-accent text-on-accent" : "border-border-input bg-surface"}`}>
                                {done && <Check size={18} strokeWidth={3} />}
                            </span>
                        </button>
                    )}
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-1">
                        <p className={`flex-1 pt-1 text-base font-semibold leading-snug break-words ${done ? "text-muted line-through" : ""}`}>
                            {canOpen ? (
                                <button
                                    type="button"
                                    onClick={() => onOpenDetails?.(item)}
                                    className="relative inline text-left font-semibold leading-snug break-words hover:underline underline-offset-2 rounded-sm before:absolute before:inset-x-0 before:-top-3 before:-bottom-0.5 before:content-['']"
                                >
                                    <span className="sr-only">Ficha de </span>
                                    {item.name}
                                    <Info size={16} aria-hidden="true" className="ml-1 inline-block align-[-2px] text-accent" />
                                </button>
                            ) : item.name}
                        </p>
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

                    <div className="mt-0.5 flex items-center gap-2">
                        <p className="min-w-0 flex-1 tabular leading-snug">
                            {item.price > 0 && (
                                <span className={`text-base font-bold ${done ? "text-muted" : ""}`}>
                                    {formatCurrency(item.price)}
                                    {item.byWeight && <span className="text-sm font-semibold"> /kg<span className="sr-only">, a granel</span></span>}
                                </span>
                            )}
                            {item.price > 0 && item.quantity > 1 && (
                                <span className="block text-sm text-muted">total{item.byWeight ? " aprox." : ""}: {formatCurrency(item.price * item.quantity)}</span>
                            )}
                            {detail && <span className="block text-sm text-muted break-words">{detail}</span>}
                            {who && <span className="block text-sm font-semibold text-accent-strong break-words">{who}</span>}
                        </p>

                        <div className="flex-none flex items-center">
                            {done ? (
                                // En el carro: sin botones de cantidad (ya no se van a tocar), solo lo que se ha cogido
                                <span className="px-2 text-base font-bold text-muted tabular">
                                    {item.byWeight ? `${item.quantity} kg` : `X${item.quantity}`}
                                </span>
                            ) : (
                                <div className="flex items-center rounded-pill bg-surface border border-border">
                                    <button
                                        type="button"
                                        onClick={() => decreaseItem(item.id)}
                                        disabled={item.quantity <= 1}
                                        aria-label={`Quitar ${item.byWeight ? "un kilo" : "una unidad"} de ${item.name}`}
                                        className="h-11 w-11 grid place-items-center rounded-full text-accent-strong hover:bg-surface-sunk disabled:opacity-40 disabled:hover:bg-transparent"
                                    >
                                        <Minus size={20} aria-hidden="true" />
                                    </button>
                                    <span className="min-w-[1.75rem] text-center text-lg font-bold tabular">
                                        {item.quantity}
                                        {item.byWeight && <span className="text-sm font-semibold"> kg</span>}
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
                            )}
                        </div>
                    </div>
                </div>
            </li>
        )
    }

    return (
        <div ref={listRef}>
            {pending.length > 0 && (
                <ul className="space-y-2 px-3 pt-3">
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
                    <ul className="space-y-2 px-3">
                        {inCart.map(row)}
                    </ul>
                </section>
            )}
        </div>
    )
}

export default ListOrder
