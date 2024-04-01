

import type { listItem } from "../types/types"

type ListItemProps = {
    item: listItem,
    addItem: (item: listItem) => void
}

const ListItem = ({ item, addItem }: ListItemProps) => {
    return (

        <button

            className="   rounded-sm border-2 border-teal-500 w-5/6 justify-around items-center py-2 flex flex-row my-2 mx-2 
            hover:bg-teal-200 transition-all ease-linear
            "
            onClick={() => addItem(item)}
        >

            <h1 className="text-lg font-extrabold  uppercase"> {item.name}</h1>
            <p className="text-2xl font-extrabold">+</p>
        </button>
    )
}

export default ListItem