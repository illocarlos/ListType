import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, RefreshCw } from "lucide-react";
import { fetchAisle, MercadonaError, mercadonaDetail, toListItem } from "../helpers/mercadona";
import type { LoadState } from "../hooks/useMercadona";
import type { listItem, MercadonaAisle, MercadonaGroup, MercadonaProduct } from "../types/types";
import ProductRow from "./ProductRow";

type MercadonaCatalogProps = {
    wh: string,
    groups: MercadonaGroup[],
    groupsState: LoadState,
    groupsError: string,
    onRetryGroups: () => void,
    onChangeWarehouse: (code: string) => boolean,
    quantityOf: (id: number) => number,
    onAdd: (item: listItem) => void,
    onDecrease: (item: listItem) => void,
}

const errorMessage = (error: unknown) =>
    error instanceof MercadonaError ? error.message : "No se ha podido cargar el pasillo.";

// Explorar Mercadona por pasillos (alternativa al buscador)
const MercadonaCatalog = ({ wh, groups, groupsState, groupsError, onRetryGroups, onChangeWarehouse, quantityOf, onAdd, onDecrease }: MercadonaCatalogProps) => {
    const [openGroupId, setOpenGroupId] = useState<number | null>(null);
    const [aisle, setAisle] = useState<MercadonaAisle | null>(null);
    const [products, setProducts] = useState<MercadonaProduct[]>([]);
    const [productsState, setProductsState] = useState<LoadState>("idle");
    const [productsError, setProductsError] = useState<string>("");
    const [editingWh, setEditingWh] = useState<boolean>(false);
    const [whDraft, setWhDraft] = useState<string>(wh);
    const [whError, setWhError] = useState<string>("");

    const openAisle = async (selected: MercadonaAisle, force = false) => {
        setAisle(selected);
        setProducts([]);
        setProductsState("loading");
        try {
            setProducts(await fetchAisle(wh, selected.id, selected.name, force));
            setProductsState("ready");
        } catch (error) {
            setProductsError(errorMessage(error));
            setProductsState("error");
        }
    };

    const sections = useMemo(() => {
        const map = new Map<string, MercadonaProduct[]>();
        for (const product of products) {
            const list = map.get(product.subcategory) ?? [];
            list.push(product);
            map.set(product.subcategory, list);
        }
        return [...map.entries()];
    }, [products]);

    const saveWarehouse = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!onChangeWarehouse(whDraft)) {
            setWhError("Solo letras y números, por ejemplo svq1.");
            return;
        }
        setWhError("");
        setEditingWh(false);
        setAisle(null);
        setProducts([]);
    };

    return (
        <section aria-labelledby="explore-title" className="mt-8">
            <div className="flex items-baseline justify-between gap-3 mb-3">
                <h2 id="explore-title" className="text-lg font-bold">Pasillos de Mercadona</h2>
                <button type="button" className="text-sm text-accent underline underline-offset-2" onClick={() => setEditingWh(!editingWh)}>
                    Almacén {wh.toUpperCase()}
                </button>
            </div>

            {editingWh && (
                <form onSubmit={saveWarehouse} className="mb-4 rounded-md bg-surface p-3 flex flex-col gap-2">
                    <label htmlFor="warehouse" className="text-sm font-semibold">Código de almacén (decide los precios)</label>
                    <div className="flex gap-2">
                        <input
                            id="warehouse"
                            value={whDraft}
                            onChange={event => setWhDraft(event.target.value)}
                            className="h-11 flex-1 rounded-md border-2 border-border-input px-3 focus:border-accent focus:outline-none"
                        />
                        <button type="submit" className="h-11 px-4 rounded-md bg-accent text-on-accent font-semibold">Guardar</button>
                    </div>
                    {whError && <p role="alert" className="text-sm text-danger">{whError}</p>}
                </form>
            )}

            {aisle ? (
                <div>
                    <button
                        type="button"
                        onClick={() => { setAisle(null); setProducts([]); }}
                        className="mb-3 inline-flex items-center gap-1 h-11 pr-3 text-sm font-semibold text-accent"
                    >
                        <ChevronLeft size={18} aria-hidden="true" /> Todos los pasillos
                    </button>
                    <h3 className="text-xl font-bold mb-3">{aisle.name}</h3>

                    {productsState === "loading" && (
                        <ul className="space-y-2" aria-busy="true">
                            {Array.from({ length: 5 }).map((_, index) => (
                                <li key={index} className="h-[72px] rounded-md bg-surface-sunk animate-pulse" />
                            ))}
                        </ul>
                    )}

                    {productsState === "error" && (
                        <div className="rounded-md bg-surface p-4">
                            <p className="text-sm">{productsError}</p>
                            <button type="button" onClick={() => openAisle(aisle, true)} className="mt-3 inline-flex items-center gap-2 h-11 px-4 rounded-md bg-accent-soft text-on-accent-soft font-semibold">
                                <RefreshCw size={16} aria-hidden="true" /> Reintentar
                            </button>
                        </div>
                    )}

                    {productsState === "ready" && products.length === 0 && (
                        <p className="text-sm text-muted">Este pasillo no tiene productos ahora mismo.</p>
                    )}

                    {productsState === "ready" && sections.map(([subcategory, list]) => (
                        <div key={subcategory} className="mb-6">
                            <h4 className="text-sm font-semibold text-muted mb-2">{subcategory}</h4>
                            <ul className="space-y-2">
                                {list.map(product => {
                                    const item = toListItem(product);
                                    return (
                                        <ProductRow
                                            key={product.mercadonaId}
                                            item={item}
                                            detail={mercadonaDetail(product)}
                                            previousPrice={product.previousPrice}
                                            quantity={quantityOf(item.id)}
                                            onAdd={onAdd}
                                            onDecrease={onDecrease}
                                        />
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>
            ) : (
                <div>
                    {groupsState === "loading" && (
                        <ul className="space-y-2" aria-busy="true">
                            {Array.from({ length: 6 }).map((_, index) => (
                                <li key={index} className="h-12 rounded-md bg-surface-sunk animate-pulse" />
                            ))}
                        </ul>
                    )}

                    {groupsState === "error" && (
                        <div className="rounded-md bg-surface p-4">
                            <p className="text-sm">{groupsError}</p>
                            <button type="button" onClick={onRetryGroups} className="mt-3 inline-flex items-center gap-2 h-11 px-4 rounded-md bg-accent-soft text-on-accent-soft font-semibold">
                                <RefreshCw size={16} aria-hidden="true" /> Reintentar
                            </button>
                        </div>
                    )}

                    {groupsState === "ready" && (
                        <ul className="rounded-md bg-surface divide-y divide-border">
                            {groups.map(group => {
                                const open = openGroupId === group.id;
                                return (
                                    <li key={group.id}>
                                        <button
                                            type="button"
                                            aria-expanded={open}
                                            onClick={() => setOpenGroupId(open ? null : group.id)}
                                            className="w-full min-h-[48px] px-4 flex items-center justify-between gap-3 text-left font-semibold"
                                        >
                                            <span>{group.name}</span>
                                            <ChevronDown size={18} aria-hidden="true" className={`flex-none transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
                                        </button>
                                        {open && (
                                            <div className="px-4 pb-4 flex flex-wrap gap-2">
                                                {group.aisles.map(item => (
                                                    <button
                                                        key={item.id}
                                                        type="button"
                                                        onClick={() => openAisle(item)}
                                                        className="h-9 px-4 rounded-pill border border-border bg-bg text-sm hover:border-accent"
                                                    >
                                                        {item.name}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
        </section>
    );
};

export default MercadonaCatalog;
