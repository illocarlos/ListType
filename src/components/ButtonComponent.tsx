import { useState } from 'react';

type ListButtonProps = {
    type: string,
    filterFunction: (filteredItems: string) => void
};

const ButtonComponent = ({ filterFunction, type }: ListButtonProps) => {
    const [activeButton, setActiveButton] = useState<string | null>(null);

    const handleClick = () => {
        // Desactivar la clase del botón anterior si estaba activo
        if (activeButton) {
            const prevActiveButton = document.querySelector(`button[type="${activeButton}"]`);
            if (prevActiveButton) {
                prevActiveButton.classList.remove('border-green-500');
            }
        }

        // Activar o desactivar la clase del botón actual
        setActiveButton(prevActiveButton => (prevActiveButton === type ? null : type));
        filterFunction(type);
    };

    return (
        <button
            className={`uppercase border-b-4 mx-3 border-black ${type === activeButton ? 'border-green-500 transition-all duration-300 ease-in-out' : 'transition-all duration-700 ease-in-out'}`}
            style={{ backgroundPosition: type === activeButton ? '0 100%' : '100% 100%' }}
            onClick={handleClick}
        >
            {type}
        </button>
    );
};

export default ButtonComponent;
