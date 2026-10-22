import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { BadgePercent, Heart, Plus, RefreshCw, Search, ShoppingBasket, Sparkles, X } from "lucide-react"
// hooks: la lista, los favoritos (los dos en localStorage) y el catálogo de Mercadona
import useList from "./hooks/useList"
import useFavorites from "./hooks/useFavorites"
import useMercadona from "./hooks/useMercadona"
import usePriceHistory from "./hooks/usePriceHistory"
import type { SearchableProduct } from "./hooks/useMercadona"

import type { listItem } from "./types/types"
import { formatCurrency } from "./helpers/formatPrice"
import { mercadonaDetail, normalizeText, toListItem } from "./helpers/mercadona"
// componentes
import OrderTotal from "./components/OrderTotal.tsx"
import ButtonComponent from './components/ButtonComponent.tsx'
import ListOrder from "./components/ListOrder.tsx"
import ButtonPdf from "./components/ButtonPdf.tsx"
import MercadonaCatalog from "./components/MercadonaCatalog.tsx"
import ProductRow from "./components/ProductRow.tsx"
import Sheet from "./components/Sheet.tsx"
import InstallHint from "./components/InstallHint.tsx"
import ZoneCard from "./components/ZoneCard.tsx"
import ProductSheet from "./components/ProductSheet.tsx"
import ShareButton from "./components/ShareButton.tsx"
import AppUpdate from "./components/AppUpdate.tsx"
import Collapsible from "./components/Collapsible.tsx"
import BackToTop from "./components/BackToTop.tsx"

type Source = "todo" | "favoritos" | "mercadona"
type HomeTab = "favoritos" | "novedades" | "rebajas" | "pasillos"
const HOME_TABS: HomeTab[] = ["favoritos", "novedades", "rebajas", "pasillos"]

const PAGE_SIZE = 40
// En "Todo", cuántos favoritos se enseñan antes que los de Mercadona
const FAVORITES_PREVIEW = 5

// Coincide si están todas las palabras; primero lo que empieza por lo escrito
function makeMatcher(term: string) {
  const words = term.split(/\s+/).filter(Boolean);
  const matches = (name: string) => words.every(word => name.includes(word));
  const score = (name: string) => {
    if (name.startsWith(term)) return 0;
    if (name.split(/\s+/).some(word => word.startsWith(words[0] ?? ""))) return 1;
    return 2;
  };
  return { matches, score };
}

function groupByAisle(products: SearchableProduct[], sectionOf: (product: SearchableProduct) => string = product => product.aisle) {
  const groups = new Map<string, SearchableProduct[]>();
  for (const product of products) {
    const section = sectionOf(product);
    const list = groups.get(section) ?? [];
    list.push(product);
    groups.set(section, list);
  }
  return [...groups.entries()];
}

const itemDetail = (item: listItem) =>
  [item.packaging, item.unitPrice].filter(Boolean).join(" · ") || item.type;

function App() {
  const { order, addItem, decreaseItem, removeItem, refreshOrder } = useList();
  const { favorites, isFavorite, toggleFavorite, refreshFavorites } = useFavorites();
  const mercadona = useMercadona();

  const [query, setQuery] = useState<string>("");
  const deferredQuery = useDeferredValue(query);
  const [source, setSource] = useState<Source>("todo");
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const [selectedCheckbox, setSelectedCheckbox] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState<boolean>(false);
  const [homeTab, setHomeTab] = useState<HomeTab>("favoritos");
  const searchRef = useRef<HTMLInputElement>(null);

  const [detailItem, setDetailItem] = useState<listItem | null>(null);
  const { historyOf, changeNote } = usePriceHistory(favorites);

  // Novedades y rebajas se agrupan por sección grande de Mercadona ("Bodega", "Congelados"…):
  // las listas oficiales solo traen esa sección, y los productos de pasillos ya abiertos se llevan a la suya
  // para que lo mismo no salga bajo dos títulos distintos.
  const sectionOfAisle = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of mercadona.groups) {
      for (const aisle of group.aisles) map.set(aisle.name, group.name);
    }
    return map;
  }, [mercadona.groups]);
  const sectionOf = useCallback((product: SearchableProduct) => sectionOfAisle.get(product.aisle) ?? product.aisle, [sectionOfAisle]);

  // Novedades: la lista oficial de Mercadona + lo que marca como nuevo (sin cargar todo el catálogo)
  const novelties = useMemo(
    () => [...mercadona.novelties]
      .sort((a, b) => sectionOf(a).localeCompare(sectionOf(b), "es") || a.searchName.localeCompare(b.searchName, "es", { numeric: true })),
    [mercadona.novelties, sectionOf]
  );
  const noveltiesByAisle = useMemo(() => groupByAisle(novelties, sectionOf), [novelties, sectionOf]);

  // Rebajas: la lista oficial de bajadas de precio de Mercadona
  // Primero las secciones; dentro de cada una, de mayor a menor descuento
  const discount = (product: SearchableProduct) => product.previousPrice ? (product.previousPrice - product.price) / product.previousPrice : 0;
  const drops = useMemo(
    () => [...mercadona.drops].sort((a, b) => sectionOf(a).localeCompare(sectionOf(b), "es") || discount(b) - discount(a)),
    [mercadona.drops, sectionOf]
  );
  const dropsByAisle = useMemo(() => groupByAisle(drops, sectionOf), [drops, sectionOf]);


  // Categorías de los favoritos (el pasillo de Mercadona de cada uno)
  const favoriteCategories = useMemo(
    () => [...new Set(favorites.map(item => item.type).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    [favorites]
  );

  // Si se quita el último favorito de una categoría, se desmarca el filtro
  useEffect(() => {
    if (selectedCheckbox && !favoriteCategories.includes(selectedCheckbox)) setSelectedCheckbox(null);
  }, [favoriteCategories, selectedCheckbox]);

  const filteredFavorites = useMemo(
    () => selectedCheckbox ? favorites.filter(item => item.type === selectedCheckbox) : favorites,
    [favorites, selectedCheckbox]
  );

  // Cuando llegan datos nuevos de Mercadona, los favoritos se actualizan (precio, foto…)
  useEffect(() => {
    if (favorites.length === 0) return;
    const wanted = new Set(favorites.map(item => item.mercadonaId).filter(Boolean));
    const fresh = new Map<number, listItem>();
    for (const product of mercadona.searchable) {
      if (wanted.has(product.mercadonaId)) {
        const item = toListItem(product);
        fresh.set(item.id, item);
      }
    }
    if (fresh.size) refreshFavorites(fresh);
  }, [mercadona.searchable, favorites, refreshFavorites]);

  // Igual con la lista: los productos de Mercadona ya apuntados cogen el precio nuevo (la cantidad no cambia)
  useEffect(() => {
    const wanted = new Set(order.map(item => item.mercadonaId).filter(Boolean));
    if (wanted.size === 0) return;
    const fresh = new Map<number, listItem>();
    for (const product of mercadona.searchable) {
      if (wanted.has(product.mercadonaId)) {
        const item = toListItem(product);
        fresh.set(item.id, item);
      }
    }
    if (fresh.size) refreshOrder(fresh);
  }, [mercadona.searchable, order, refreshOrder]);

  // Cantidad de cada producto en la lista, para pintar − n + en los resultados
  const quantities = useMemo(() => new Map(order.map(item => [item.id, item.quantity])), [order]);
  const quantityOf = useCallback((id: number) => quantities.get(id) ?? 0, [quantities]);

  const lineCount = order.length;
  const total = useMemo(() => order.reduce((sum, item) => sum + item.price * item.quantity, 0), [order]);


  // ---------- Buscador ----------

  const term = normalizeText(deferredQuery.trim());
  const searching = term.length > 0;

  const favoriteResults = useMemo(() => {
    if (!term) return [];
    const { matches, score } = makeMatcher(term);
    return favorites
      .map(item => ({ item, name: normalizeText(item.name) }))
      .filter(entry => matches(entry.name))
      .sort((a, b) => score(a.name) - score(b.name) || a.name.localeCompare(b.name, "es", { numeric: true }))
      .map(entry => entry.item);
  }, [term, favorites]);

  const mercadonaResults = useMemo<SearchableProduct[]>(() => {
    if (!term) return [];
    const { matches, score } = makeMatcher(term);
    return mercadona.searchable
      .filter(product => matches(product.searchName))
      .sort((a, b) => score(a.searchName) - score(b.searchName) || a.searchName.localeCompare(b.searchName, "es", { numeric: true }));
  }, [term, mercadona.searchable]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [term, source]);

  const showFavorites = source !== "mercadona";
  const showMercadona = source !== "favoritos";
  const loadingCatalog = mercadona.indexState === "running" || mercadona.groupsState === "loading";
  const noResults = searching
    && (!showFavorites || favoriteResults.length === 0)
    && (!showMercadona || mercadonaResults.length === 0);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (value.trim()) mercadona.ensureIndex();
  };

  const clearSearch = () => {
    setQuery("");
    searchRef.current?.focus();
  };


  // ---------- Acciones ----------

  // Tocar una categoría filtra; tocar otra vez la misma vuelve a mostrar todo
  const filterFunction = (value: string) => {
    setSelectedCheckbox(previous => previous === value ? null : value);
  };

  // En los resultados, "−" con 1 unidad quita el producto de la lista
  const decreaseFromResults = (item: listItem) => {
    if (quantityOf(item.id) > 1) decreaseItem(item.id);
    else removeItem(item.id);
  };

  const closeList = useCallback(() => setListOpen(false), []);
  const closeDetail = useCallback(() => setDetailItem(null), []);

  // Plan B: Mercadona no responde (no hay pasillos o la carga se ha parado por errores)
  const mercadonaDown = mercadona.groupsState === "error"
    || (mercadona.indexState === "stopped" && mercadona.searchable.length === 0);

  const [manualAdded, setManualAdded] = useState<string>("");

  // Apunta a mano lo escrito en el buscador (mismo formato que los productos a mano de antes)
  const addManual = () => {
    const name = deferredQuery.trim().replace(/[.;,]/g, "").toLowerCase();
    if (name.length < 2) return;
    const existing = order.find(item => item.source === "manual" && item.name === name);
    addItem(existing ?? {
      id: Math.floor(Math.random() * 9000000000) + 1000000000,
      name,
      type: "a mano",
      price: 0,
      source: "manual",
    });
    setManualAdded(`«${name}» añadido a tu lista`);
    setQuery("");
    searchRef.current?.focus();
  };

  // Pestañas: flechas izquierda/derecha, Inicio y Fin (patrón estándar de pestañas)
  const handleTabKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = HOME_TABS.indexOf(homeTab);
    const next = event.key === "ArrowRight" ? (index + 1) % HOME_TABS.length
      : event.key === "ArrowLeft" ? (index + HOME_TABS.length - 1) % HOME_TABS.length
      : event.key === "Home" ? 0
      : event.key === "End" ? HOME_TABS.length - 1
      : -1;
    if (next < 0) return;
    event.preventDefault();
    setHomeTab(HOME_TABS[next]);
    document.getElementById(`tab-${HOME_TABS[next]}`)?.focus();
  };

  // Lo que oye quien usa lector de pantalla al buscar
  const resultsAnnouncement = !searching ? ""
    : noResults ? (loadingCatalog ? "Buscando…" : "No hay resultados")
    : `${(showFavorites ? favoriteResults.length : 0) + (showMercadona ? mercadonaResults.length : 0)} resultados`;

  const missingAisles = mercadona.indexProgress
    ? mercadona.indexProgress.total - mercadona.indexProgress.done + mercadona.indexProgress.failed
    : 0;


  // ---------- Piezas ----------

  const favoriteRow = (item: listItem) => (
    <ProductRow
      key={item.id}
      item={item}
      detail={itemDetail(item)}
      previousPrice={item.mercadonaId ? mercadona.searchableById.get(item.mercadonaId)?.previousPrice : null}
      quantity={quantityOf(item.id)}
      onAdd={addItem}
      onDecrease={decreaseFromResults}
      favorite
      onToggleFavorite={toggleFavorite}
      note={changeNote(item)}
      onOpenDetails={setDetailItem}
    />
  );

  // Fila de un producto de Mercadona (resultados, novedades, rebajas)
  const productRow = (product: SearchableProduct) => {
    const item = toListItem(product);
    return (
      <ProductRow
        key={product.mercadonaId}
        item={item}
        detail={mercadonaDetail(product)}
        previousPrice={product.previousPrice}
        quantity={quantityOf(item.id)}
        onAdd={addItem}
        onDecrease={decreaseFromResults}
        favorite={isFavorite(item.id)}
        onToggleFavorite={toggleFavorite}
        onOpenDetails={setDetailItem}
      />
    );
  };

  // Favoritos que Mercadona tiene rebajados ahora mismo
  const favoritesOnSale = favorites.filter(item => item.mercadonaId && mercadona.searchableById.get(item.mercadonaId)?.previousPrice);

  const catalogStatus = (
    <>
      {mercadona.groupsState === "error" && (
        <div className="rounded-md bg-surface p-4 mb-4" role="alert">
          <p className="text-sm">{mercadona.groupsError}</p>
          <button type="button" onClick={mercadona.retry} className="mt-3 inline-flex items-center gap-2 h-11 px-4 rounded-md bg-accent-soft text-on-accent-soft font-semibold">
            <RefreshCw size={16} aria-hidden="true" /> Reintentar
          </button>
        </div>
      )}

      {mercadona.indexState === "running" && mercadona.indexProgress && (
        <div className="mb-4" role="status" aria-live="polite">
          <p className="text-sm text-muted mb-1.5">
            Cargando productos de Mercadona: {mercadona.indexProgress.done} de {mercadona.indexProgress.total} pasillos. Solo la primera vez al día.
          </p>
          <div className="h-1.5 w-full rounded-pill bg-surface-sunk overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-200"
              style={{ width: `${mercadona.indexProgress.total ? Math.round(mercadona.indexProgress.done / mercadona.indexProgress.total * 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      {mercadona.indexState === "stopped" && mercadona.indexProgress && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md bg-surface p-3" role="status">
          <p className="text-sm text-muted">
            {missingAisles === 1 ? "Falta 1 pasillo" : `Faltan ${missingAisles} pasillos`} por cargar: puede faltar algún producto.
          </p>
          <button type="button" onClick={mercadona.retry} className="flex-none h-11 px-4 rounded-md bg-accent-soft text-on-accent-soft text-base font-semibold">
            Reintentar
          </button>
        </div>
      )}
    </>
  );

  const sourceChip = (value: Source, label: string, count?: number) => (
    <button
      key={value}
      type="button"
      aria-pressed={source === value}
      onClick={() => setSource(value)}
      className={`flex-none h-11 px-4 rounded-pill border text-base font-medium transition-colors duration-200 ${source === value
        ? "bg-accent border-accent text-on-accent"
        : "bg-surface border-border hover:border-accent"}`}
    >
      {label}{count !== undefined && <span className="ml-1.5 tabular opacity-80">{count}</span>}
    </button>
  );

  const listPanel = (withHeader: boolean) => (
    <div className="flex h-full flex-col bg-surface">
      {withHeader && (
        <div className="flex items-baseline justify-between gap-3 px-4 py-3 border-b border-border">
          <h2 className="text-lg font-bold">Tu lista</h2>
          <span className="text-sm text-muted tabular">{lineCount} {lineCount === 1 ? "producto" : "productos"}</span>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        <ListOrder
          order={order}
          addItem={addItem}
          decreaseItem={decreaseItem}
          removeItem={removeItem}
          onOpenDetails={setDetailItem}
        />
      </div>
      <div className="border-t border-border p-4 space-y-3 safe-bottom">
        <OrderTotal order={order} />
        <ButtonPdf order={order} />
        <ShareButton order={order} />
      </div>
    </div>
  );


  return (
    <div className="min-h-screen">
      {/* Cabecera con el buscador: lo primero y siempre a mano */}
      <header className="sticky top-0 z-30 bg-accent-strong text-on-accent safe-top">
        <div className="mx-auto max-w-content px-4">
          <div className="flex h-14 items-center justify-between">
            <h1 id="app-title" tabIndex={-1} className="text-xl font-extrabold tracking-tight focus:outline-none focus-visible:outline-highlight">Lista de la compra</h1>
          </div>
          <div className="pb-3 md:pr-[412px]">
            <label htmlFor="search" className="sr-only">Buscar productos de Mercadona</label>
            <div className="relative">
              <Search size={20} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                ref={searchRef}
                id="search"
                type="search"
                inputMode="search"
                autoComplete="off"
                enterKeyHint="search"
                value={query}
                onFocus={mercadona.ensureIndex}
                onChange={event => handleQueryChange(event.target.value)}
                onKeyDown={event => { if (event.key === "Escape") setQuery(""); }}
                placeholder="Busca en Mercadona"
                className="h-12 w-full rounded-md bg-surface pl-11 pr-12 text-base text-text placeholder:text-muted focus:outline-none focus-visible:outline-highlight"
              />
              {query && (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label="Borrar búsqueda"
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 h-11 w-11 grid place-items-center rounded-full text-muted hover:bg-surface-sunk"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-content px-4 md:grid md:grid-cols-[minmax(0,1fr)_380px] md:gap-8">
        <main className="pt-4 pb-32 md:pb-12">
          <AppUpdate />
          <p role="status" aria-live="polite" className="sr-only">{resultsAnnouncement}</p>
          <p role="status" aria-live="polite" className="sr-only">{manualAdded}</p>
          {searching ? (
            <div>
              <div className="-mx-4 px-4 mb-4 flex gap-2 overflow-x-auto" role="group" aria-label="Dónde buscar">
                {sourceChip("todo", "Todo")}
                {sourceChip("mercadona", "Mercadona", mercadonaResults.length)}
                {sourceChip("favoritos", "Favoritos", favoriteResults.length)}
              </div>

              {showMercadona && catalogStatus}

              {showFavorites && favoriteResults.length > 0 && (
                <section aria-labelledby="favorite-results" className="mb-6">
                  <h2 id="favorite-results" className="text-sm font-semibold text-muted mb-2">Tus favoritos</h2>
                  <ul className="space-y-2">
                    {(source === "todo" ? favoriteResults.slice(0, FAVORITES_PREVIEW) : favoriteResults).map(favoriteRow)}
                  </ul>
                  {source === "todo" && favoriteResults.length > FAVORITES_PREVIEW && (
                    <button
                      type="button"
                      onClick={() => setSource("favoritos")}
                      className="mt-2 h-11 px-1 text-sm font-semibold text-accent underline underline-offset-2"
                    >
                      Ver tus {favoriteResults.length} favoritos
                    </button>
                  )}
                </section>
              )}

              {showMercadona && mercadonaResults.length > 0 && (
                <section aria-labelledby="mercadona-results" className="mb-6">
                  <h2 id="mercadona-results" className="text-sm font-semibold text-muted mb-2">
                    Mercadona <span className="tabular">({mercadonaResults.length})</span>
                  </h2>
                  <ul className="space-y-2">
                    {mercadonaResults.slice(0, visibleCount).map(productRow)}
                  </ul>
                  {mercadonaResults.length > visibleCount && (
                    <button
                      type="button"
                      onClick={() => setVisibleCount(count => count + PAGE_SIZE)}
                      className="mt-3 w-full h-12 rounded-md border border-border bg-surface font-semibold hover:border-accent"
                    >
                      Mostrar más ({mercadonaResults.length - visibleCount})
                    </button>
                  )}
                </section>
              )}

              {/* Plan B: si Mercadona no responde, lo buscado se puede apuntar a mano con un toque */}
              {mercadonaDown && deferredQuery.trim().length >= 2 && (
                <div className="mb-4 rounded-md border-2 border-accent bg-surface p-4">
                  <p className="font-semibold">¿No lo encuentras? Apúntalo a mano</p>
                  <p className="text-sm text-muted mt-1">Se añade a tu lista sin foto ni precio.</p>
                  <button
                    type="button"
                    onClick={addManual}
                    className="mt-3 w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-accent text-on-accent text-base font-semibold hover:bg-accent-strong"
                  >
                    <Plus size={20} aria-hidden="true" />
                    Añadir «{deferredQuery.trim()}» a la lista
                  </button>
                </div>
              )}

              {noResults && !mercadonaDown && (
                <div className="rounded-md bg-surface p-6 text-center">
                  <p className="font-semibold">
                    {loadingCatalog ? "Buscando…" : `No hay nada que coincida con «${deferredQuery.trim()}».`}
                  </p>
                  {!loadingCatalog && (
                    <p className="text-sm text-muted mt-1">Prueba con otra palabra o con menos letras.</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              <ZoneCard zone={mercadona.zone} onChange={mercadona.changePostalCode} />
              <InstallHint />

              {/* Pestañas de la portada */}
              <div role="tablist" aria-label="Secciones" onKeyDown={handleTabKeys} className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-1 rounded-md bg-surface-sunk p-1">
                {([
                  ["favoritos", "Favoritos", favorites.length],
                  ["novedades", "Novedades", novelties.length],
                  ["rebajas", "Rebajas", drops.length],
                  ["pasillos", "Pasillos", undefined],
                ] as [HomeTab, string, number | undefined][]).map(([value, label, count]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    id={`tab-${value}`}
                    aria-selected={homeTab === value}
                    aria-controls={homeTab === value ? `panel-${value}` : undefined}
                    tabIndex={homeTab === value ? 0 : -1}
                    onClick={() => setHomeTab(value)}
                    className={`h-11 rounded-sm text-base font-semibold transition-colors duration-200 ${homeTab === value
                      ? "bg-surface text-text shadow-sm"
                      : "text-muted hover:text-text"}`}
                  >
                    {label}
                    {count !== undefined && count > 0 && (
                      <span className={`ml-1.5 tabular text-sm ${value === "novedades" || value === "rebajas" ? "rounded-pill bg-highlight text-on-highlight px-1.5" : ""}`}>{count}</span>
                    )}
                  </button>
                ))}
              </div>

              {homeTab === "novedades" && (
                <section id="panel-novedades" role="tabpanel" aria-labelledby="tab-novedades">
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <h2 className="text-lg font-bold">Novedades de Mercadona</h2>
                    {novelties.length > 0 && <span className="text-sm text-muted tabular">{novelties.length}</span>}
                  </div>
                  <p className="text-sm text-muted mb-4">
                    Los productos que Mercadona presenta como novedad.
                  </p>

                  {catalogStatus}

                  {novelties.length === 0 ? (
                    <div className="rounded-md bg-surface p-6 text-center">
                      <Sparkles size={28} aria-hidden="true" className="mx-auto text-accent" />
                      <p className="mt-2 font-semibold">
                        {mercadona.homeState["new-arrivals"] === "loading" ? "Buscando novedades…" : "Ahora mismo no hay novedades"}
                      </p>
                      {mercadona.homeState["new-arrivals"] !== "loading" && (
                        <p className="text-sm text-muted mt-1">
                          {mercadona.homeState["new-arrivals"] === "error"
                            ? "No se han podido cargar las novedades de Mercadona. Inténtalo más tarde."
                            : "Saldrán aquí en cuanto Mercadona presente productos nuevos."}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {noveltiesByAisle.map(([aisle, items]) => (
                        <Collapsible key={aisle} title={aisle} count={items.length} defaultOpen={noveltiesByAisle.length === 1}>
                          <ul className="space-y-2">
                            {items.map(productRow)}
                          </ul>
                        </Collapsible>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {homeTab === "rebajas" && (
                <section id="panel-rebajas" role="tabpanel" aria-labelledby="tab-rebajas">
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <h2 className="text-lg font-bold">Rebajas de Mercadona</h2>
                    {drops.length > 0 && <span className="text-sm text-muted tabular">{drops.length}</span>}
                  </div>
                  <p className="text-sm text-muted mb-4">Solo productos con el precio de antes comprobado: sale tachado junto al descuento.</p>

                  {drops.length === 0 ? (
                    <div className="rounded-md bg-surface p-6 text-center">
                      <BadgePercent size={28} aria-hidden="true" className="mx-auto text-accent" />
                      <p className="mt-2 font-semibold">
                        {mercadona.homeState["price-drops"] === "loading" ? "Buscando rebajas…" : "Ahora mismo no hay rebajas"}
                      </p>
                      {mercadona.homeState["price-drops"] === "error" && (
                        <p className="text-sm text-muted mt-1">No se han podido cargar las rebajas de Mercadona. Inténtalo más tarde.</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dropsByAisle.map(([aisle, items]) => (
                        <Collapsible key={aisle} title={aisle} count={items.length} defaultOpen={dropsByAisle.length === 1}>
                          <ul className="space-y-2">
                            {items.map(productRow)}
                          </ul>
                        </Collapsible>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {homeTab === "favoritos" && (
              <section id="panel-favoritos" role="tabpanel" aria-labelledby="tab-favoritos">
                <div className="flex items-baseline justify-between gap-3 mb-3">
                  <h2 id="favorites-title" className="text-lg font-bold">Tus favoritos</h2>
                  {favorites.length > 0 && (
                    <span className="text-sm text-muted tabular">{favorites.length}</span>
                  )}
                </div>

                {favorites.length === 0 ? (
                  <div className="rounded-md bg-surface p-6 text-center">
                    <Heart size={28} aria-hidden="true" className="mx-auto text-danger" />
                    <p className="mt-2 font-semibold">Aún no tienes favoritos</p>
                    <p className="text-sm text-muted mt-1">
                      Busca un producto de Mercadona y toca el corazón: aparecerá aquí para añadirlo a la lista de un toque.
                    </p>
                  </div>
                ) : (
                  <>
                    {favoritesOnSale.length > 0 && (
                      <div className="mb-4 flex items-center justify-between gap-3 rounded-md bg-highlight p-3 text-on-highlight" role="status">
                        <p className="flex items-center gap-2 text-base font-semibold">
                          <BadgePercent size={22} aria-hidden="true" className="flex-none" />
                          {favoritesOnSale.length === 1
                            ? "1 de tus favoritos ha bajado de precio"
                            : `${favoritesOnSale.length} de tus favoritos han bajado de precio`}
                        </p>
                        <button
                          type="button"
                          onClick={() => setHomeTab("rebajas")}
                          className="flex-none h-11 px-3 rounded-md bg-surface text-text text-base font-semibold"
                        >
                          Ver rebajas
                        </button>
                      </div>
                    )}
                    {favoriteCategories.length > 1 && (
                      <div className="-mx-4 px-4 mb-4 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Categorías">
                        {favoriteCategories.map(item => (
                          <ButtonComponent
                            key={item}
                            filterFunction={filterFunction}
                            type={item}
                            isActive={selectedCheckbox === item}
                          />
                        ))}
                      </div>
                    )}
                    <ul className="space-y-2">
                      {filteredFavorites.map(favoriteRow)}
                    </ul>
                  </>
                )}
              </section>
              )}

              {homeTab === "pasillos" && (
              <div id="panel-pasillos" role="tabpanel" aria-labelledby="tab-pasillos">
              <MercadonaCatalog
                wh={mercadona.wh}
                groups={mercadona.groups}
                groupsState={mercadona.groupsState}
                groupsError={mercadona.groupsError}
                onRetryGroups={mercadona.retry}
                quantityOf={quantityOf}
                onAdd={addItem}
                onDecrease={decreaseFromResults}
                isFavorite={isFavorite}
                onToggleFavorite={toggleFavorite}
                onOpenDetails={setDetailItem}
                onProductsLoaded={mercadona.addToPool}
              />
              </div>
              )}
            </div>
          )}
        </main>

        {/* Lista: columna fija en escritorio */}
        <aside className="hidden md:block" aria-label="Tu lista">
          <div className="sticky top-[136px] mt-4 h-[calc(100vh-152px)] overflow-hidden rounded-lg border border-border shadow-pop">
            {listPanel(true)}
          </div>
        </aside>
      </div>

      {/* Lista: barra inferior en el móvil */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-surface shadow-bar px-4 pt-3 safe-bottom">
        <button
          type="button"
          onClick={() => setListOpen(true)}
          className="w-full h-14 flex items-center gap-3 rounded-md bg-accent px-4 text-on-accent"
        >
          <span className="relative">
            <ShoppingBasket size={24} aria-hidden="true" />
            <span aria-hidden="true" className="absolute -top-2.5 -right-3.5 min-w-[24px] h-[24px] px-1 rounded-pill bg-highlight text-on-highlight text-sm font-bold grid place-items-center tabular">
              {lineCount}
            </span>
          </span>
          <span className="ml-3 font-semibold">Ver lista<span className="sr-only">, {lineCount} {lineCount === 1 ? "producto" : "productos"},</span></span>
          <span className="ml-auto text-lg font-extrabold tabular">{formatCurrency(total)}</span>
        </button>
      </div>

      <BackToTop focusTargetId="app-title" />

      <Sheet open={listOpen} title={`Tu lista (${lineCount})`} onClose={closeList} variant="full">
        {listPanel(false)}
      </Sheet>

      {/* Ficha del producto: ingredientes, alérgenos, historial y parecidos más baratos */}
      <Sheet open={detailItem !== null} title="Ficha del producto" onClose={closeDetail} variant="full">
        {detailItem && (
          <ProductSheet
            key={detailItem.mercadonaId}
            wh={mercadona.wh}
            item={detailItem}
            quantityOf={quantityOf}
            onAdd={addItem}
            onDecrease={decreaseFromResults}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
            history={historyOf(detailItem.mercadonaId)}
          />
        )}
      </Sheet>
    </div>
  )
}

export default App
