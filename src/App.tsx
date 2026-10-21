import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { Heart, RefreshCw, Search, ShoppingBasket, Sparkles, X } from "lucide-react"
// hooks: la lista, los favoritos (los dos en localStorage) y el catálogo de Mercadona
import useList from "./hooks/useList"
import useFavorites from "./hooks/useFavorites"
import useMercadona from "./hooks/useMercadona"
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

type Source = "todo" | "favoritos" | "mercadona"
type HomeTab = "favoritos" | "novedades" | "pasillos"

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

const itemDetail = (item: listItem) =>
  [item.packaging, item.unitPrice].filter(Boolean).join(" · ") || item.type;

function App() {
  const { order, addItem, decreaseItem, removeItem } = useList();
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

  // Novedades: hace falta el catálogo completo, así que se carga al abrir la pestaña
  const { ensureIndex } = mercadona;
  useEffect(() => {
    if (homeTab === "novedades") ensureIndex();
  }, [homeTab, ensureIndex]);

  const novelties = useMemo(
    () => mercadona.searchable
      .filter(product => product.isNew)
      .sort((a, b) => a.aisle.localeCompare(b.aisle, "es") || a.searchName.localeCompare(b.searchName, "es", { numeric: true })),
    [mercadona.searchable]
  );

  const noveltiesByAisle = useMemo(() => {
    const groups = new Map<string, SearchableProduct[]>();
    for (const product of novelties) {
      const list = groups.get(product.aisle) ?? [];
      list.push(product);
      groups.set(product.aisle, list);
    }
    return [...groups.entries()];
  }, [novelties]);


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

  const missingAisles = mercadona.indexProgress
    ? mercadona.indexProgress.total - mercadona.indexProgress.done + mercadona.indexProgress.failed
    : 0;


  // ---------- Piezas ----------

  const favoriteRow = (item: listItem) => (
    <ProductRow
      key={item.id}
      item={item}
      detail={itemDetail(item)}
      quantity={quantityOf(item.id)}
      onAdd={addItem}
      onDecrease={decreaseFromResults}
      favorite
      onToggleFavorite={toggleFavorite}
    />
  );

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
          <p className="text-xs text-muted mb-1.5">
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
          <p className="text-xs text-muted">
            {missingAisles === 1 ? "Falta 1 pasillo" : `Faltan ${missingAisles} pasillos`} por cargar: puede faltar algún producto.
          </p>
          <button type="button" onClick={mercadona.retry} className="flex-none h-9 px-3 rounded-md bg-accent-soft text-on-accent-soft text-sm font-semibold">
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
      className={`flex-none h-9 px-4 rounded-pill border text-sm font-medium transition-colors duration-200 ${source === value
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
        />
      </div>
      <div className="border-t border-border p-4 space-y-3 safe-bottom">
        <OrderTotal order={order} />
        <ButtonPdf order={order} />
      </div>
    </div>
  );


  return (
    <div className="min-h-screen">
      {/* Cabecera con el buscador: lo primero y siempre a mano */}
      <header className="sticky top-0 z-30 bg-accent-strong text-on-accent safe-top">
        <div className="mx-auto max-w-content px-4">
          <div className="flex h-14 items-center justify-between">
            <h1 className="text-xl font-extrabold tracking-tight">Lista de la compra</h1>
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
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 grid place-items-center rounded-full text-muted hover:bg-surface-sunk"
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
                    {mercadonaResults.slice(0, visibleCount).map(product => {
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
                        />
                      );
                    })}
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

              {noResults && (
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
              <InstallHint />

              {/* Pestañas de la portada */}
              <div role="tablist" aria-label="Secciones" className="mb-5 grid grid-cols-3 gap-1 rounded-md bg-surface-sunk p-1">
                {([
                  ["favoritos", "Favoritos", favorites.length],
                  ["novedades", "Novedades", novelties.length],
                  ["pasillos", "Pasillos", undefined],
                ] as [HomeTab, string, number | undefined][]).map(([value, label, count]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    id={`tab-${value}`}
                    aria-selected={homeTab === value}
                    aria-controls={`panel-${value}`}
                    onClick={() => setHomeTab(value)}
                    className={`h-10 rounded-sm text-sm font-semibold transition-colors duration-200 ${homeTab === value
                      ? "bg-surface text-text shadow-sm"
                      : "text-muted hover:text-text"}`}
                  >
                    {label}
                    {count !== undefined && count > 0 && (
                      <span className={`ml-1.5 tabular text-xs ${value === "novedades" ? "rounded-pill bg-highlight text-on-highlight px-1.5 py-0.5" : ""}`}>{count}</span>
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
                  <p className="text-xs text-muted mb-4">
                    Productos que Mercadona marca como nuevos o que han aparecido en los últimos 60 días.
                  </p>

                  {catalogStatus}

                  {novelties.length === 0 ? (
                    <div className="rounded-md bg-surface p-6 text-center">
                      <Sparkles size={28} aria-hidden="true" className="mx-auto text-accent" />
                      <p className="mt-2 font-semibold">
                        {loadingCatalog ? "Buscando novedades…" : "Ahora mismo no hay novedades"}
                      </p>
                      {!loadingCatalog && (
                        <p className="text-sm text-muted mt-1">
                          Saldrán aquí en cuanto Mercadona añada productos nuevos. La app los detecta cada vez que carga el catálogo.
                        </p>
                      )}
                    </div>
                  ) : (
                    noveltiesByAisle.map(([aisle, items]) => (
                      <div key={aisle} className="mb-6">
                        <h3 className="text-sm font-semibold text-muted mb-2">{aisle}</h3>
                        <ul className="space-y-2">
                          {items.map(product => {
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
                              />
                            );
                          })}
                        </ul>
                      </div>
                    ))
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
                onChangeWarehouse={mercadona.changeWarehouse}
                quantityOf={quantityOf}
                onAdd={addItem}
                onDecrease={decreaseFromResults}
                isFavorite={isFavorite}
                onToggleFavorite={toggleFavorite}
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
          aria-label={`Ver lista: ${lineCount} productos, ${formatCurrency(total)}`}
        >
          <span className="relative">
            <ShoppingBasket size={24} aria-hidden="true" />
            <span className="absolute -top-2 -right-3 min-w-[22px] h-[22px] px-1 rounded-pill bg-highlight text-on-highlight text-xs font-bold grid place-items-center tabular">
              {lineCount}
            </span>
          </span>
          <span className="ml-3 font-semibold">Ver lista</span>
          <span className="ml-auto text-lg font-extrabold tabular">{formatCurrency(total)}</span>
        </button>
      </div>

      <Sheet open={listOpen} title={`Tu lista (${lineCount})`} onClose={closeList} variant="full">
        {listPanel(false)}
      </Sheet>
    </div>
  )
}

export default App
