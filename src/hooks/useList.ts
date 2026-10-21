import { useState, useEffect } from "react";
import { listItem, orderItem } from "../types/types";
import { freeCacheSpace } from "../helpers/mercadona";

function saveOrder(order: orderItem[]) {
    const value = JSON.stringify(order);
    try {
        localStorage.setItem("order", value);
    } catch {
        // Si no hay espacio, se vacía la caché de Mercadona: la lista siempre tiene prioridad
        freeCacheSpace();
        try {
            localStorage.setItem("order", value);
        } catch {
            // Sin espacio ni tras limpiar: se mantiene en memoria hasta el siguiente cambio
        }
    }
}

export default function useList() {

    // Inicializar el estado order con lo guardado en localStorage (o vacío)
    const [order, setOrder] = useState<orderItem[]>(() => {
        try {
            const savedOrder = localStorage.getItem("order");
            const parsed = savedOrder ? JSON.parse(savedOrder) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    });

    // Guardar order en localStorage cada vez que cambie
    useEffect(() => {
        saveOrder(order);
    }, [order]);

    const addItem = (item: listItem) => {
        setOrder(prevOrder => {
            const itemExist = prevOrder.find(orderItem => orderItem.id === item.id);
            if (itemExist) {
                return prevOrder.map(orderItem =>
                    orderItem.id === item.id
                        ? { ...orderItem, quantity: orderItem.quantity + 1 }
                        : orderItem
                );
            }
            return [...prevOrder, { ...item, quantity: 1 }];
        });
    };

    const decreaseItem = (id: listItem['id']) => {
        setOrder(prevOrder => prevOrder.map(orderItem =>
            orderItem.id === id
                ? { ...orderItem, quantity: Math.max(1, orderItem.quantity - 1) }
                : orderItem
        ));
    };

    const removeItem = (id: listItem['id']) => {
        setOrder(prevOrder => prevOrder.filter(item => item.id !== id));
    };

    return {
        order,
        addItem,
        decreaseItem,
        removeItem
    };
}
