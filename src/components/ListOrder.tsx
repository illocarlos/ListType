
import { formatCurrency } from "../helpers/formatPrice"
import type { listItem, orderItem } from "../types/types"

type ListOrderProps = {
    order: orderItem[],
    removeItem: (id: listItem['id']) => void


}



const ListOrder = ({ order, removeItem }: ListOrderProps) => {
    return (
        <div >

            {order.length === 0 ? (

                <p className=" text-xl uppercase text-center">no tienes ningun producto </p>
            ) : (
                <div className="grid grid-cols-2">

                    {order.map(item => (
                        <div
                            className="h-6/6 flex flex-nowrap py-8  flex-row my-3 justify-around items-center text-start border-b-2 border-emerald-400 mx-4 "
                            key={item.id}>
                            <div className="h-6/6">
                                <p className="text-XL font-bold uppercase"> {item.name} X{item.quantity} </p>
                                <div className="flex flex-row">
                                    <p className="text-xs font-bold">unidades:{item.quantity} </p>
                                    <p className=" ml-5 text-xs font-extraligth"> total:{formatCurrency(item.price * item.quantity)}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => removeItem(item.id)}
                                className="bg-red-600 w-10 h-10 text-white font-extrabold rounded-full">
                                X
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div >

    )
}

export default ListOrder