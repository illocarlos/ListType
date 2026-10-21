type ListButtonProps = {
    type: string,
    isActive: boolean,
    filterFunction: (filteredItems: string) => void
};

const ButtonComponent = ({ filterFunction, type, isActive }: ListButtonProps) => {

    // El estado activo lo lleva App: así solo hay una categoría marcada a la vez
    const handleClick = () => {
        filterFunction(type);
    };

    return (
        <button
            className={`uppercase border-b-4 mx-3 border-black ${isActive ? 'border-green-500 transition-all duration-300 ease-in-out' : 'transition-all duration-700 ease-in-out'}`}
            style={{ backgroundPosition: isActive ? '0 100%' : '100% 100%' }}
            aria-pressed={isActive}
            onClick={handleClick}
        >
            {type}
        </button>
    );
};

export default ButtonComponent;
