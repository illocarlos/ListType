import { useState } from "react";
import { listItem, orderItem } from "../types/types";



export default function useList() {
    const [order, setOrder] = useState<orderItem[]>([])

    const addItem = (item: listItem) => {

        const itemExist = order.find(orderItem => orderItem.id === item.id)

        if (itemExist) {
            const updateOrder = order.map(orderItem => orderItem.id === item.id ?
                { ...orderItem, quantity: orderItem.quantity + 1 }
                :
                orderItem)
            setOrder(updateOrder)
        } else {
            const newItem = { ...item, quantity: 1 }
            setOrder([...order, newItem])
        }


    }
    const removeItem = (id: listItem['id']) => {
        setOrder(order.filter(item => item.id !== id))
    }


    return {
        order,
        setOrder,
        addItem,
        removeItem

    }
}