
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
                <div className="grid grid-cols-1">

                    {order.map(item => (
                        <div
                            className="h-6/6 mt-10   w-full flex flex-nowrap  flex-row justify-between items-center text-start border-b-2 border-emerald-400 "
                            key={item.id}>
                            <div className="h-6/6 ">
                                <p className="text-xl font-extrabold uppercase"> {item.name} <span className="ml-3">X{item.quantity}</span> </p>
                                <div className="flex flex-row">

                                    <p className="text-xs font-extraligth"> total:{formatCurrency(item.price * item.quantity)}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => removeItem(item.id)}
                                className="bg-red-600 px-6 py-4 h-full mb-2 text-white font-extrabold rounded-full">
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