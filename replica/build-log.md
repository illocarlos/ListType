# Build log

Paridad (parity.py): 52,8 → 85,2 / 100. Must hechos: 16 de 20.

Pruebas: 46/46 en Chromium (escritorio 1440 px y móvil 390 px) con respuestas simuladas de Mercadona y datos de `localStorage` en el formato antiguo. `npm run build` y `npm run lint` sin errores ni avisos.

| ID | fecha | estado | qué falta | qué costó más de lo previsto |
| --- | --- | --- | --- | --- |
| S01 | 2026-10-21 | done | — | el filtro guardaba su propio resultado como fuente; se pasa a derivado con `useMemo` |
| S02 | 2026-10-21 | done | — | — |
| S03 | 2026-10-21 | done | precios reales del catálogo propio (54 de 69 a 40 €) | — |
| S04 | 2026-10-21 | done | — | miniaturas: se normalizan a JPEG con canvas porque jsPDF necesita los bytes |
| S05 | 2026-10-21 | partial | verificar contra la API real en la vista previa de Vercel | el `robots.txt` de Mercadona impide leer una respuesta real desde aquí |
| S06 | 2026-10-21 | partial | idem; búsqueda solo sobre pasillos ya abiertos | — |
| S07 | — | no | ficha de producto (could) | — |
| S08 | 2026-10-21 | partial | confirmar el código de almacén de Sevilla | — |

## Cambios fuera de pantallas

- `api/mercadona.js` y `api/mercadona-img.js`: proxy de solo lectura con lista blanca de rutas y de host, caché en el CDN de Vercel.
- `vercel.json`: reescritura `/api/mercadona/*` → función.
- `vite.config.ts`: proxy equivalente para desarrollo local.
- jsPDF se carga al pulsar el botón: desaparece el aviso de chunk > 500 kB.
- `useList`: la lista tiene prioridad sobre la caché si se llena `localStorage`.
- Borrado `.p` (copia suelta de la config de Tailwind).

## Desviaciones de las reglas de REA (decisión del usuario)

- Se consume la API interna de Mercadona y se muestran sus fotos desde su CDN. Build prohíbe cargar nada del dominio del original; aquí Mercadona no es la app que se clona sino la fuente de datos que el usuario ha elegido, para uso personal.

## 2026-10-21 · Rediseño (fase 3 design) y buscador

- Tokens propios en `replica/design/` (verde oliva + amarillo para el contador, Onest). Contraste: 16 pares, 0 fallos AA.
- Buscador en la cabecera: tiempo real desde la primera letra, sin acentos, por palabras, sobre tus productos y todo Mercadona. Al enfocarlo se cargan en segundo plano los pasillos que falten (antes solo buscaba en los abiertos: era un fallo de diseño).
- Filas con − n + en los resultados; lista fija a la derecha en escritorio y hoja a pantalla completa desde la barra inferior en el móvil.
- Alta manual en diálogo; desde "sin resultados" se crea el producto con el nombre ya escrito.
- Errores de Mercadona con el código real (403, 404, 429, 502) para diagnosticar.
- Se conservan: catálogo propio por categorías, alta manual, persistencia compatible, cantidades, quitar, total y PDF.
- Pruebas: 52/52 en Chromium (escritorio y móvil) con respuestas simuladas.

## 2026-10-21 · Favoritos y fuera productos a mano (decisión del usuario)

- Se retiran el catálogo propio (`db.ts`) y el alta manual. Los datos ya guardados (`order`, `itemArrayNew`) no se borran: lo antiguo sigue en la lista hasta que se quite.
- "Tus productos" pasa a ser **Tus favoritos**: productos de Mercadona marcados con el corazón, guardados en `localStorage["favorites"]` como copia completa (se ven aunque Mercadona falle) y actualizados cuando llegan datos nuevos.
- Riesgo asumido: la app depende por completo de Mercadona y no se puede apuntar nada que Mercadona no venda.
- Diagnóstico del 404: se quita `vercel.json`; la app llama a `/api/mercadona?path=…` y distingue el 404 de Vercel (función no encontrada) del 404 de Mercadona. Comprobación: `/api/mercadona?path=ping`.
- Pruebas: 38/38 en Chromium (escritorio y móvil) con datos simulados; la función del proxy probada en local con peticiones simuladas.

## 2026-10-21 · Novedades y app instalable

- **Novedad**: marca `is_new` de Mercadona + detección propia. La app apunta en `localStorage["mercadona-seen:v1:<almacén>"]` el día en que ve cada pasillo y cada producto; lo que aparece en un pasillo ya conocido es novedad 60 días. Mercadona no publica fecha de lanzamiento: la detección propia empieza a contar desde el primer uso.
- **App instalable (PWA)**: manifest, iconos propios (cesta), etiquetas de iOS, zona segura bajo la barra de estado, aviso de instalación solo en iPhone/iPad. Service worker: página con red primero y copia sin conexión; `/assets/` en caché; `/api/` y otros dominios sin tocar.
- Limitación de iOS: la app instalada tiene su propio `localStorage`, distinto del de Safari.
- App nativa (Capacitor) pendiente: requiere Mac con Xcode y cuenta de desarrollador de Apple.
- Pruebas: 13/13 nuevas (novedades, manifest, sin conexión, aviso en iPhone) + 38/38 de regresión.

## 2026-10-21 · Pestaña de novedades

- Portada con pestañas: Favoritos, Novedades (con contador amarillo) y Pasillos.
- Novedades: todos los productos marcados como novedad, agrupados por pasillo, con − n + y corazón. Al abrir la pestaña se carga el catálogo completo si hace falta, con su barra de progreso.
- Los avisos de error de Mercadona salen en el buscador, en Novedades y en Pasillos.
- Pruebas: 18/18 (novedades, pestañas, app instalable) + 38/38 de regresión.

## 2026-10-21 · Zona por código postal y accesibilidad

- La zona de precios se elige con el código postal: el proxy pregunta a Mercadona (`PUT /api/postal-codes/actions/change-pc/`, cabecera `x-customer-wh`) y la app guarda `{ postalCode, wh }` en `localStorage["mercadona-zone:v1"]`. Desaparece "Almacén SVQ1".
- Auditoría de accesibilidad y arreglos: ver `replica/accesibilidad.md`. Resultado: 0 problemas en 7 pantallas.
- Pruebas: 15/15 (zona y teclado) + 18/18 + 38/38 de regresión; proxy de código postal probado en local con peticiones simuladas.

## 2026-10-21 · Ubicación y botón de instalar

- **Código postal por ubicación**: botón "Usar mi ubicación". El proxy (`path=geo`) redondea las coordenadas a 3 decimales (~100 m), comprueba que están en España y pregunta a OpenStreetMap (Nominatim) cumpliendo su política: servidor propio con caché de 30 días, identificación de la app, uso solo a petición del usuario y atribución visible. La ubicación no se guarda; solo el código postal y su almacén.
- **Instalar en un toque**: se captura `beforeinstallprompt` al arrancar. En Android y ordenador (Chrome, Edge, Samsung Internet) el botón "Instalar la app" abre el diálogo del sistema. En iPhone Apple no lo permite: pasos numerados. En Android sin aviso del navegador: indicación del menú ⋮.
- Pruebas: 16/16 nuevas (ubicación concedida, denegada, fuera de España; instalación en cada plataforma; axe sin problemas) + 15/15 + 18/18 + 38/38 de regresión. Auditoría: 0 problemas, 0 textos < 14 px, 0 zonas táctiles < 44 px.

## 2026-10-21 · Actualización en segundo plano

- Al abrir la app, al volver a ella (`visibilitychange`), al recuperar conexión y cada hora con la app visible: si hay pasillos ya descargados con más de 24 h, se vuelven a pedir en silencio, de uno en uno con pausa de 400 ms; para ante un 429. No descarga pasillos que el usuario nunca abrió. Respeta "ahorro de datos" (`navigator.connection.saveData`).
- Los productos de Mercadona de la lista se actualizan con los datos nuevos (precio, foto, formato, novedad) sin tocar la cantidad, igual que los favoritos.
- Límite: con la app cerrada no se actualiza (iPhone no lo permite; en Android dependería del navegador).
- Pruebas: 10/10 nuevas + 16 + 15 + 18 + 38 de regresión; auditoría sin problemas.

## 2026-10-21 · Zoom de fotos

- Miniatura ampliable (`components/Thumb.tsx`): mantener pulsado 250 ms muestra la foto grande mientras se mantiene y se quita al soltar; un toque corto la deja abierta hasta tocar o pulsar "Cerrar"; Intro/Espacio con teclado; si el dedo se mueve más de 10 px es scroll y no abre. La foto grande se pide al CDN de Mercadona a 900 px sin recortar, con la miniatura de fondo mientras carga. Lupa en la esquina para que se sepa que se puede ampliar.
- Corregido durante las pruebas: el clic que el navegador envía tras un toque cerraba la foto recién abierta; ahora se abre en ese clic. Escape desde la lista cierra solo la foto.
- Pruebas: 17/17 (dedo, scroll, toque, ratón, teclado, desde la lista, axe con la foto abierta) + 97 de regresión; auditoría sin problemas.

## 2026-10-21 · Zoom: solo mantener pulsado (decisión del usuario)

- Mantener pulsado 150 ms amplía; soltar quita. El toque corto ya no deja la foto abierta (lo pidió el usuario). Con teclado: Intro abre, Escape cierra.
- Se quita también ante cualquier interrupción: `pointercancel`, `lostpointercapture`, `touchcancel`, pérdida de foco o la app pasando a segundo plano (escuchas de respaldo en la ventana).
- Bloqueados los gestos de Safari sobre la foto (menú de guardar imagen, selección, arrastre) y la imagen ya no recibe el toque (`pointer-events: none`), para que no corten el gesto.
- Pruebas: 18/18 (mantener 2 s con temblor leve, toque corto sin efecto, interrupción del sistema, scroll, ratón, teclado, desde la lista) + 97 de regresión. No se ha podido probar en el motor de Safari (WebKit no se puede descargar en este entorno).

## 2026-10-22 · Caché de Vercel más corta

- Productos y precios: `s-maxage=21600, stale-while-revalidate=3600` (antes 86400 y 604800). Con la caché de 24 h del móvil, el retraso máximo baja de unos 3 días a algo más de un día (6 h + 1 h + 24 h). Fotos y código postal → almacén sin cambios (casi no cambian).

## 2026-10-22 · Caché de Vercel a 12 h (decisión del usuario)

- Productos y precios: `s-maxage=43200, stale-while-revalidate=3600`. Retraso máximo de un precio: unas 37 h (12 + 1 + 24). La mitad de peticiones a Mercadona que con 6 h.

## 2026-10-22 · Plan B y aviso de bloqueo

- **Plan B**: si Mercadona no responde (pasillos con error o carga parada sin productos), el buscador ofrece "Añadir «lo escrito» a la lista" con un toque (sin foto ni precio, `source: "manual"`); repetirlo suma cantidad. Con Mercadona funcionando no aparece.
- **Aviso para el dueño**: `/api/mercadona?path=status` devuelve 200 si Mercadona responde y 503 si rechaza, cacheado 1 h en el CDN (vigilable con UptimeRobot u otro servicio sin cargar a Mercadona). Cada 401/403/429 queda en los registros de Vercel con la marca `[MERCADONA_RECHAZO]`.
- Pruebas: 10/10 nuevas + 115 de regresión; auditoría sin problemas.

## 2026-10-22 · Mejoras para compradores

- Proxy: lista blanca ampliada a `home/price-drops/`, `home/new-arrivals/`, `products/<id>/` y `products/<id>/similars/`. Cuentas de cliente, carrito y login siguen bloqueados.
- Lector tolerante (`findProducts`): busca productos en cualquier parte del JSON, porque estas respuestas no están documentadas ni se han podido ver reales.
- **Rebajas** (pestaña) con la lista oficial de bajadas de precio, agrupada por pasillo, y aviso en Favoritos ("N de tus favoritos han bajado de precio").
- **Novedades oficiales** de Mercadona + `is_new`. Retirada la detección propia de 60 días. La pestaña ya no carga todo el catálogo.
- **Ficha del producto** (botón "Ficha"): foto grande, marca, origen, alérgenos destacados, ingredientes, aviso de comprobar el envase, historial de precio y hasta 3 **parecidos más baratos** con su ahorro. Solo se pide al abrirla.
- **Historial de precios** de favoritos en `localStorage["price-history:v1"]` y nota "Ha subido/bajado un X % desde que lo guardaste".
- **PDF modo tienda**: casillas para tachar y letra de 14 pt; mismo título y datos.
- **Enviar por WhatsApp** (`wa.me`) con la lista y el total.
- Abrir un pasillo también actualiza precios de favoritos y lista. Diálogos apilables: Escape cierra solo el de arriba.
- Pruebas: 27/27 nuevas + 125 de regresión; auditoría sin problemas.

## 2026-10-22 · Rebajas comprobables

- El usuario veía demasiadas rebajas. Causa probable: el lector tolerante recoge cualquier producto de la respuesta (puede traer otras secciones) y no se exigía precio anterior.
- Ahora Rebajas solo muestra productos con `previousPrice > price`, con el descuento visible ("−9 %"), ordenados por descuento dentro de cada pasillo. El contador y el aviso de favoritos usan el mismo criterio.
- Pruebas: 30/30 (incluye productos sin precio anterior y con precio anterior menor, que quedan fuera) + 125 de regresión; auditoría sin problemas.

## 2026-10-22 · Contraste con datos reales

- Fuentes: fixtures de respuestas reales de `mercapy` y el volcado público de `jccsoft/Mercadona` (5.269 entradas, 4.942 productos distintos, marzo de 2024).
- **Granel** (`selling_method: 1`, 12 productos reales): `unit_price` no vale (1.084,05 € el gambón, o el precio de una bandeja de 200 g); el precio real es `bulk_price` por kilo. La app muestra "10,95 € /kg", cuenta en kilos ("2 kg", "kg aprox." en PDF y WhatsApp) y el lector de pantalla dice "a granel" y "un kilo". Sin precio anterior en granel (comparaba con el `unit_price` disparatado).
- `price_decreased` viene siempre en falso aunque haya bajada: no se usa (ya no se usaba). Bajadas reales en el volcado: 116 productos (2,3 %), ninguno con "precio anterior" más barato.
- Novedad también con `is_new_arrival` a nivel de producto (campo de la ficha real).
- Ficha: la foto `zoom` real es de 3.600 px; se pide a 900 px.
- `previous_unit_price` puede traer espacios delante: se recortan.
- Prueba con el catálogo real completo pasado por la app: 5.255 entradas comparadas una a una (precio, precio anterior, granel, nombre, foto) con 0 discrepancias; un producto que está en dos pasillos sale una vez en el buscador.
- Sin verificar con respuesta real: la forma exacta de `home/price-drops/` y `products/<id>/similars/` (el lector tolerante y el filtro `previousPrice > price` cubren las variantes).
- Pruebas: 40/40 + 9/9 con datos reales + 125 de regresión; auditoría sin problemas.

## 2026-10-22 · La app instalada se actualiza

- Causa: el iPhone deja la app instalada dormida en memoria; al abrir el acceso directo la "despierta" sin volver a cargar la página, así que seguía la versión vieja aunque Vercel ya tuviera otra (el service worker ya pedía la página primero a la red, pero solo cuando se carga).
- **Detección de versión nueva** (`src/helpers/appUpdate.ts`): pide `/` a la red sin caché y compara el nombre de `/assets/index-<huella>.js` con el que está funcionando. Al abrir, al volver a la app y cada hora.
- Al volver tras 2 min o más fuera, si hay versión nueva y aún no se ha tocado nada ni hay una ventana abierta, **se recarga sola**. Si no, aviso "Hay una versión nueva de la app" con botón "Actualizar ahora" (zona `role=status`).
- **Tirar hacia abajo para actualizar** solo en la app instalada (en el navegador ya existe el gesto propio): desde arriba del todo, sin ventana abierta, vertical; indicador "Desliza / Suelta para actualizar / Actualizando…". Recargar no fuerza a bajar otra vez el catálogo (sigue la caché de 24 h y la del CDN de 12 h); la lista y los favoritos no se pierden.
- Pruebas: 19/19 nuevas + 174 de regresión (incluye datos reales); auditoría sin problemas.

## 2026-10-22 · Rebajas con la respuesta real de Mercadona

- El usuario envió la respuesta real de `home/price-drops/` (Sevilla, svq1, 22-10-2026, impresa desde Safari con el margen derecho cortado).
- Forma real: `{layout, title: "Bajadas de precio", source: "price-drops", source_code: "PD", items: [...], uuid}`. **142 productos, los 142 con `previous_unit_price`**: la lista es de bajadas de verdad y ese es el número real que publica Mercadona (no un fallo de la app). `price_decreased` no se pudo leer (línea cortada). Claves de `price_instructions` en orden alfabético, como en los datos de 2024.
- Cada producto trae **una sola categoría, de nivel 0** ("Bodega", "Congelados"…), no el pasillo.
- **Fallo corregido**: si el pasillo del producto ya estaba en el móvil (copia de hasta 24 h), su precio mandaba sobre el de la lista de rebajas; una bajada de hoy desaparecía de Rebajas. Ahora precio y precio anterior de la lista oficial mandan. Reproducido antes del arreglo (3/8) y resuelto (8/8).
- **Títulos**: Novedades y Rebajas se agrupan por sección grande; los productos de pasillos abiertos se llevan a su sección para no salir bajo dos títulos.
- Sin verificar: `unit_price` de cada rebaja (cortado en la impresión) y `products/<id>/similars/`.
- Pruebas: 8/8 nuevas + 193 de regresión; auditoría sin problemas.

## 2026-10-22 · Pasillos plegables, fila compacta y Volver arriba (opción B + C + E)

- Medido con el catálogo real: un pasillo de 54 productos eran 11 pantallas de scroll y el más grande (132) 25; la fila medía ~150 px. Maqueta interactiva comparando opciones; el usuario eligió B + C con Volver arriba.
- **B, secciones plegables** (`Collapsible.tsx`): subcategorías de cada pasillo, y secciones de Rebajas y Novedades, cerradas al entrar con su número de productos ("Pollo · 47 productos"). Si solo hay una, se abre sola. Los productos solo se pintan al abrir. Botón dentro de `h3` con `aria-expanded`/`aria-controls`.
- **C, fila compacta** (`ProductRow.tsx`, en toda la app): precio, envase y + en la misma línea; la ficha se abre tocando el nombre (icono de información, nombre accesible "Ficha de …"). El + es un botón redondo de 44 px con nombre "Añadir … a la lista". Media real en Pollo: 112 px.
- **E, Volver arriba** (`BackToTop.tsx`): aparece al bajar más de 1,2 pantallas, a la izquierda y encima de la barra "Ver lista" para no tapar los +; sube y deja el foco en el título de la app; respeta "reducir movimiento".
- Pruebas: 18/18 nuevas con el catálogo real + 193 de regresión (Rebajas adaptada a secciones cerradas); auditoría sin problemas.
