type ListButtonProps = {
    type: string,
    isActive: boolean,
    filterFunction: (filteredItems: string) => void
};

// Chip de categoría (pasillo de Mercadona de los favoritos). El estado activo lo lleva App: solo hay una marcada a la vez
const ButtonComponent = ({ filterFunction, type, isActive }: ListButtonProps) => {
    return (
        <button
            type="button"
            aria-pressed={isActive}
            onClick={() => filterFunction(type)}
            className={`flex-none h-9 px-4 rounded-pill border text-sm font-medium transition-colors duration-200 ${isActive
                ? "bg-accent border-accent text-on-accent"
                : "bg-surface border-border text-text hover:border-accent"}`}
        >
            {type}
        </button>
    );
};

export default ButtonComponent;
