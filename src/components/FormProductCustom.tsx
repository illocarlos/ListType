import { useState } from "react";
import type { listItem } from "../types/types";

interface FormProps {
    setShowNewProduct: (show: boolean) => void;
    addOtherItem: (filteredItems: listItem) => void;
    createArrayItem: (pushFIlter: listItem) => void;
    itemCategories: string[];
    initialName?: string;
}

const FormProductCustom: React.FC<FormProps> = ({ addOtherItem, setShowNewProduct, createArrayItem, itemCategories, initialName = "" }) => {
    // Estados para almacenar el nombre y la categoría del producto
    const [productName, setProductName] = useState<string>(initialName);
    const [productType, setProductType] = useState<string>("");
    const [error, setError] = useState<string>("");

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
            type: productType,
            source: "manual",
        };

        if (newProduct.name.length < 2 || !newProduct.type) {
            setError("nita por favor, el producto tiene que tener al menos 2 letras y una categoría");
            return;
        }

        addOtherItem(newProduct);
        createArrayItem(newProduct);
        setProductName("");
        setProductType("");
        setError("");
        setShowNewProduct(false);
    };

    return (
        <form className="flex flex-col gap-4 p-4" onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-1">
                <label className="text-sm font-semibold" htmlFor="productName">Nombre</label>
                <input
                    className="h-12 rounded-md border-2 border-border-input bg-surface px-3 text-base focus:border-accent focus:outline-none"
                    type="text"
                    id="productName"
                    autoComplete="off"
                    value={productName}
                    onChange={event => setProductName(event.target.value)}
                    placeholder="Por ejemplo: pan de pueblo"
                />
            </div>

            <div className="flex flex-col gap-1">
                <label className="text-sm font-semibold" htmlFor="productType">Categoría</label>
                <select
                    name="productType"
                    id="productType"
                    value={productType}
                    onChange={event => setProductType(event.target.value)}
                    className="h-12 rounded-md border-2 border-border-input bg-surface px-3 text-base capitalize focus:border-accent focus:outline-none"
                >
                    <option value="">Elige una categoría</option>
                    {itemCategories.map(category => (
                        <option key={category} value={category}>{category}</option>
                    ))}
                </select>
            </div>

            {error && <p role="alert" className="text-sm text-danger">{error}</p>}

            <button className="h-12 rounded-md bg-accent text-on-accent font-semibold hover:bg-accent-strong" type="submit">
                Guardar y añadir a la lista
            </button>
        </form>
    );
};

export default FormProductCustom;
