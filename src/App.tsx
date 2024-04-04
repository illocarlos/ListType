import { useEffect, useState } from "react"
// base de dato interna en la misma aplicacion donde recogemos un array de objeto
import { listItems } from "./data/db"
// hook donde nos traemos el array relleno con los datos 
import useList from "./hooks/useList"

// archivo importante para diferenciar de typescript en el creamos objetos que vamos a utilizar 
//en bastantes lugares de la aplicacion pues los centralizamos en un archivo 
import type { listItem } from "./types/types"
// component
import ListItem from "./components/ListItem"
import OrderTotal from "./components/OrderTotal.tsx"
import ButtonComponent from './components/ButtonComponent.tsx'
import ListOrder from "./components/ListOrder.tsx"
import FormProductCustom from "./components/FormProductCustom.tsx"
function App() {
  const [show, setshow] = useState<boolean>(false);
  const [showNewProduct, setShowNewProduct] = useState<boolean>(false);

  const { order, addItem, removeItem, addOtherItem } = useList();

  const [selectedCheckbox, setSelectedCheckbox] = useState<string | null>(null);
  const [activeButton, setActiveButton] = useState<string | null>(null);

  const [filteredItems, setFilteredItems] = useState<listItem[]>([]);
  const [itemCategories, setItemCategories] = useState<string[]>([]);
  const [allItem, setAllItem] = useState<listItem[]>([]);


  const [itemArrayNew, setItemArrayNew] = useState<listItem[]>(() => {
    const savedItem = localStorage.getItem("itemArrayNew");
    return savedItem ? JSON.parse(savedItem) : [];
  });


  useEffect(() => {
    const savedItem = localStorage.getItem("itemArrayNew");
    if (savedItem) {
      setItemArrayNew(JSON.parse(savedItem));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("itemArrayNew", JSON.stringify(itemArrayNew));
  }, [itemArrayNew]);





  const showProduct = () => {
    setshow(!show);
    if (!show) {
      setShowNewProduct(false);
    }
  };

  const createProduct = () => {
    setShowNewProduct(!showNewProduct);
  };

  const filterFunction = (value: string) => {


    setSelectedCheckbox(value === selectedCheckbox ? null : value);
    setActiveButton(value === activeButton ? null : value);

    if (value) {
      const array = [...listItems, ...itemArrayNew, ...filteredItems];
      const filteredArray = array.filter(item => item.type === value);

      const uniqueItems: { [name: string]: listItem } = {};
      filteredArray.forEach(item => {
        if (!uniqueItems[item.name]) {
          uniqueItems[item.name] = item;
        }
      });
      const uniqueFilteredItems = Object.values(uniqueItems);

      console.log('Unique filtered items:', allItem);
      setFilteredItems(uniqueFilteredItems);
    }
  };

  useEffect(() => {
    const uniqueNames = new Set(listItems.map(item => item.type));
    setItemCategories([...uniqueNames]);
    setFilteredItems(listItems);
  }, []);



  const probando = (pushFilter: listItem) => {
    setAllItem([...allItem, pushFilter]);
  };

  useEffect(() => {
    const other = {
      name: allItem[0]?.name,
      price: allItem[0]?.price,
      type: allItem[0]?.type,
      id: allItem[0]?.id
    };
    const itemExist = filteredItems.find(orderItem => orderItem.name === other.name);

    if (itemExist || other.name === undefined) {
      return
    } else {
      const newItem = { ...other };
      setItemArrayNew([...itemArrayNew, newItem])
      setFilteredItems([...filteredItems, newItem]);
    }
    setAllItem([]);
  }, [allItem, itemArrayNew]);




  return (
    <>
      <header
        className=" bg-emerald-600 py-3"
      >
        <h1
          className="text-white text-4xl text-center font-bold uppercase"
        >Lista de la compra</h1>
      </header>

      <main
        className=" max-w-6xl mx-auto py-20 grid md:grid-cols-2"
      >
        {/* button para enseñar filtros o ver cesta */}
        <button
          onClick={showProduct}
          className={`fixed bottom-0 uppercase  w-screen font-extrabold  ${show ? 'bg-emerald-500 text-white uppercase ' : 'bg-white text-emerald-500 border-dashed border-t-2 border-emerald-500'}`}
        >
          {show ? 'ver cesta ' : 'filtrar'}
        </button>


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
            > Filtro</h2>
          </div>

          <div
            className={` ${show ? "block " : "hidden"}`}
          >
            <div
              className="flex flex-row justify-center px-2"
            >

              <button
                className=" uppercase p-1 border-2 font-extrabold bg-gray-300 border-gray-500"
                onClick={() => createProduct()}
              > -nuevo producto-</button>
              <div className={` ${showNewProduct ? '  fixed  bottom-6 h-2/6 w-full md:bottom-56  bg-white md:w-3/6 md:max-h-96 transform transition-all duration-500 ease-linear ' : ' fixed -bottom-full transform transition-all duration-1000 ease-in-out '}`}>

                <button
                  onClick={createProduct}
                  className="text-xl font-extrabold w-full bg-red-300">
                  X
                </button>
                <FormProductCustom
                  addOtherItem={addOtherItem}
                  setShowNewProduct={setShowNewProduct}
                  probando={probando}
                  itemCategories={itemCategories}
                />
              </div>
            </div>
            <div className="grid gap-y-6 py-5 grid-cols-2 my-5 border-2 border-y-zinc-300 md:border-0 ">

              {itemCategories.map(item => (
                <ButtonComponent
                  key={item}
                  filterFunction={filterFunction}
                  type={item}
                />
              ))
              }

            </div>

            <h2
              className=" ml-3 uppercase font-extrabold text-center text-xl mb-9"
            > Productos</h2>
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
          className="border border-dashed border-slate-900 p-5 rounded-md space-y-10 md:border-none overflow-y-auto max-h-96"
        >
          <ListOrder
            order={order}
            removeItem={removeItem}
          />
          <OrderTotal
            order={order}

          />
        </div>
      </main >
    </>
  )
}

export default App
