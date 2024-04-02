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
            <h1>Total: <span className=" text-emerald-900 font-extrabold text-lg">{formatCurrency(total)}/</span>aprox</h1>
        </div>
    )
}

export default OrderTotal