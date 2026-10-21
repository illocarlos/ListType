
import { formatCurrency } from "../helpers/formatPrice"
import type { listItem, orderItem } from "../types/types"

type ListOrderProps = {
    order: orderItem[],
    addItem: (item: listItem) => void,
    decreaseItem: (id: listItem['id']) => void,
    removeItem: (id: listItem['id']) => void


}



const ListOrder = ({ order, addItem, decreaseItem, removeItem }: ListOrderProps) => {
    return (
        <div >

            {order.length === 0 ? (

                <p className=" text-xl uppercase text-center">no tienes ningun producto </p>
            ) : (
                <div className="grid grid-cols-1">

                    {order.map(item => (
                        <div
                            className="h-6/6 mt-10   w-full flex flex-nowrap  flex-row justify-between items-center gap-2 text-start border-b-2 border-emerald-400 "
                            key={item.id}>
                            <div className="h-6/6 flex flex-row items-center gap-3 min-w-0">
                                {item.image && (
                                    <img
                                        src={item.image}
                                        alt={item.name}
                                        loading="lazy"
                                        className="h-12 w-12 flex-none object-contain bg-white"
                                    />
                                )}
                                <div className="min-w-0">
                                    <p className="text-xl font-extrabold uppercase break-words"> {item.name} <span className="ml-3">X{item.quantity}</span> </p>
                                    {(item.packaging || item.unitPrice) && (
                                        <p className="text-xs text-gray-600">
                                            {[item.packaging, item.unitPrice].filter(Boolean).join(" · ")}
                                        </p>
                                    )}
                                    <div className="flex flex-row">

                                        <p className="text-xs font-extraligth"> total:{formatCurrency(item.price * item.quantity)}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-row items-center gap-1 flex-none mb-2">
                                <button
                                    onClick={() => decreaseItem(item.id)}
                                    disabled={item.quantity <= 1}
                                    aria-label={`Quitar una unidad de ${item.name}`}
                                    className="bg-emerald-200 h-9 w-9 font-extrabold rounded-full disabled:opacity-40"
                                >
                                    −
                                </button>
                                <button
                                    onClick={() => addItem(item)}
                                    aria-label={`Añadir una unidad de ${item.name}`}
                                    className="bg-emerald-200 h-9 w-9 font-extrabold rounded-full"
                                >
                                    +
                                </button>
                                <button
                                    onClick={() => removeItem(item.id)}
                                    aria-label={`Quitar ${item.name} de la lista`}
                                    className="bg-red-600 px-6 py-4 h-full text-white font-extrabold rounded-full">
                                    X
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div >

    )
}

export default ListOrder
