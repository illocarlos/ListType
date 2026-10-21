import { useEffect, useMemo, useState } from "react"
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
import ButtonPdf from "./components/ButtonPdf.tsx"
import MercadonaCatalog from "./components/MercadonaCatalog.tsx"

type CatalogTab = "propios" | "mercadona"

// Quita repetidos por nombre (el primero gana), igual que hacía el filtro original
function uniqueByName(items: listItem[]) {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}

function App() {
  const [show, setshow] = useState<boolean>(false);
  const [showNewProduct, setShowNewProduct] = useState<boolean>(false);
  const [catalogTab, setCatalogTab] = useState<CatalogTab>("propios");

  const { order, addItem, decreaseItem, removeItem, addOtherItem } = useList();

  const [selectedCheckbox, setSelectedCheckbox] = useState<string | null>(null);


  // Productos creados a mano, persistidos en localStorage (misma clave y formato de siempre)
  const [itemArrayNew, setItemArrayNew] = useState<listItem[]>(() => {
    try {
      const savedItem = localStorage.getItem("itemArrayNew");
      const parsed = savedItem ? JSON.parse(savedItem) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("itemArrayNew", JSON.stringify(itemArrayNew));
    } catch {
      // sin espacio: se mantiene en memoria
    }
  }, [itemArrayNew]);


  // Categorías del catálogo propio
  const itemCategories = useMemo(() => [...new Set(listItems.map(item => item.type))], []);

  // Catálogo propio + productos creados a mano (también visibles nada más recargar)
  const allOwnItems = useMemo(() => uniqueByName([...listItems, ...itemArrayNew]), [itemArrayNew]);

  // Lo que se ve en la rejilla: todo, o solo la categoría elegida
  const filteredItems = useMemo(
    () => selectedCheckbox ? allOwnItems.filter(item => item.type === selectedCheckbox) : allOwnItems,
    [allOwnItems, selectedCheckbox]
  );


  const showProduct = () => {
    setshow(!show);
    if (!show) {
      setShowNewProduct(false);
    }
  };

  const createProduct = () => {
    setShowNewProduct(!showNewProduct);
  };

  // Tocar una categoría filtra; tocar otra vez la misma vuelve a mostrar todo
  const filterFunction = (value: string) => {
    setSelectedCheckbox(previous => previous === value ? null : value);
  };

  // Guarda el producto creado a mano si no existe ya con ese nombre
  const createArrayItem = (newItem: listItem) => {
    setItemArrayNew(previous => {
      const exists = listItems.some(item => item.name === newItem.name)
        || previous.some(item => item.name === newItem.name);
      return exists ? previous : [...previous, newItem];
    });
  };




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
          className={`fixed bottom-0 uppercase  w-screen font-extrabold md:hidden z-10 ${show ? 'bg-emerald-500 text-white uppercase ' : 'bg-white text-emerald-500 border-dashed border-t-2 border-emerald-500'}`}
        >
          {show ? 'ver cesta ' : 'filtrar'}
        </button>


        <div>
          <div
            className="flex flex-row justify-center"
          >
            <button
              onClick={() => showProduct()}
              aria-expanded={show}
              aria-label={show ? "Ocultar productos" : "Mostrar productos"}
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
            {/* pestañas: catálogo propio o Mercadona */}
            <div className="flex flex-row justify-center gap-2 px-2 mb-5" role="tablist">
              <button
                role="tab"
                aria-selected={catalogTab === "propios"}
                onClick={() => setCatalogTab("propios")}
                className={`uppercase p-2 font-extrabold border-b-4 ${catalogTab === "propios" ? "border-emerald-600" : "border-transparent text-gray-500"}`}
              >
                mis productos
              </button>
              <button
                role="tab"
                aria-selected={catalogTab === "mercadona"}
                onClick={() => setCatalogTab("mercadona")}
                className={`uppercase p-2 font-extrabold border-b-4 ${catalogTab === "mercadona" ? "border-emerald-600" : "border-transparent text-gray-500"}`}
              >
                mercadona
              </button>
            </div>

            {catalogTab === "mercadona" ? (
              <MercadonaCatalog onAdd={addItem} />
            ) : (
              <>
                <div
                  className="flex flex-row justify-center px-2"
                >

                  <button
                    className=" uppercase p-1 border-2 font-extrabold bg-gray-300 border-gray-500"
                    onClick={() => createProduct()}
                  > -nuevo producto-</button>
                  <div className={` ${showNewProduct ? '  fixed  bottom-6 h-2/6 w-full md:bottom-56 bg-white border-2 border-emerald-300 md:w-2/6 md:max-h-96 transform transition-all duration-500 ease-linear z-20 ' : ' fixed -bottom-full transform transition-all duration-1000 ease-in-out '}`}>

                    <button
                      onClick={createProduct}
                      aria-label="Cerrar nuevo producto"
                      className="text-xl font-extrabold w-full bg-red-300 md:w-16">
                      X
                    </button>
                    <FormProductCustom
                      addOtherItem={addOtherItem}
                      setShowNewProduct={setShowNewProduct}
                      createArrayItem={createArrayItem}
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
                      isActive={selectedCheckbox === item}
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
              </>
            )}
          </div>
        </div>
        <div
          className="border border-dashed border-slate-900 p-5 rounded-md space-y-10 md:border-none overflow-y-auto max-h-96 md:max-h-[80vh]"
        >

          <ButtonPdf
            order={order}
          ></ButtonPdf>
          <ListOrder
            order={order}
            addItem={addItem}
            decreaseItem={decreaseItem}
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
