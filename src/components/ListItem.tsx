

import type { listItem } from "../types/types"

type ListItemProps = {
    item: listItem,
    addItem: (filteredItems: listItem) => void
}

const ListItem = ({ item, addItem }: ListItemProps) => {



    return (

        <button

            className=" rounded-sm border-2 border-teal-500 w-5/6  py-2 my-2 mx-4
            hover:bg-teal-200 transition-all ease-linear
            "
            onClick={() => addItem(item)}
        >
            <div className=" flex flex-row  justify-center items-center mx-2 ">

                <h1 className="text-lg font-extrabold uppercase"> {item.name}</h1>

            </div>
        </button>
    )
}

export default ListItem