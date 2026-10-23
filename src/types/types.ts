export type listItem = {
    id: number,
    name: string,
    type: string,
    price: number,
    // Campos opcionales: los objetos ya guardados en localStorage siguen siendo válidos
    source?: 'catalog' | 'manual' | 'mercadona',
    image?: string,
    mercadonaId?: string,
    packaging?: string,
    unitPrice?: string,
    isNew?: boolean,
    // Se vende a granel: el precio es por kilo y la cantidad son kilos aproximados
    byWeight?: boolean,
    // Producto de otra tienda (Lidl, la frutería…) guardado a mano en favoritos
    store?: string,
    // Lista compartida: nombre de quien lo apuntó primero
    addedBy?: string
}


export type orderItem = listItem & {
    quantity: number,
    // Ya está en el carro (tachado en la tienda)
    done?: boolean,
    // Cuándo se apuntó (ms): fija el orden de la lista en todos los móviles cuando se comparte
    addedAt?: number
}

export type ItemCategory = Array<string>;

export type MercadonaAisle = {
    id: number,
    name: string
}

export type MercadonaGroup = {
    id: number,
    name: string,
    aisles: MercadonaAisle[]
}

export type MercadonaProduct = {
    mercadonaId: string,
    name: string,
    price: number,
    previousPrice: number | null,
    unitPrice: string,
    packaging: string,
    image: string,
    subcategory: string,
    aisle: string,
    // Novedad: lista oficial de Mercadona o marca is_new / is_new_arrival
    isNew?: boolean,
    // Granel (selling_method 1): el precio es el de bulk_price, por kilo
    byWeight?: boolean,
    // Cuándo se descargó este dato de Mercadona (ms). Si el mismo producto llega por dos caminos
    // (pasillo y rebajas), manda el precio más reciente. No se guarda: se pone al leer la caché.
    fetchedAt?: number
}
