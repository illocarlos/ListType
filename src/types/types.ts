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
    byWeight?: boolean
}


export type orderItem = listItem & {
    quantity: number
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
    byWeight?: boolean
}
