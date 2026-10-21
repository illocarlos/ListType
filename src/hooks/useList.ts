import { useCallback, useEffect, useState } from "react";
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

    // Actualiza precio, foto, formato y novedad de los productos de Mercadona ya apuntados
    // con datos más recientes. La cantidad no se toca.
    const refreshOrder = useCallback((fresh: Map<number, listItem>) => {
        setOrder(prevOrder => {
            let changed = false;
            const next = prevOrder.map(orderItem => {
                const update = fresh.get(orderItem.id);
                if (!update) return orderItem;
                if (update.price === orderItem.price && update.image === orderItem.image
                    && update.packaging === orderItem.packaging && update.unitPrice === orderItem.unitPrice
                    && update.name === orderItem.name && update.isNew === orderItem.isNew) return orderItem;
                changed = true;
                return { ...orderItem, ...update, quantity: orderItem.quantity };
            });
            return changed ? next : prevOrder;
        });
    }, []);

    return {
        order,
        addItem,
        decreaseItem,
        removeItem,
        refreshOrder
    };
}
