import { useMemo } from "react"
import { formatCurrency } from "../helpers/formatPrice"
import type { orderItem } from "../types/types"


type TotalProps = {
    order: orderItem[],


}

const OrderTotal = ({ order }: TotalProps) => {


    const total = useMemo(() => order.reduce((total, item) => total + (item.quantity * item.price), 0),
        [order])

    return (
        <div>
            <h1>Total aprox: <span>{formatCurrency(total)}</span></h1>
        </div>
    )
}

export default OrderTotal