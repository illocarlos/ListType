import { useEffect, useId, useRef, useState } from "react";
import { Store } from "lucide-react";
import type { listItem } from "../types/types";

type AddStoreProductProps = {
    id: string,
    favorites: listItem[],
    // Ids ya usados (favoritos y lista) para que el nuevo no coincida con ninguno
    takenIds: Set<number>,
    onSave: (item: listItem) => void,
    onCancel: () => void,
};

// Tiendas que se sugieren al escribir (más las que ya se hayan usado)
const COMMON_STORES = ["Lidl", "Carrefour", "Dia", "Aldi", "Alcampo", "Eroski", "Consum", "Ahorramás", "Frutería", "Panadería", "Carnicería", "Pescadería", "Mercado"];
const DEFAULT_STORE = "Otra tienda";

type FieldError = { field: "name" | "price", text: string } | null;

// "2,40", "2.40", "2,4 €" → 2.4; vacío → 0 (sin precio); otra cosa → null
function parsePrice(text: string): number | null {
    const clean = text.trim().replace(/€/g, "").replace(/\s+/g, "").replace(",", ".");
    if (!clean) return 0;
    if (!/^\d{1,4}(\.\d{1,2})?$/.test(clean)) return null;
    return Math.round(Number(clean) * 100) / 100;
}

const tidy = (text: string, max: number) => text.trim().replace(/\s+/g, " ").slice(0, max);

// Favorito de otro supermercado o tienda: nombre, tienda y precio aproximado (opcional).
// Se guarda como producto apuntado a mano (sin foto ni ficha); la tienda hace de categoría en los favoritos.
const AddStoreProduct = ({ id, favorites, takenIds, onSave, onCancel }: AddStoreProductProps) => {
    const [name, setName] = useState<string>("");
    const [store, setStore] = useState<string>("");
    const [price, setPrice] = useState<string>("");
    const [error, setError] = useState<FieldError>(null);
    const nameRef = useRef<HTMLInputElement>(null);
    const priceRef = useRef<HTMLInputElement>(null);
    const ids = { title: useId(), name: useId(), store: useId(), stores: useId(), price: useId(), error: useId(), help: useId() };

    useEffect(() => {
        nameRef.current?.focus();
    }, []);

    const usedStores = favorites
        .map(item => item.store)
        .filter((value): value is string => Boolean(value) && value !== DEFAULT_STORE);
    const suggestions = [...new Set([...usedStores, ...COMMON_STORES])];

    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const cleanName = tidy(name, 80);
        if (cleanName.length < 2) {
            setError({ field: "name", text: "Escribe el nombre del producto." });
            nameRef.current?.focus();
            return;
        }
        const value = parsePrice(price);
        if (value === null) {
            setError({ field: "price", text: "Escribe el precio con números, por ejemplo 2,40 (o déjalo vacío)." });
            priceRef.current?.focus();
            return;
        }
        const cleanStore = tidy(store, 40) || DEFAULT_STORE;
        const duplicate = favorites.some(item => !item.mercadonaId
            && item.name.toLocaleLowerCase("es") === cleanName.toLocaleLowerCase("es")
            && (item.store ?? "").toLocaleLowerCase("es") === cleanStore.toLocaleLowerCase("es"));
        if (duplicate) {
            setError({ field: "name", text: `Ya tienes «${cleanName}» de ${cleanStore} en favoritos.` });
            nameRef.current?.focus();
            return;
        }
        // Mismo tipo de id que lo apuntado a mano; los de Mercadona van muy por encima (no pueden coincidir)
        let newId: number;
        do {
            newId = Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000;
        } while (takenIds.has(newId));
        onSave({ id: newId, name: cleanName, type: cleanStore, store: cleanStore, price: value, source: "manual" });
    };

    const fieldClass = "mt-1 h-12 w-full rounded-md border-2 border-border-input bg-surface px-3 text-base focus:border-accent focus:outline-none";

    return (
        <form
            id={id}
            onSubmit={submit}
            onKeyDown={event => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    onCancel();
                }
            }}
            noValidate
            aria-labelledby={ids.title}
            className="mb-4 rounded-md border-2 border-accent bg-surface p-4"
        >
            <h3 id={ids.title} className="flex items-center gap-2 text-lg font-bold">
                <Store size={22} aria-hidden="true" className="flex-none text-accent" />
                Producto de otra tienda
            </h3>
            <p id={ids.help} className="mt-1 text-sm text-muted">Se guarda en tus favoritos, sin foto. La tienda y el precio son opcionales.</p>

            <label htmlFor={ids.name} className="mt-3 block text-base font-semibold">Nombre del producto</label>
            <input
                ref={nameRef}
                id={ids.name}
                type="text"
                value={name}
                onChange={event => setName(event.target.value)}
                maxLength={80}
                autoComplete="off"
                autoCapitalize="sentences"
                enterKeyHint="next"
                placeholder="Por ejemplo: Yogur griego"
                aria-invalid={error?.field === "name" ? true : undefined}
                aria-describedby={error?.field === "name" ? ids.error : ids.help}
                className={fieldClass}
            />

            <label htmlFor={ids.store} className="mt-3 block text-base font-semibold">Tienda</label>
            <input
                id={ids.store}
                type="text"
                value={store}
                onChange={event => setStore(event.target.value)}
                list={ids.stores}
                maxLength={40}
                autoComplete="off"
                autoCapitalize="words"
                enterKeyHint="next"
                placeholder="Por ejemplo: Lidl"
                className={fieldClass}
            />
            <datalist id={ids.stores}>
                {suggestions.map(option => <option key={option} value={option} />)}
            </datalist>

            <label htmlFor={ids.price} className="mt-3 block text-base font-semibold">Precio aproximado</label>
            <input
                ref={priceRef}
                id={ids.price}
                type="text"
                inputMode="decimal"
                value={price}
                onChange={event => setPrice(event.target.value)}
                maxLength={10}
                autoComplete="off"
                enterKeyHint="done"
                placeholder="Por ejemplo: 2,40"
                aria-invalid={error?.field === "price" ? true : undefined}
                aria-describedby={error?.field === "price" ? ids.error : undefined}
                className={`${fieldClass} tabular`}
            />

            {error && <p id={ids.error} role="alert" className="mt-2 text-base font-semibold text-danger">{error.text}</p>}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                    type="submit"
                    className="h-12 flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 text-on-accent text-base font-semibold hover:bg-accent-strong"
                >
                    Guardar en favoritos
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="h-12 flex-1 rounded-md border border-border bg-surface px-4 text-base font-semibold hover:bg-surface-sunk"
                >
                    Cancelar
                </button>
            </div>
        </form>
    );
};

export default AddStoreProduct;
