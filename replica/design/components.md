# Componentes de ListType

Dirección: lista de la compra para el móvil, usada de pie en el supermercado. Lo memorable es el buscador; el resto es tranquilo. Filas antes que tarjetas porque se escanean más rápido. Verde oliva propio (no el de Mercadona), amarillo solo para el contador de la lista. Una sola familia tipográfica (Onest, abierta) con cifras tabulares en los precios.

Tokens: `tokens.json`, `src/index.css` (variables) y `tailwind.config.js` (roles). Contraste: 16 pares, 0 fallos AA.

```
Header
  contenido  nombre de la app a la izquierda; en móvil nada más
  tokens     bg accent-strong, text on-accent, display/800
  a11y       <header>, h1 único

SearchBar (S01, S05, S06)
  estados    vacío, escribiendo, cargando catálogo (barra de progreso), error (mensaje con código)
  tokens     surface, border-input 2px, radius md, base/400; foco: anillo accent
  conducta   resultados desde la 1.ª letra, sin acentos, palabras sueltas; al enfocar empieza a cargar el catálogo de Mercadona
             botón limpiar (X) cuando hay texto; Escape limpia
  a11y       <input type=search> con <label> oculto, role=status para el progreso

SourceFilter (chips Todo / Mis productos / Mercadona)
  estados    activo (accent, on-accent), inactivo (surface, borde)
  a11y       grupo de botones con aria-pressed

ProductRow (resultados y "mis productos")
  partes     miniatura 56px (foto o inicial sobre surface-sunk), nombre, detalle (envase · €/kg o categoría), precio, acción
  acción     no está en la lista: botón + redondo (44px)
             está en la lista: stepper − n + (− en 1 quita de la lista)
  estados    default, en lista (fondo accent-soft), foco
  a11y       botones con aria-label que nombra el producto; la foto lleva alt

CategoryChips (catálogo propio)
  estados    activa, inactiva; tocar la activa la desmarca
  a11y       aria-pressed

ListPanel (S03)
  móvil      hoja a pantalla completa que se abre desde la ListBar
  escritorio columna fija de 380px a la derecha
  partes     cabecera (Tu lista, número), filas de lista, total, botón PDF
  vacío      texto que invita a buscar algo

ListRow
  partes     miniatura 48px, nombre, detalle, total de la línea, stepper (− deshabilitado en 1), papelera
  a11y       aria-label en cada botón con el nombre del producto

ListBar (móvil)
  contenido  contador amarillo (highlight), "Ver lista", total a la derecha
  tokens     surface, shadow bar, safe-area inferior

Button
  variantes  primary (accent), soft (accent-soft), ghost, danger
  tamaños    md 44px (táctil mínimo), sm 36px solo en escritorio
  estados    default, hover, focus-visible, disabled (50 %), loading (texto cambia: "Generando PDF…")

Sheet / Dialog (crear producto, lista en móvil)
  conducta   se abre desde abajo en móvil, centrado en escritorio; Escape y fondo cierran; foco al primer campo
  a11y       role=dialog, aria-modal, aria-labelledby

AisleBrowser ("Explorar pasillos de Mercadona", secundario)
  estados    cargando (esqueleto), error (mensaje con código y Reintentar), lista de grupos, pasillo abierto
```
