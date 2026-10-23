import type { listItem, orderItem } from "../types/types";

// Cambios de la lista. Se aplican igual en el móvil y en el servidor (api/lista.js), así la lista compartida
// se ve al momento en quien toca y los demás la reciben igual unos segundos después.
export type ListOp =
    | { op: "add", item: listItem & { addedAt?: number } }
    | { op: "dec", id: number }
    | { op: "remove", id: number }
    | { op: "done", id: number, value: boolean }
    | { op: "clear" }
    | { op: "restore", items: orderItem[] };

// Campos que viajan al servidor (nada más: ni cantidades ni estados locales)
export function wireItem(item: listItem & { addedAt?: number }): listItem & { addedAt?: number } {
    const out: listItem & { addedAt?: number } = { id: item.id, name: item.name, type: item.type, price: item.price };
    if (item.source) out.source = item.source;
    if (item.image) out.image = item.image;
    if (item.mercadonaId) out.mercadonaId = item.mercadonaId;
    if (item.packaging) out.packaging = item.packaging;
    if (item.unitPrice) out.unitPrice = item.unitPrice;
    if (item.isNew) out.isNew = true;
    if (item.byWeight) out.byWeight = true;
    if (item.store) out.store = item.store;
    if (item.addedAt) out.addedAt = item.addedAt;
    return out;
}

export function applyOp(order: orderItem[], op: ListOp): orderItem[] {
    switch (op.op) {
        case "add": {
            const existing = order.find(item => item.id === op.item.id);
            if (existing) {
                // Volver a apuntarlo suma uno y, si estaba en el carro, vuelve a faltar
                return order.map(item => item.id === op.item.id ? { ...item, quantity: Math.min(999, item.quantity + 1), done: undefined } : item);
            }
            return [...order, { ...op.item, quantity: 1, addedAt: op.item.addedAt ?? Date.now() }];
        }
        case "dec":
            return order.map(item => item.id === op.id ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item);
        case "remove":
            return order.filter(item => item.id !== op.id);
        case "done":
            return order.map(item => item.id === op.id ? { ...item, done: op.value || undefined } : item);
        case "clear":
            return [];
        case "restore": {
            const byId = new Map(order.map(item => [item.id, item]));
            for (const item of op.items) byId.set(item.id, item);
            return sortByAdded([...byId.values()]);
        }
    }
}

export const applyOps = (order: orderItem[], ops: ListOp[]): orderItem[] => ops.reduce(applyOp, order);

// Orden de la lista: por cuándo se apuntó cada producto (lo que no tiene fecha, al principio y en su orden)
export function sortByAdded(order: orderItem[]): orderItem[] {
    return order
        .map((item, index) => ({ item, index }))
        .sort((a, b) => (a.item.addedAt ?? 0) - (b.item.addedAt ?? 0) || a.index - b.index)
        .map(entry => entry.item);
}

// Antes de compartir una lista apuntada sin fechas: se le ponen respetando el orden que ya tenía
export function withAddedAt(order: orderItem[], now = Date.now()): orderItem[] {
    return order.map((item, index) => item.addedAt ? item : { ...item, addedAt: now - (order.length - index) });
}
