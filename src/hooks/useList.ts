import { useState, useEffect } from "react";
import { listItem, orderItem } from "../types/types";

export default function useList() {

    // Inicializar el estado order con un arreglo vacío si no hay nada en localStorage
    const [order, setOrder] = useState<orderItem[]>(() => {
        const savedOrder = localStorage.getItem("order");
        return savedOrder ? JSON.parse(savedOrder) : [];
    });


    // Recuperar order de localStorage al cargar la página
    useEffect(() => {
        const savedOrder = localStorage.getItem("order");
        if (savedOrder) {
            setOrder(JSON.parse(savedOrder));
        }
    }, []);

    // Guardar order en localStorage cada vez que cambie
    useEffect(() => {
        localStorage.setItem("order", JSON.stringify(order));
    }, [order]);

    const addItem = (item: listItem) => {
        const itemExist = order.find(orderItem => orderItem.id === item.id);
        if (itemExist) {
            const updatedOrder = order.map(orderItem =>
                orderItem.id === item.id
                    ? { ...orderItem, quantity: orderItem.quantity + 1 }
                    : orderItem
            );
            setOrder(updatedOrder);
        } else {
            const newItem = { ...item, quantity: 1 };
            setOrder([...order, newItem]);
        }
    };

    const removeItem = (id: listItem['id']) => {
        setOrder(order.filter(item => item.id !== id));
    };

    const addOtherItem = (item: listItem) => {

        const itemExist = order.find(orderItem => orderItem.name === item.name);
        if (itemExist) {
            const updatedOrder = order.map(orderItem =>
                orderItem.name === item.name
                    ? { ...orderItem, quantity: orderItem.quantity + 1 }
                    : orderItem
            );
            setOrder(updatedOrder);
        } else {
            const newItem = { ...item, quantity: 1 };
            setOrder([...order, newItem]);
        }
    };

    

    return {
        order,
        addItem,
        removeItem,
        addOtherItem
    };
}
