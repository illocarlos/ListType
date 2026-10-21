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
    unitPrice?: string
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
    aisle: string
}
