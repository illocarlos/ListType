# Recon map: ListType + catálogo Mercadona (web, móvil primero)

Scope: añadir a la lista de la compra productos del catálogo de Mercadona (con foto, precio y precio por unidad), conservando el 100 % de lo que ListType hace hoy, incluido el alta manual y la exportación a PDF.
For: uso personal (Anita y Carlos). Sin ánimo comercial, sin cuentas, sin base de datos.
Date: 2026-10-21

## Decisiones tomadas por el usuario (no reabrir sin preguntarle)

1. **Fuente de datos: la API interna de la tienda online de Mercadona** (`tienda.mercadona.es/api`).
   - No es una API pública ni oficial: no hay portal de desarrolladores, ni documentación, ni licencia de datos. Responde sin login y está rate-limitada (HTTP 429).
   - La fase recon de REA prohíbe usar APIs privadas. El usuario ha decidido usarla igualmente, con conocimiento de causa, para uso personal. Queda registrado aquí.
   - No se usa la clave de Algolia incrustada en el frontend de Mercadona: la búsqueda se hace en local sobre lo cacheado.
2. **Persistencia: solo `localStorage`.** Nada de base de datos. Se permite una función serverless de Vercel **solo como proxy** (CORS + caché HTTP), sin estado.
3. **Compatibilidad de datos obligatoria.** Las claves `order` e `itemArrayNew` de `localStorage` y la forma de sus objetos deben seguir leyéndose. Anita no puede perder su lista al desplegar.
4. **Ninguna funcionalidad actual se pierde.** El PDF es requisito explícito del usuario y prioritario.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | código propio (ListType) | https://github.com/illocarlos/ListType | leído entero: 7 componentes, 1 hook, catálogo de 69 productos en `db.ts` |
| 2 | app desplegada | https://anita-y-su-comprita.vercel.app/ | SPA; desde fuera solo se ve el HTML base (título "Vite + React + TS") |
| 3 | tienda web Mercadona | https://tienda.mercadona.es/ | referencia del flujo de catálogo. **No se ha navegado ni capturado** (SPA, sin navegador conectado). Ver "Huecos" |
| 4 | docs públicas merca_ex (no oficial) | https://readme.hex.pm/merca_ex/0.1.0 | confirma: sin API oficial, endpoints REST bajo `/api`, búsqueda por Algolia, precios por almacén |
| 5 | docs públicas mercadona-importer | https://packagist.org/packages/josantonius/mercadona-importer | 429 por exceso de peticiones, 1,3 s entre peticiones por defecto, detalles varían por almacén |
| 6 | Apify alnitak/mercadona-scraper | https://apify.com/alnitak/mercadona-scraper.md | campos de producto, 3 niveles de categoría, ~4.300 productos, almacén `vlc1`/`mad1` |
| 7 | Apify abotapi/mercadona-es-scraper | https://apify.com/abotapi/mercadona-es-scraper.md | código postal → zona → almacén; precio anterior / oferta; imágenes en imgix |
| 8 | Apify studio-amba/mercadona-scraper | https://apify.com/studio-amba/mercadona-scraper.md | sin login ni cookies; imágenes en `prod-mercadona.imgix.net` |
| 9 | mercaapi (no oficial) | https://skills.cat/skills/m0wer/mercaapi | API comunitaria alternativa; descartada (tercero desconocido, avisos de seguridad) |

## Core loop

Montar la lista de la compra tocando productos (del catálogo propio, de Mercadona o creados a mano), ver un total aproximado y descargarla en PDF para ir a comprar.

## Screens

Una sola página hoy. Las pantallas son paneles de esa página.

### ListType actual (lo que hay que conservar)

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Panel de filtro y catálogo propio | `/`, botón "+" (escritorio) o barra fija inferior "filtrar" (móvil) | elegir categoría y tocar producto para añadirlo | botón "+" giratorio, botones de categoría (17), rejilla de productos (botón por producto, solo nombre) | oculto, visible, categoría activa |
| S02 | Panel "nuevo producto" | botón "-nuevo producto-" dentro de S01 | crear producto a mano (nombre + categoría) | input nombre, select categoría, Guardar, cerrar "X"; panel deslizante desde abajo | cerrado, abierto, error de validación (alert) |
| S03 | Cesta / lista | siempre visible en escritorio; en móvil con la barra "ver cesta" | ver lo añadido, quitar, total, PDF | botón PDF, filas con nombre + "Xn" + subtotal, botón quitar "X", total "aprox" | vacía ("no tienes ningun producto"), llena |
| S04 | PDF descargado | botón "Descargar lista PDF" en S03 | lista para llevar a la compra | jsPDF: título + líneas "n. nombre - Cantidad: n" | deshabilitado si la lista está vacía; alert si vacía |

### Tienda Mercadona (referencia, flujo de catálogo)

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| M01 | Código postal | primera visita | fijar zona → almacén → surtido y precios | input CP, aviso "sin reparto en tu zona" | sin CP, CP válido, CP sin servicio (fuentes 6, 7) |
| M02 | Árbol de categorías | menú lateral | navegar grupo → pasillo → subcategoría | lista expandible de 3 niveles | sin verificar visualmente |
| M03 | Rejilla de productos | al elegir categoría | ver productos con foto y precio | tarjeta: foto, nombre, formato/envase, tamaño, precio, precio por kg/L/ud, precio anterior si hay rebaja | sin verificar visualmente |
| M04 | Ficha de producto | tocar tarjeta | más fotos, marca, origen, ingredientes, alérgenos | galería, textos legales | sin verificar visualmente |
| M05 | Búsqueda | caja de búsqueda | encontrar por nombre | resultados en rejilla (vía Algolia, no se usará) | sin verificar visualmente |
| M06 | Carrito | icono carrito | cantidades y total | +/- por línea, total | sin verificar visualmente |

### Pantallas nuevas previstas en ListType

| ID | screen | purpose | basado en |
| --- | --- | --- | --- |
| S05 | Navegador Mercadona (categorías) | elegir pasillo/subcategoría | M02 |
| S06 | Rejilla Mercadona | tocar producto con foto y precio para añadirlo | M03 |
| S07 | Ficha producto Mercadona (opcional) | ver foto grande y datos antes de añadir | M04 |
| S08 | Ajuste de almacén | fijar el almacén de Sevilla una vez | M01 |

## Flows

```
F01 Añadir producto del catálogo propio (actual)
    S01 elegir categoría -> tocar producto -> S03 aparece con X1 (o +1 si ya estaba)
    happy path clicks: 2 en escritorio, 3 en móvil (abrir "filtrar")
    edge: tocar de nuevo la categoría activa (hoy NO vuelve a mostrar todo: bug), producto ya en la lista (+1)

F02 Crear producto a mano (actual)
    S01 -> "-nuevo producto-" -> S02 escribir nombre + elegir categoría -> Guardar -> S03
    happy path clicks: 4 + escribir
    edge: nombre < 2 letras o sin categoría (alert; el texto dice "3 letras": bug),
          nombre repetido (suma +1 por nombre), recargar página (hoy el producto creado no se ve hasta filtrar: bug),
          el select no se resetea al guardar (bug)

F03 Quitar producto de la lista (actual)
    S03 -> "X" en la fila
    happy path clicks: 1
    edge: quita la línea entera, no resta una unidad

F04 Descargar PDF (actual, REQUISITO PRIORITARIO)
    S03 -> "Descargar lista PDF" -> S04
    happy path clicks: 1
    edge: lista vacía (botón deshabilitado), más de ~25 líneas (se sale del A4: bug), nombres muy largos

F05 Añadir producto de Mercadona (nuevo)
    S05 elegir pasillo -> subcategoría -> S06 tocar producto -> S03 con foto y precio real
    happy path clicks: 3 (igual que la referencia M02 -> M03 -> añadir)
    edge: sin conexión, Mercadona responde 429 o cambia el formato, producto descatalogado,
          categoría ya cacheada (respuesta instantánea), producto ya en la lista (+1)

F06 Buscar producto de Mercadona (nuevo)
    S06 escribir -> resultados locales sobre categorías ya cacheadas -> tocar -> S03
    happy path clicks: 1 + escribir
    edge: lo buscado está en una categoría no cacheada todavía (decidir en architect: precargar o avisar)

F07 Primer uso con Mercadona (nuevo)
    S08 fijar almacén (o venir preconfigurado con el de Sevilla)
    happy path clicks: 0-1
    edge: almacén equivocado = precios de otra zona
```

Número a batir en F05: 3 toques, como en la tienda de Mercadona.

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Botón categoría | catálogo propio, pasillo Mercadona | default, activo, hover | S01, S05 |
| Tarjeta de producto | texto solo (propio/manual), con foto y precio (Mercadona) | default, hover, ya en lista | S01, S06 |
| Fila de la cesta | sin foto, con foto | default, cantidad > 1 | S03 |
| Botón quitar | "X" rojo | default | S03 |
| Panel deslizante inferior | alta manual | abierto, cerrado | S02 |
| Barra fija inferior móvil | "filtrar" / "ver cesta" | dos estados | S01, S03 |
| Botón PDF | primario | habilitado, deshabilitado | S03 |
| Total | texto "aprox" | default | S03 |
| Formulario | input texto, select | vacío, relleno, error | S02 |
| Avisos | hoy `alert()` nativo | — | S02, S04 |
| Estado de carga / error de Mercadona | nuevo | cargando, error, sin conexión | S05, S06 |

## Inferred data model

```
ListItem (actual)   id: number, name: string, type: string, price: number
                    evidence: src/types/types.ts, src/data/db.ts
                    confidence: high

OrderItem (actual)  ListItem + quantity: number
                    persistido en localStorage["order"] como JSON array
                    evidence: src/hooks/useList.ts
                    confidence: high

ManualItem (actual) ListItem con id aleatorio de 10 dígitos y price: 0
                    persistido en localStorage["itemArrayNew"]
                    evidence: FormProductCustom.tsx, App.tsx
                    confidence: high

CatálogoPropio      69 productos, 17 categorías (type). Precios de relleno:
                    54 de 69 valen 40 €, así que el "Total aprox" actual no significa nada.
                    evidence: src/data/db.ts
                    confidence: high

MercadonaCategory   id, name, nivel (grupo -> pasillo -> subcategoría), hijos
                    evidence: fuentes 4, 6, 7 (categoryL1/L2/L3, categoryPath)
                    confidence: medium (nombres exactos de campos a verificar contra una respuesta real en architect)

MercadonaProduct    id (numérico, como string), nombre, envase/packaging, url de foto (imgix, varios tamaños),
                    precio, precio de referencia + formato (€/kg, €/L, €/ud), tamaño + formato,
                    precio anterior (si rebaja), categoría (3 niveles), url de la ficha
                    detalle opcional: marca, origen, ingredientes, alérgenos, galería, EAN
                    evidence: fuentes 6, 7, 8
                    confidence: medium

Warehouse           código (p. ej. vlc1, mad1), resuelto desde el código postal; determina surtido y precio
                    evidence: fuentes 4, 6, 7
                    confidence: medium. El código del almacén que sirve La Rinconada (41300/41309): guess, sin verificar
```

Relationships: MercadonaCategory 1-n MercadonaCategory (árbol), MercadonaCategory 1-n MercadonaProduct, Warehouse 1-n precio de MercadonaProduct, OrderItem n-1 (ListItem | ManualItem | MercadonaProduct copiado).

Regla clave para architect: al añadir un producto de Mercadona se guarda **una copia** (nombre, precio, foto, categoría, id de Mercadona) dentro del `OrderItem`. La lista no depende de que la API responda después.

Riesgo de ids: hoy conviven ids 1-69 (catálogo propio) y aleatorios de 10 dígitos (manuales). Los de Mercadona son numéricos de otro rango. Las funciones `addItem` (deduplica por id) y `addOtherItem` (deduplica por nombre) son inconsistentes. Architect debe fijar un id con origen (`source`) sin romper los objetos ya guardados.

## Feature matrix

See `features.csv`. Convención usada aquí: `original = yes` cubre tanto lo que ya hace ListType (hay que conservarlo) como lo que hace el catálogo de Mercadona (hay que traerlo). `clone = yes` si ListType ya lo hace bien hoy, `partial` si lo hace con bugs, `no` si falta. Las filas con `original = no` son mejoras propias y no cuentan en la paridad.

Must: 23 (20 puntuables + 3 mejoras propias), should: 7, could: 5, skip: 6. Paridad de partida (parity.py): 52,8 / 100, con 10 de 20 must hechos.

## Out of scope (cannot or should not be cloned)

- Comprar, pagar, franjas de entrega, cuenta de cliente de Mercadona: no es una tienda, es una lista.
- Búsqueda vía Algolia con la clave incrustada en el frontend de Mercadona: más gris todavía; se busca en local.
- Marca, logo y textos de Mercadona como identidad de la app. Las fotos de producto se muestran enlazadas desde su CDN, solo para uso personal; no se redistribuyen.
- Reseñas: Mercadona no tiene (fuente 7).
- Fases de REA que no aplican a una app personal: entrepreneur, brand (más allá de título e icono propios), launch.

## Huecos de esta recon (honestidad)

- Las pantallas M02-M06 no se han visto: la tienda es una SPA y no había navegador conectado. No hay capturas en `replica/screens/`. Opciones: que el usuario pase capturas de la tienda en su móvil, o recorrerla con el navegador del usuario delante, a ritmo humano.
- Los nombres exactos de los campos JSON vienen de documentación de terceros, no de una respuesta real. Se verifican en architect con una o dos peticiones manuales.
- No sabemos si el CDN de imágenes (imgix) permite CORS. Importa para meter fotos en el PDF con jsPDF.

## Size

Screens 4 actuales + 4 nuevas, flows 7, entities 6. Hard parts:
1. Proxy en Vercel para CORS + respeto del rate limit (429): caché por categoría, nada de descargar el catálogo entero en bucle.
2. Tamaño de `localStorage` (~5 MB por origen): ~4.300 productos completos no caben con holgura junto a la lista; caché perezosa por categoría con caducidad.
3. Migración compatible de `order` e `itemArrayNew` + PDF que siga funcionando (y que no se salga del A4), idealmente con foto y precio.

Size: S (un fin de semana largo). Sube a M si se quiere PDF con fotos y el CDN no permite CORS (habría que pasar las imágenes por el proxy).
