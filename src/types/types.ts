export type listItem = {
    id: number,
    name: string,
    type: string,
    price: number
}


export type orderItem = listItem & {
    quantity: number
}


export type ItemCategory = Array<string>;