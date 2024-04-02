import { useEffect, useState } from "react"

import { listItems } from "./data/db"
import useList from "./hooks/useList"
import type { listItem } from "./types/types"
// component
import ListItem from "./components/ListItem"
import OrderTotal from "./components/OrderTotal.tsx"
import ButtonComponent from './components/ButtonComponent.tsx'
import ListOrder from "./components/ListOrder.tsx"


function App() {
  const [show, setshow] = useState<boolean>(false)
  const { order, addItem, removeItem } = useList()

  const [selectedCheckbox, setSelectedCheckbox] = useState<string | null>(null);
  const [activeButton, setActiveButton] = useState<string | null>(null);

  const [filteredItems, setFilteredItems] = useState<listItem[]>([]);
  const [itemCategories, setItemCategories] = useState<string[]>([]);

  const showProduct = () => {
    setshow(!show)
  }
  const filterFunction = (value: string) => {
    setSelectedCheckbox(value === selectedCheckbox ? null : value);
    setActiveButton(value === activeButton ? null : value);
    if (value) {
      const filter = listItems.filter(item => item.type === value)
      setFilteredItems(filter)
    }
  };

  useEffect(() => {

    const uniqueNames = new Set(listItems.map(item => item.type));
    setItemCategories([...uniqueNames]);
    console.log('eeeeee', uniqueNames)
    // ingresamos en el array al usar el filtro y cogemos solo los que necesitamos
    setFilteredItems(listItems);
  }, []);





  return (
    <>
      <header
        className=" bg-emerald-600 py-3"
      >
        <h1
          className="text-white text-4xl text-center font-bold uppercase"
        >mercadonal</h1>
      </header>

      <main
        className=" max-w-7xl mx-auto py-20 grid md:grid-cols-2"
      >
        <div>
          <div
            className="flex flex-row justify-center"
          >
            <button
              onClick={() => showProduct()}
              className={`flex items-center justify-center border-2 rounded-full border-emerald-600 h-10 w-10 
              transition-transform animate-rotate
              ${show ? "rotate-90 bg-emerald-600 text-white" : "bg-emerald-200"}`}
            >
              <span
                className="block mb-1 text-4xl transform-origin-center"
              >
                +
              </span>
            </button>
            <h2
              className=" ml-3 uppercase font-extrabold text-4xl mb-9"
            >Productos</h2>
          </div>

          <div
            className={` ${show ? "block" : "hidden"}`}
          >
            <div className="grid gap-y-5 grid-cols-2 my-5 mx-6">

              {itemCategories.map(item => (
                <ButtonComponent
                  key={item}
                  filterFunction={filterFunction}
                  type={item}
                />
              ))
              }


            </div>

            <div className="grid grid-cols-2">
              {filteredItems.map(item => (
                <ListItem
                  key={item.id}
                  item={item}
                  addItem={addItem}
                />
              ))}
            </div>
          </div>
        </div>
        <div
          className="border border-dashed border-slate-900 p-5 rounded-md space-y-10"
        >
          <ListOrder
            order={order}
            removeItem={removeItem}
          />
          <OrderTotal
            order={order}

          />
        </div>
      </main>
    </>
  )
}

export default App
