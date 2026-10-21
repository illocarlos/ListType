import { useMemo } from "react"
import { formatCurrency } from "../helpers/formatPrice"
import type { orderItem } from "../types/types"


type TotalProps = {
    order: orderItem[],
}

const OrderTotal = ({ order }: TotalProps) => {
    const total = useMemo(() => order.reduce((total, item) => total + (item.quantity * item.price), 0), [order])

    return (
        <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted">Total aproximado</span>
            <span className="text-xl font-extrabold tabular">{formatCurrency(total)}</span>
        </div>
    )
}

export default OrderTotal
