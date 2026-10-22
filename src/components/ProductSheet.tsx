import { useEffect, useState } from "react";
import { AlertTriangle, Plus, RefreshCw } from "lucide-react";
import { formatCurrency } from "../helpers/formatPrice";
import { fetchProductDetail, fetchSimilars, largeImageUrl, mercadonaDetail, MercadonaError, toListItem } from "../helpers/mercadona";
import type { ProductDetail } from "../helpers/mercadona";
import type { PricePoint } from "../hooks/usePriceHistory";
import type { listItem, MercadonaProduct } from "../types/types";
import ProductRow from "./ProductRow";

type ProductSheetProps = {
    wh: string,
    item: listItem,
    quantityOf: (id: number) => number,
    onAdd: (item: listItem) => void,
    onDecrease: (item: listItem) => void,
    isFavorite: (id: number) => boolean,
    onToggleFavorite: (item: listItem) => void,
    history: PricePoint[],
}

type LoadState = "loading" | "ready" | "error";

const dayLabel = (day: number) =>
    new Date(day * 86_400_000).toLocaleDateString("es-ES", { day: "numeric", month: "short" });

// Contenido de la ficha: se pide a Mercadona solo al abrirla
const ProductSheet = ({ wh, item, quantityOf, onAdd, onDecrease, isFavorite, onToggleFavorite, history }: ProductSheetProps) => {
    const id = item.mercadonaId ?? "";
    const [detail, setDetail] = useState<ProductDetail | null>(null);
    const [detailState, setDetailState] = useState<LoadState>("loading");
    const [detailError, setDetailError] = useState<string>("");
    const [cheaper, setCheaper] = useState<MercadonaProduct[]>([]);
    const [similarState, setSimilarState] = useState<LoadState>("loading");
    const [attempt, setAttempt] = useState<number>(0);

    useEffect(() => {
        let cancelled = false;
        setDetailState("loading");
        fetchProductDetail(wh, id)
            .then(result => {
                if (cancelled) return;
                setDetail(result);
                setDetailState("ready");
            })
            .catch(error => {
                if (cancelled) return;
                setDetailError(error instanceof MercadonaError ? error.message : "No se ha podido cargar la ficha.");
                setDetailState("error");
            });
        return () => {
            cancelled = true;
        };
    }, [wh, id, attempt]);

    // Parecidos más baratos: hasta 3, ordenados de más barato a menos
    useEffect(() => {
        let cancelled = false;
        setSimilarState("loading");
        fetchSimilars(wh, id)
            .then(products => {
                if (cancelled) return;
                setCheaper(products
                    .filter(product => product.price > 0 && item.price > 0 && product.price < item.price - 0.005)
                    .sort((a, b) => a.price - b.price)
                    .slice(0, 3));
                setSimilarState("ready");
            })
            .catch(() => {
                if (!cancelled) setSimilarState("error");
            });
        return () => {
            cancelled = true;
        };
    }, [wh, id, item.price, attempt]);

    // Datos frescos de la ficha si los hay; si no, lo que ya teníamos del producto
    const current: listItem = detail?.product ? { ...toListItem(detail.product), isNew: item.isNew || detail.product.isNew } : item;
    const photo = detail?.photos[0] || (item.image ? largeImageUrl(item.image) : "");

    return (
        <div className="p-4 space-y-5">
            {photo && (
                <img
                    src={photo}
                    alt={current.name}
                    className="mx-auto aspect-square w-full max-w-[320px] rounded-md bg-surface object-contain"
                />
            )}

            <ul>
                <ProductRow
                    item={current}
                    detail={[current.packaging, current.unitPrice].filter(Boolean).join(" · ")}
                    previousPrice={detail?.product?.previousPrice}
                    quantity={quantityOf(current.id)}
                    onAdd={onAdd}
                    onDecrease={onDecrease}
                    favorite={isFavorite(current.id)}
                    onToggleFavorite={onToggleFavorite}
                />
            </ul>

            {detailState === "loading" && (
                <div className="space-y-2" aria-busy="true">
                    <div className="h-5 w-2/3 rounded-sm bg-surface-sunk animate-pulse" />
                    <div className="h-20 rounded-sm bg-surface-sunk animate-pulse" />
                </div>
            )}

            {detailState === "error" && (
                <div className="rounded-md bg-surface-sunk p-4" role="alert">
                    <p className="text-base">{detailError}</p>
                    <button
                        type="button"
                        onClick={() => setAttempt(value => value + 1)}
                        className="mt-3 inline-flex items-center gap-2 h-11 px-4 rounded-md bg-accent-soft text-on-accent-soft font-semibold"
                    >
                        <RefreshCw size={16} aria-hidden="true" /> Reintentar
                    </button>
                </div>
            )}

            {detailState === "ready" && detail && (
                <>
                    <section aria-labelledby="ficha-alergenos">
                        <h3 id="ficha-alergenos" className="text-lg font-bold">Alérgenos</h3>
                        {detail.allergens ? (
                            <p className="mt-1 whitespace-pre-line rounded-md border-2 border-danger bg-surface p-3 text-base">{detail.allergens}</p>
                        ) : (
                            <p className="mt-1 text-base text-muted">Mercadona no indica alérgenos para este producto.</p>
                        )}
                    </section>

                    <section aria-labelledby="ficha-ingredientes">
                        <h3 id="ficha-ingredientes" className="text-lg font-bold">Ingredientes</h3>
                        <p className="mt-1 whitespace-pre-line text-base">
                            {detail.ingredients || <span className="text-muted">Mercadona no indica los ingredientes de este producto.</span>}
                        </p>
                    </section>

                    <p className="flex items-start gap-2 rounded-md bg-highlight p-3 text-base text-on-highlight">
                        <AlertTriangle size={20} aria-hidden="true" className="mt-0.5 flex-none" />
                        Si tienes una alergia o intolerancia, comprueba siempre el envase: esta información puede no estar al día.
                    </p>

                    {(detail.brand || detail.origin || detail.description || detail.storage || detail.usage) && (
                        <dl className="space-y-2 text-base">
                            {detail.brand && <div><dt className="font-semibold">Marca</dt><dd>{detail.brand}</dd></div>}
                            {detail.origin && <div><dt className="font-semibold">Origen</dt><dd>{detail.origin}</dd></div>}
                            {detail.description && <div><dt className="font-semibold">Descripción</dt><dd className="whitespace-pre-line">{detail.description}</dd></div>}
                            {detail.storage && <div><dt className="font-semibold">Conservación</dt><dd className="whitespace-pre-line">{detail.storage}</dd></div>}
                            {detail.usage && <div><dt className="font-semibold">Modo de empleo</dt><dd className="whitespace-pre-line">{detail.usage}</dd></div>}
                        </dl>
                    )}
                </>
            )}

            {history.length > 1 && (
                <section aria-labelledby="ficha-historial">
                    <h3 id="ficha-historial" className="text-lg font-bold">Cómo ha cambiado su precio</h3>
                    <p className="text-sm text-muted">Desde que lo guardaste en favoritos.</p>
                    <ul className="mt-2 divide-y divide-border rounded-md bg-surface">
                        {[...history].reverse().map(point => (
                            <li key={`${point.d}-${point.p}`} className="flex justify-between px-3 py-2 text-base tabular">
                                <span>{dayLabel(point.d)}</span>
                                <span className="font-semibold">{formatCurrency(point.p)}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <section aria-labelledby="ficha-baratos">
                <h3 id="ficha-baratos" className="text-lg font-bold">Parecidos y más baratos</h3>
                {similarState === "loading" && <p className="mt-1 text-base text-muted">Buscando alternativas…</p>}
                {similarState === "error" && <p className="mt-1 text-base text-muted">Ahora mismo no se pueden ver alternativas.</p>}
                {similarState === "ready" && cheaper.length === 0 && (
                    <p className="mt-1 text-base text-muted">No hay productos parecidos más baratos.</p>
                )}
                {similarState === "ready" && cheaper.length > 0 && (
                    <ul className="mt-2 space-y-2">
                        {cheaper.map(product => {
                            const alternative = toListItem(product);
                            const saving = item.price - product.price;
                            return (
                                <li key={product.mercadonaId} className="flex items-center gap-3 rounded-md bg-surface p-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="font-semibold leading-snug break-words">{product.name}</p>
                                        <p className="text-sm text-muted break-words">{mercadonaDetail(product)}</p>
                                        <p className="mt-1 text-base tabular">
                                            <span className="font-bold">{formatCurrency(product.price)}</span>
                                            <span className="ml-2 text-sm font-semibold text-accent-strong">{formatCurrency(saving)} menos</span>
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => onAdd(alternative)}
                                        className="flex-none h-11 px-4 inline-flex items-center gap-1.5 rounded-pill bg-accent text-on-accent text-base font-semibold hover:bg-accent-strong"
                                    >
                                        <Plus size={20} aria-hidden="true" />
                                        {quantityOf(alternative.id) > 0 ? `Añadir otro (${quantityOf(alternative.id)})` : "Añadir"}
                                        <span className="sr-only"> {product.name}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </div>
    );
};

export default ProductSheet;
