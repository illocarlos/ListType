import{ useState } from "react";
import { uid } from "uid";
import type { listItem } from "../types/types"

interface FormProps {
    addOtherItem: (filteredItems: listItem) => void

}

const FormProductCustom: React.FC<FormProps> = ({ addOtherItem }) => {
    // Estados para almacenar el nombre y el precio del producto
    const [productName, setProductName] = useState<string>("");

    // Funciones para manejar cambios en los campos de entrada
    const handleNameChange = (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        setProductName(event.target.value);
    };



    function generateNumericId(): number {
        const alphanumericId = uid(60); // Generar un identificador único alfanumérico
        const numericId = parseInt(alphanumericId.replace(/\D/g, ""), 20); // Extraer solo los dígitos numéricos y convertirlos a un número
        return numericId;
    }

    // Función para manejar el envío del formulario
    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        // Crear un nuevo objeto de producto con los datos del formulario
        const newProduct: listItem = {
            id: generateNumericId(), // Generar un id único
            name: productName.trim().replace(/[.;,]/g, "").toLowerCase(),
            price: 0,
            type: 'other'
        };

        newProduct.name.length < 2 ? setProductName("") : addOtherItem(newProduct)

        setProductName("")
            // Limpia los campos después de enviar el formulario
            ;

    };

    return (
        <form onSubmit={handleSubmit}>
            <div>
                <label htmlFor="productName">Nombre del Producto:</label>
                <input
                    type="text"
                    id="productName"
                    value={productName}
                    onChange={handleNameChange}
                />
            </div>


            <button type="submit">Guardar Producto</button>
        </form>
    );
};

export default FormProductCustom;
