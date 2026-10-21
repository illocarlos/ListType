import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatCurrency } from "../helpers/formatPrice";
import {
    fetchAisle,
    fetchGroups,
    getCachedProducts,
    getWarehouse,
    indexAllAisles,
    MercadonaError,
    normalizeText,
    setWarehouse,
    toListItem,
} from "../helpers/mercadona";
import type { IndexProgress } from "../helpers/mercadona";
import type { listItem, MercadonaAisle, MercadonaGroup, MercadonaProduct } from "../types/types";

type MercadonaCatalogProps = {
    onAdd: (item: listItem) => void
}

type LoadState = "idle" | "loading" | "ready" | "error";
type IndexState = "idle" | "running" | "done" | "stopped";

const errorMessage = (error: unknown) =>
    error instanceof MercadonaError ? error.message : "No se ha podido cargar el catálogo de Mercadona.";

const ProductCard = ({ product, onAdd, justAdded }: { product: MercadonaProduct, onAdd: (product: MercadonaProduct) => void, justAdded: boolean }) => (
    <button
        type="button"
        onClick={() => onAdd(product)}
        className={`relative flex flex-col items-center text-center rounded-sm border-2 p-2 transition-all ease-linear focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${justAdded ? "border-emerald-600 bg-emerald-100" : "border-teal-500 hover:bg-teal-200"}`}
    >
        {product.image ? (
            <img
                src={product.image}
                alt={product.name}
                loading="lazy"
                className="h-24 w-24 object-contain bg-white"
            />
        ) : (
            <div className="h-24 w-24 bg-gray-100" aria-hidden="true" />
        )}
        <span className="mt-1 text-sm font-extrabold uppercase leading-tight line-clamp-2">{product.name}</span>
        {product.packaging && <span className="text-xs text-gray-600">{product.packaging}</span>}
        <span className="mt-1 text-base font-extrabold text-emerald-900">
            {formatCurrency(product.price)}
            {product.previousPrice !== null && (
                <span className="ml-1 text-xs font-normal text-gray-500 line-through">{formatCurrency(product.previousPrice)}</span>
            )}
        </span>
        {product.unitPrice && <span className="text-xs text-gray-600">{product.unitPrice}</span>}
        {justAdded && (
            <span className="absolute top-1 right-1 rounded-full bg-emerald-600 px-2 text-xs font-bold text-white">añadido</span>
        )}
    </button>
);

const MercadonaCatalog = ({ onAdd }: MercadonaCatalogProps) => {
    const [wh, setWh] = useState<string>(() => getWarehouse());
    const [whDraft, setWhDraft] = useState<string>(wh);
    const [showWhEditor, setShowWhEditor] = useState<boolean>(false);

    const [groups, setGroups] = useState<MercadonaGroup[]>([]);
    const [groupsState, setGroupsState] = useState<LoadState>("idle");
    const [groupsError, setGroupsError] = useState<string>("");
    const [openGroupId, setOpenGroupId] = useState<number | null>(null);

    const [aisle, setAisle] = useState<MercadonaAisle | null>(null);
    const [products, setProducts] = useState<MercadonaProduct[]>([]);
    const [productsState, setProductsState] = useState<LoadState>("idle");
    const [productsError, setProductsError] = useState<string>("");

    const [query, setQuery] = useState<string>("");
    const [lastAdded, setLastAdded] = useState<string | null>(null);

    // Buscador: todos los productos cargados en memoria + carga de los pasillos que falten
    const [searchPool, setSearchPool] = useState<Map<string, MercadonaProduct>>(() => new Map());
    const [indexState, setIndexState] = useState<IndexState>("idle");
    const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null);
    const cancelledRef = useRef<boolean>(false);

    const loadGroups = useCallback(async (force = false) => {
        setGroupsState("loading");
        try {
            setGroups(await fetchGroups(wh, force));
            setGroupsState("ready");
        } catch (error) {
            setGroupsError(errorMessage(error));
            setGroupsState("error");
        }
    }, [wh]);

    useEffect(() => {
        loadGroups();
    }, [loadGroups]);

    // Si se cierra el panel, se para la carga del buscador
    useEffect(() => {
        cancelledRef.current = false;
        return () => {
            cancelledRef.current = true;
        };
    }, []);

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

    useEffect(() => {
        if (!lastAdded) return;
        const timer = window.setTimeout(() => setLastAdded(null), 1200);
        return () => window.clearTimeout(timer);
    }, [lastAdded]);

    const handleAdd = (product: MercadonaProduct) => {
        onAdd(toListItem(product));
        setLastAdded(product.mercadonaId);
    };

    const startIndexing = useCallback(() => {
        cancelledRef.current = false;
        setSearchPool(new Map(getCachedProducts(wh).map(product => [product.mercadonaId, product])));
        setIndexState("running");
        indexAllAisles(
            wh,
            groups,
            loaded => setSearchPool(previous => {
                const next = new Map(previous);
                for (const product of loaded) next.set(product.mercadonaId, product);
                return next;
            }),
            setIndexProgress,
            () => cancelledRef.current
        ).then(result => {
            if (cancelledRef.current) return;
            setIndexState(result.done === result.total && result.failed === 0 ? "done" : "stopped");
        });
    }, [wh, groups]);

    const isSearching = normalizeText(query.trim()).length >= 2;

    // La primera búsqueda pone en marcha la carga del catálogo completo
    useEffect(() => {
        if (isSearching && groupsState === "ready" && indexState === "idle") {
            startIndexing();
        }
    }, [isSearching, groupsState, indexState, startIndexing]);

    const handleSaveWarehouse = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!setWarehouse(whDraft)) {
            alert("El código de almacén solo puede llevar letras y números (por ejemplo: svq1).");
            return;
        }
        const clean = whDraft.trim().toLowerCase();
        cancelledRef.current = true;
        setWh(clean);
        setWhDraft(clean);
        setShowWhEditor(false);
        setAisle(null);
        setProducts([]);
        setSearchPool(new Map());
        setIndexProgress(null);
        setIndexState("idle");
    };

    const searchResults = useMemo(() => {
        const term = normalizeText(query.trim());
        if (term.length < 2) return [];
        const words = term.split(/\s+/).filter(Boolean);
        const pool = new Map(searchPool);
        for (const product of products) pool.set(product.mercadonaId, product);

        const scored: { product: MercadonaProduct, score: number }[] = [];
        for (const product of pool.values()) {
            const name = normalizeText(product.name);
            if (!words.every(word => name.includes(word))) continue;
            const score = name.startsWith(term) ? 0 : name.includes(term) ? 1 : 2;
            scored.push({ product, score });
        }
        return scored
            .sort((a, b) => a.score - b.score || a.product.name.localeCompare(b.product.name, "es"))
            .slice(0, 60)
            .map(item => item.product);
    }, [query, searchPool, products]);

    const productsBySubcategory = useMemo(() => {
        const sections = new Map<string, MercadonaProduct[]>();
        for (const product of products) {
            const list = sections.get(product.subcategory) ?? [];
            list.push(product);
            sections.set(product.subcategory, list);
        }
        return [...sections.entries()];
    }, [products]);

    const indexing = indexState === "running";
    const progressPercent = indexProgress && indexProgress.total > 0
        ? Math.round((indexProgress.done / indexProgress.total) * 100)
        : 0;

    return (
        <section className="px-2 py-5" aria-label="Catálogo de Mercadona">

            <div className="flex flex-row items-center justify-between text-xs text-gray-600 mb-3">
                <span>Precios del almacén <strong className="uppercase">{wh}</strong></span>
                <button
                    type="button"
                    className="underline"
                    onClick={() => setShowWhEditor(!showWhEditor)}
                >
                    {showWhEditor ? "cerrar" : "cambiar"}
                </button>
            </div>

            {showWhEditor && (
                <form onSubmit={handleSaveWarehouse} className="flex flex-row gap-2 mb-4">
                    <label className="sr-only" htmlFor="warehouse">Código de almacén</label>
                    <input
                        id="warehouse"
                        value={whDraft}
                        onChange={event => setWhDraft(event.target.value)}
                        className="flex-1 border-b-2 border-emerald-600 focus:outline-none"
                        placeholder="svq1"
                    />
                    <button type="submit" className="bg-emerald-400 px-3 text-sm font-bold">Guardar</button>
                </form>
            )}

            <label className="sr-only" htmlFor="mercadonaSearch">Buscar en Mercadona</label>
            <input
                id="mercadonaSearch"
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Buscar en Mercadona"
                className="w-full border-2 border-emerald-600 p-2 mb-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            />

            {isSearching ? (
                <div>
                    {groupsState === "loading" && <p className="text-center text-sm mb-3">Cargando pasillos…</p>}

                    {groupsState === "error" && (
                        <div className="text-center mb-4">
                            <p className="mb-3">{groupsError}</p>
                            <button type="button" className="bg-emerald-200 p-2 font-extrabold" onClick={() => loadGroups(true)}>
                                Reintentar
                            </button>
                        </div>
                    )}

                    {indexing && indexProgress && (
                        <div className="mb-4" role="status" aria-live="polite">
                            <p className="text-xs text-gray-600 mb-1">
                                Preparando el buscador: {indexProgress.done} de {indexProgress.total} pasillos. Solo pasa una vez al día.
                            </p>
                            <div className="h-2 w-full bg-emerald-100">
                                <div className="h-2 bg-emerald-600 transition-all" style={{ width: `${progressPercent}%` }} />
                            </div>
                        </div>
                    )}

                    {indexState === "stopped" && indexProgress && (
                        <div className="mb-4 text-xs text-gray-600 flex flex-row items-center justify-between gap-2">
                            <span>
                                No se han podido cargar {indexProgress.total - indexProgress.done + indexProgress.failed} pasillos: puede faltar algún producto.
                            </span>
                            <button type="button" className="underline flex-none" onClick={startIndexing}>
                                reintentar
                            </button>
                        </div>
                    )}

                    {searchResults.length === 0 ? (
                        <p className="text-center text-sm">
                            {indexing || groupsState === "loading"
                                ? "Buscando…"
                                : `No hay nada en Mercadona que coincida con «${query.trim()}».`}
                        </p>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            {searchResults.map(product => (
                                <ProductCard
                                    key={product.mercadonaId}
                                    product={product}
                                    onAdd={handleAdd}
                                    justAdded={lastAdded === product.mercadonaId}
                                />
                            ))}
                        </div>
                    )}
                </div>
            ) : aisle ? (
                <div>
                    <div className="flex flex-row items-center justify-between mb-4">
                        <button
                            type="button"
                            onClick={() => { setAisle(null); setProducts([]); }}
                            className="uppercase font-extrabold text-sm"
                        >
                            ← pasillos
                        </button>
                        <h3 className="uppercase font-extrabold text-lg text-right">{aisle.name}</h3>
                    </div>

                    {productsState === "loading" && (
                        <div className="grid grid-cols-2 gap-3" aria-busy="true">
                            {Array.from({ length: 6 }).map((_, index) => (
                                <div key={index} className="h-48 animate-pulse bg-gray-100" />
                            ))}
                        </div>
                    )}

                    {productsState === "error" && (
                        <div className="text-center">
                            <p className="mb-3">{productsError}</p>
                            <button type="button" className="bg-emerald-200 p-2 font-extrabold" onClick={() => openAisle(aisle, true)}>
                                Reintentar
                            </button>
                        </div>
                    )}

                    {productsState === "ready" && products.length === 0 && (
                        <p className="text-center">Este pasillo no tiene productos ahora mismo.</p>
                    )}

                    {productsState === "ready" && productsBySubcategory.map(([subcategory, list]) => (
                        <div key={subcategory} className="mb-6">
                            <h4 className="uppercase font-bold text-sm border-b-2 border-emerald-400 mb-3">{subcategory}</h4>
                            <div className="grid grid-cols-2 gap-3">
                                {list.map(product => (
                                    <ProductCard
                                        key={product.mercadonaId}
                                        product={product}
                                        onAdd={handleAdd}
                                        justAdded={lastAdded === product.mercadonaId}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div>
                    {groupsState === "loading" && (
                        <div className="space-y-2" aria-busy="true">
                            {Array.from({ length: 8 }).map((_, index) => (
                                <div key={index} className="h-8 animate-pulse bg-gray-100" />
                            ))}
                        </div>
                    )}

                    {groupsState === "error" && (
                        <div className="text-center">
                            <p className="mb-3">{groupsError}</p>
                            <button type="button" className="bg-emerald-200 p-2 font-extrabold" onClick={() => loadGroups(true)}>
                                Reintentar
                            </button>
                        </div>
                    )}

                    {groupsState === "ready" && (
                        <ul className="divide-y-2 divide-emerald-100">
                            {groups.map(group => (
                                <li key={group.id}>
                                    <button
                                        type="button"
                                        aria-expanded={openGroupId === group.id}
                                        onClick={() => setOpenGroupId(openGroupId === group.id ? null : group.id)}
                                        className="w-full flex flex-row justify-between py-2 uppercase font-extrabold text-left"
                                    >
                                        <span>{group.name}</span>
                                        <span aria-hidden="true">{openGroupId === group.id ? "−" : "+"}</span>
                                    </button>
                                    {openGroupId === group.id && (
                                        <div className="grid grid-cols-2 gap-2 pb-3">
                                            {group.aisles.map(item => (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    onClick={() => openAisle(item)}
                                                    className="border-2 border-teal-500 p-2 text-sm uppercase hover:bg-teal-200 text-left"
                                                >
                                                    {item.name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </section>
    );
};

export default MercadonaCatalog;
