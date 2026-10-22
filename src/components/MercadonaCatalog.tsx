import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, RefreshCw } from "lucide-react";
import { fetchAisle, MercadonaError, mercadonaDetail, toListItem } from "../helpers/mercadona";
import type { LoadState } from "../hooks/useMercadona";
import type { listItem, MercadonaAisle, MercadonaGroup, MercadonaProduct } from "../types/types";
import ProductRow from "./ProductRow";
import Collapsible from "./Collapsible";

type MercadonaCatalogProps = {
    wh: string,
    groups: MercadonaGroup[],
    groupsState: LoadState,
    groupsError: string,
    onRetryGroups: () => void,
    quantityOf: (id: number) => number,
    onAdd: (item: listItem) => void,
    onDecrease: (item: listItem) => void,
    isFavorite: (id: number) => boolean,
    onToggleFavorite: (item: listItem) => void,
    onOpenDetails?: (item: listItem) => void,
    onProductsLoaded?: (products: MercadonaProduct[]) => void,
}

const errorMessage = (error: unknown) =>
    error instanceof MercadonaError ? error.message : "No se ha podido cargar el pasillo.";

// Explorar Mercadona por pasillos (alternativa al buscador)
const MercadonaCatalog = ({ wh, groups, groupsState, groupsError, onRetryGroups, quantityOf, onAdd, onDecrease, isFavorite, onToggleFavorite, onOpenDetails, onProductsLoaded }: MercadonaCatalogProps) => {
    const [openGroupId, setOpenGroupId] = useState<number | null>(null);
    const [aisle, setAisle] = useState<MercadonaAisle | null>(null);
    const [products, setProducts] = useState<MercadonaProduct[]>([]);
    const [productsState, setProductsState] = useState<LoadState>("idle");
    const [productsError, setProductsError] = useState<string>("");

    const openAisle = async (selected: MercadonaAisle, force = false) => {
        setAisle(selected);
        setProducts([]);
        setProductsState("loading");
        try {
            const loaded = await fetchAisle(wh, selected.id, selected.name, force);
            setProducts(loaded);
            onProductsLoaded?.(loaded);
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

    return (
        <section aria-labelledby="explore-title">
            <h2 id="explore-title" className="text-lg font-bold mb-3">Pasillos de Mercadona</h2>

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

                    {/* Subcategorías plegables: con una sola, abierta directamente */}
                    {productsState === "ready" && products.length > 0 && (
                        <div className="space-y-2">
                    {sections.map(([subcategory, list]) => (
                        <Collapsible key={`${aisle.id}-${subcategory}`} title={subcategory} count={list.length} defaultOpen={sections.length === 1}>
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
                                            favorite={isFavorite(item.id)}
                                            onToggleFavorite={onToggleFavorite}
                                            onOpenDetails={onOpenDetails}
                                        />
                                    );
                                })}
                            </ul>
                        </Collapsible>
                    ))}
                        </div>
                    )}
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
                                                        className="h-11 px-4 rounded-pill border border-border bg-bg text-base hover:border-accent"
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
