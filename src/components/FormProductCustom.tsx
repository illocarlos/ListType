import { useState } from "react";
import type { listItem } from "../types/types";

interface FormProps {
    setShowNewProduct: (show: boolean) => void;
    addOtherItem: (filteredItems: listItem) => void;
    createArrayItem: (pushFIlter: listItem) => void;
    itemCategories: string[];
}

const FormProductCustom: React.FC<FormProps> = ({ addOtherItem, setShowNewProduct, createArrayItem, itemCategories }) => {
    // Estados para almacenar el nombre y el precio del producto
    const [productName, setProductName] = useState<string>("");
    const [productType, setProductType] = useState<string>("");

    // Funciones para manejar cambios en los campos de entrada
    const handleNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setProductName(event.target.value);
    };

    const handleTypeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newValue = event.target.value;
        setProductType(newValue); // Actualizar el estado productType con el nuevo valor seleccionado
    };

    function generateNumericId(): number {
        const numericId = Math.floor(Math.random() * 9000000000) + 1000000000; // Generar un número aleatorio de 10 dígitos
        return numericId;
    }
    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        // Crear un nuevo objeto de producto con los datos del formulario
        const newProduct: listItem = {
            id: generateNumericId(), // Generar un id único
            name: productName.trim().replace(/[.;,]/g, "").toLowerCase(),
            price: 0,
            type: productType, // Usar el valor actual de productType
        };

        if (newProduct.name.length < 2 || !newProduct.type) {
            return alert("nita por favor el producto tiene que tener mas 3 tres letras y una categoria");
        }

        setShowNewProduct(false);
        addOtherItem(newProduct);
        createArrayItem(newProduct);
        setProductName("");
        setProductType(" "); // Limpiar el estado productType después de enviar el formulario

    };

    return (
        <form className="flex flex-col items-center justify-around w-6/6" onSubmit={handleSubmit}>

            <div className="border-b-2 border-emerald-600  w-4/6 flex flex-col ">
                <div className="border-b-2 border-emerald-600 my-7 ">

                    <label className="text-sm" htmlFor="productName">
                        Producto:
                    </label>
                    <input
                        className="focus:outline-none focus:border-transparent "
                        type="text"
                        id="productName"
                        value={productName}
                        onChange={handleNameChange}
                    />
                </div>

                <select name="productType" id="productType" onChange={handleTypeChange}>


                    <option
                        value="">--selecciona categoria --</option>
                    {itemCategories.map(category => (

                        <option
                            key={category}
                            value={category}>{category}</option>

                    ))}


                </select>

            </div>

            <button className="text-sm rounded-lg  w-2/6 p-2  my-7 bg-emerald-400" type="submit">
                Guardar
            </button>
        </form >
    );
};

export default FormProductCustom;
