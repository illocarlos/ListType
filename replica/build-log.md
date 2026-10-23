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

## 2026-10-22 · Ficha: abrir los parecidos más baratos

- El usuario esperaba que tocar el nombre de un "parecido y más barato" abriera ese producto (como ya pasa con el nombre en el resto de la app).
- Ahora el nombre del parecido es un botón ("Ficha de …", con icono de información) que abre su ficha en la misma ventana. Arriba aparece "Volver a «producto anterior»"; se puede encadenar y volver paso a paso. Al cerrar y reabrir se empieza de cero.
- Al cambiar de producto la ficha sube arriba y el foco pasa a "Volver" (para teclado y lector de pantalla).
- Pruebas: 13/13 nuevas + 211 de regresión; auditoría sin problemas.

## 2026-10-22 · Revisión completa: arreglos de prioridad alta

Revisión de seguridad y fallos de todo el código. Se aplican los cuatro de prioridad alta:

- **PDF en iPhone/iPad**: en las apps de pantalla de inicio las descargas fallan (WebKit 275288 y 290847, iOS 16–18: no hacen nada o abren una vista sin botón para volver). En iOS el PDF se entrega ahora con el menú de compartir (`navigator.share` con el archivo: Guardar en Archivos, Imprimir, WhatsApp). Si Safari no lo permite porque preparar el PDF tardó (necesita un toque reciente), aparece "Guardar o enviar el PDF" para un segundo toque. Fuera de iOS, o si no se pueden compartir archivos, descarga de siempre. Sin probar en un iPhone real.
- **Proxy**: si Mercadona respondía 200 con algo que no son datos (página anti-bots, mantenimiento), se guardaba 12 h en el CDN y la app se quedaba sin catálogo para todos. Ahora solo se guarda JSON (objeto o lista); si no, 502 sin caché y aviso `[MERCADONA_NO_JSON]` en los registros. Además `stale-if-error=86400`: si Mercadona falla al renovar, el CDN sigue sirviendo la última copia buena 1 día.
- **Almacenamiento lleno**: con el móvil lleno se perdían favoritos y código postal al recargar (reproducido). El catálogo completo ocupa ~1,9 millones de caracteres (~3,8 MB en Safari, de ~5 MB). `saveImportant` guarda lista, favoritos, zona, almacén, historial y aviso de instalar borrando la caché de Mercadona más antigua hasta que quepa. Al cambiar de almacén (y al abrir) se borra la caché de otros almacenes.
- **jsPDF 3.0.2 → 4.2.1** (avisos críticos; el único cambio incompatible es del uso en Node) y `fflate` 0.8.3: 0 avisos en las dependencias de la app. Las de desarrollo (Vite, ESLint…) tienen avisos pero no llegan al móvil.
- Pendiente de la revisión (media/baja): reintento con otro almacén en el proxy, parámetros que saltan la caché y regla de límite en Vercel, lista de rebajas guardada 24 h (no se renueva al volver, como se dijo por error), aviso de precios antiguos, cabeceras de seguridad, fuente de Google, limpieza del modo sin conexión, textos ("pulsa «Añadir»", "total: 0,00 €"), WhatsApp con listas largas.
- Pruebas: 9/9 PDF + 8/8 almacenamiento + 5/5 proxy + 225 de regresión; auditoría sin problemas.

## 2026-10-22 · Revisión completa: arreglos de prioridad media

- **Sin reintento con otro almacén** (proxy): si un producto no existía en tu zona, se pedía el de la zona por defecto y se enseñaba con su precio, guardado 12 h como si fuera el tuyo. Ahora devuelve el 404 (guardado 10 min para no repetir la pregunta) y la app dice "Mercadona no tiene esto disponible ahora mismo en tu zona".
- **Sin saltarse la caché del CDN** (proxy): la caché de Vercel va por dirección completa con parámetros. Se rechaza con 400, sin llegar a Mercadona ni a OpenStreetMap: cualquier parámetro que no sea de la ruta, almacén ausente/en mayúsculas/repetido, idioma distinto de `es`, rutas sin barra final o con ceros delante, código postal con espacios y coordenadas que no vengan con 3 decimales. `ping` ya no muestra la versión de Node; los errores ya no incluyen la dirección de Mercadona.
- **Actualización en segundo plano ante un bloqueo**: antes, con 403 de Mercadona seguía pidiendo todos los pasillos caducados (hasta 153) en cada apertura; ahora para al primer fallo que no sea 404.
- **Rebajas y novedades cada hora** en el móvil (antes 24 h, no "cada vez que se vuelve a la app" como se dijo por error). No cargan a Mercadona: las sirve la copia del CDN.
- **Aviso de precios antiguos**: "Precios sin actualizar desde el 17 de octubre…" si la última descarga de pasillos tiene más de 48 h y ya se ha intentado renovar en esta sesión (o hay ahorro de datos). Se lee solo el principio de cada entrada de caché.
- **Cabeceras de seguridad** (`vercel.json`): Content-Security-Policy (solo la propia app y las fotos de Mercadona), nosniff, X-Frame-Options DENY / frame-ancestors 'none', Referrer-Policy, Permissions-Policy (ubicación solo en la app). Probada la app entera con la política: 0 violaciones.
- **Fuente propia**: Onest desde `@fontsource/onest` 5.3.1 (juego latino, 5 grosores, ~15 kB cada uno). Google ya no recibe la IP de cada usuario.
- Pendiente (baja): limpieza del modo sin conexión, textos ("pulsa «Añadir»", "total: 0,00 €"), WhatsApp con listas largas, proxy de fotos (tamaño antes de descargar), aviso de favoritos rebajados con secciones cerradas. Regla de límite de peticiones en el panel de Vercel (la tiene que crear el dueño).
- Pruebas: 22/22 proxy + 8/8 frescura + 10/10 con la política de seguridad + 249 de regresión; auditoría sin problemas.

## 2026-10-22 · Rebajas cada 12 h, edad real del precio y pausa tras un rechazo

- El usuario señaló que renovar rebajas cada hora no tenía sentido. Cierto: el CDN de Vercel solo renueva su copia cada 12 h, así que preguntar más a menudo devuelve lo mismo (no cargaba a Mercadona, pero no aportaba). Ahora **12 h** en el móvil.
- Para que eso no enseñe rebajas terminadas: **manda el precio más reciente**, venga de la rebaja o del pasillo. La edad es la **real del contenido**: el proxy marca cada respuesta con `x-listtype-fetched-at` (hora a la que la sacó de Mercadona) y el CDN guarda la marca con la copia. Sin marca (entradas antiguas, desarrollo local) se usa cuándo se guardó.
- Efecto secundario detectado y corregido al revisar: con `stale-if-error` (publicado antes) el CDN puede dar una copia de hasta ~2 días mientras Mercadona falla; con la hora del móvil, el aviso de precios antiguos habría llegado un día tarde y "lo más reciente" podía elegir lo más viejo. Con la edad real, no.
- El móvil sigue decidiendo cuándo renovar por la hora a la que guardó (24 h pasillos, 12 h rebajas), no por la edad del contenido: si no, mientras el CDN da copias viejas, cada apertura reintentaría y sumaría peticiones a Mercadona.
- **Pausa de 30 min** tras un rechazo o caída de Mercadona (no por 404, sin conexión ni errores de la app): ni las renovaciones automáticas ni las listas sin guardar preguntan; se enseña lo guardado. Se levanta en cuanto Mercadona responde bien (también al aceptar un código postal). Lo que pide la persona (abrir un pasillo, la ficha) no se bloquea.
- **Peticiones duplicadas**: al abrir, dos partes pedían las rebajas a la vez; ahora sale una sola petición (las iguales en curso se comparten).
- Comprobado contra datos reales: ningún id con cero delante (las reglas estrictas del proxy no rompen nada), 69 ids con decimal (admitidos), todas las fotos de prod-mercadona.imgix.net (la CSP no bloquea ninguna). El aviso de precios antiguos cuesta 0,2 ms por lectura.
- Pruebas: 8/8 edad real + 12/12 rebajas + 13/13 frescura y pausa + 276 de regresión; auditoría sin problemas.

## 2026-10-22 · Foto del PDF al doble, rebajas cada 24 h y revisión independiente

Publicado de una vez: lo pedido por el usuario más los arreglos de una revisión hecha por un agente aparte que no había visto el código mientras se escribía.

Lo pedido:
- **Foto del producto en el PDF al doble**: 28 mm, preparada a 240 px para que no salga borrosa. Efecto secundario: caben 6 productos por página (antes 11), así que una lista larga ocupa más páginas.
- **Rebajas y novedades cada 24 h** en el móvil (antes 12 h). Sigue mandando el precio más reciente entre rebaja y pasillo, por la edad real del contenido.

Arreglos de la revisión:
- **El buscador ya no insiste a Mercadona durante la pausa**. Antes la carga de pasillos para el buscador no miraba la pausa de 30 min. Ahora:
  - Se prueba primero un solo pasillo; si va bien, el resto se carga de dos en dos.
  - La carga para ante un rechazo, durante la pausa o tras 3 fallos seguidos.
  - "Reintentar" a mano sí lo intenta, y se vuelve a parar al primer rechazo.
  - Si se usa una copia antigua de un pasillo, cuenta como pasillo que falta, para que salga el aviso.
- **Rechazos de Mercadona protegidos por el CDN**:
  - El proxy devuelve 401/403/429 como 503 `upstream_refused`, con el código real en `upstreamStatus` y `Retry-After: 1800`.
  - El motivo: RFC 5861 define el error de `stale-if-error` como 500/502/503/504. La documentación de Vercel solo pone ejemplos (500, fallo de red, DNS) y no dice si un 403 cuenta. Con un 5xx, el CDN sigue sirviendo la última copia buena.
- **Respuestas negativas guardadas en el CDN**:
  - "Sin reparto" en un código postal, fuera de España o sin código postal: 1 día.
  - Producto inexistente en tu zona: 10 min, igual que antes.
  - Si Mercadona falla (5xx) al buscar la zona, ahora es un 502 sin caché; antes se decía, por error, "no hay reparto".
- **La pausa solo se levanta con datos recién sacados de Mercadona** (menos de 2 min). Antes se levantaba también con una copia del CDN y al aceptar un código postal. Un 500 suelto ya no activa la pausa: solo los rechazos y 502/503/504.
- **Aviso de precios antiguos**: usa el pasillo más viejo de los actuales. Antes usaba el más reciente, y el aviso podía no salir.
- **Carreras**:
  - Abrir un pasillo y luego otro ya no enseña los productos del primero bajo el título del segundo.
  - Al cambiar de zona se descartan las rebajas que lleguen tarde de la zona anterior.
- **Modo sin conexión**:
  - Ya no se guarda una página de error como copia.
  - Al instalar y con cada versión nueva se guardan JS, CSS, fuentes woff2 y la librería del PDF, y se borran los archivos de versiones anteriores.
  - `/assets/` va con `immutable`.
- **Lector de pantalla y teclado**:
  - Se anuncia al añadir y al quitar.
  - El foco no se pierde al quitar con la papelera, al quitar un favorito, al abrir o cerrar un pasillo ni al cambiar de zona.
- **Parecidos más baratos**: solo del mismo modo de venta. Ya no se mezcla granel con unidad, y el granel lleva "/kg".
- **Ficha antigua**: si la ficha viene de una copia de más de 48 h, se dice ("Esta ficha es del …").
- **Proxy de fotos cerrado a lo que usa la app**:
  - Solo `/images/…` de prod-mercadona.imgix.net, con `fit` y `w`/`h` hasta 900. Comprobado con las 5.269 fotos reales: todas cumplen.
  - No sigue redirecciones, solo admite formatos de foto y mira el tamaño antes de descargar.
  - Lleva `nosniff`.
- **Historial de precios por zona**: solo se apuntan precios confirmados en el catálogo de la zona actual. Al cambiar de código postal, el precio de la otra zona ya no cuenta como subida o bajada.
- **Código postal**: se valida la provincia (01–52) en la app y en el proxy.
- **Ubicación**: precisión normal en vez de alta. Basta con el código postal, gasta menos batería y es más rápida.
- **Nombre del producto**: el área para tocarlo sube de 22 a 36 px de alto (cumple WCAG 2.2 AA, 24 px) con un pseudo-elemento que ocupa el margen de la tarjeta, sin cambiar la altura de la fila (111 px de media, como antes). La revisión proponía 44 px, pero con relleno real la fila crecía a ~131 px y deshacía la fila compacta. Comprobado en 320 y 390 px que no roba toques al +, al corazón ni a otra fila, y que no se sale de su tarjeta.

Pendiente o sabido:
- No hay lista de almacenes permitidos en el proxy.
- La miniatura no hace nada al tocarla.
- En Safari sin instalar, la app puede borrar los datos tras 7 días sin uso (ITP).
- Las coordenadas aparecen en los registros de Vercel.
- La regla de límite de peticiones en Vercel la tiene que aprobar el dueño.

Pruebas: 322 de regresión (e2e3–e2e23, incluidas sin conexión, política de seguridad y PDF) + 49 del proxy y del proxy de fotos; auditoría axe con 0 problemas (la única zona táctil por debajo de 44 px es el nombre, a 36 px). `tsc` y `eslint` limpios.

## 2026-10-22 · Barra de abajo en el móvil (secciones + lista)

- Idea sacada de las maquetas inspiradas en KitchenOwl y EasyCompra, pero con el estilo de la app (Onest, verde y amarillo de siempre).
- **Móvil**: las pestañas Favoritos, Novedades, Rebajas y Pasillos pasan de arriba (rejilla de 2×2, unos 116 px) a una barra fija abajo, junto al botón de la lista. El botón de la lista conserva lo que tenía la barra "Ver lista": cuántos productos lleva y el total; sin precio, pone "Lista".
- Son las mismas pestañas de antes (mismo papel de pestaña, mismos `id`, flechas del teclado): en escritorio siguen arriba y la lista en la columna derecha. Se decide con `matchMedia` (`useMediaQuery`), así solo existe una fila de pestañas a la vez y no hay `id` repetidos.
- La barra está siempre a mano, también mientras se busca. Tocar una sección deja de buscar, la enseña y sube arriba. Tocar la sección en la que ya estás también sube arriba. Mientras se busca, ninguna sección sale marcada.
- Números sobre los iconos: amarillo en Novedades y Rebajas, neutro en Favoritos; "99+" si pasa de 99.
- Sin estilo al pasar el ratón en la barra: en el iPhone el "hover" se queda pegado tras tocar, y al buscar después la última sección tocada parecía seguir marcada.
- Letra de 14 px desde 390 px de ancho, 13 px de 360 a 389 y 12 px por debajo de 360 (con 14 px, "Novedades" no cabe en 360 sin pegarse a "Rebajas"). Comprobado en 320, 360 y 390 px: los nombres no se pisan y todas las zonas de toque son de 56 px de alto.
- "Volver arriba" queda encima de la barra sin taparla. La barra va dentro de `<nav aria-label="Menú principal">` (axe pedía que todo estuviera en una zona con nombre).
- Vercel: creada a petición del dueño la regla de cortafuegos "Límite /api por IP" (400 peticiones por minuto por IP a `/api/`). Vercel añadió además sus reglas básicas en modo solo registrar.
- Pruebas: 22/22 nuevas de la barra + regresión completa (e2e3–e2e23); una prueba de rebajas fallaba 1 de cada 3 veces por una carrera de la propia prueba (contaba peticiones de la carga anterior): ahora espera a que termine antes de empezar a contar, 5/5. Auditoría: 0 problemas axe, ningún texto de menos de 14 px y el foco nunca queda tapado por la barra.

## 2026-10-22 · Dirección nueva: mercalista.vercel.app (con mudanza de datos)

- El dueño pidió cambiar el nombre. `mercacompra.vercel.app` ya era de otra cuenta de Vercel, así que se eligió `mercalista.vercel.app`, gratis. Se añadió al proyecto y sirve la misma app que la vieja; las dos funcionan a la vez.
- **Problema**: la lista, los favoritos, la zona y el historial se guardan en el navegador por dirección, así que en la nueva la app saldría vacía. Además, en el iPhone la app de la pantalla de inicio no comparte datos con Safari (WebKit 181849, decisión de Apple): aunque el enlace se abra en Safari, la app nueva instalada empieza vacía.
- **Mudanza** (`src/helpers/move.ts`, `src/components/Move.tsx`):
  - En la dirección vieja sale el aviso "La app se ha mudado" con el botón "Llevar mis datos a la app nueva".
  - El botón es un enlace a la nueva con los datos tras la `#` (no llegan a ningún servidor), comprimidos con `deflate-raw`; unos 460 caracteres con una lista normal. Además los copia al portapapeles.
  - En la nueva, si se llega por el enlace se guardan antes de pintar la app y se quita el código de la dirección.
  - Si la nueva está vacía (por ejemplo, recién instalada en el iPhone), sale "¿Vienes de la app anterior?" con "Pegar mis datos" y un recuadro para pegar a mano.
- Lo que llega se comprueba campo a campo y se descarta lo que no encaja. Se une sin pisar: se añaden los productos y favoritos que falten, y la zona de la nueva se queda si ya había una.
- En la dirección vieja ya no se invita a instalar. El icono nuevo se llama "MercaLista" (`short_name` y título de Apple) para no confundirlo con el viejo ("La compra").
- El proxy se identifica ante OpenStreetMap con la dirección nueva.
- Pendiente: cuando Anita se haya mudado, redirigir la dirección vieja a la nueva. No antes, porque una redirección deja atrás los datos sin traer.
- Pruebas: 25/25 de la mudanza (las dos direcciones simuladas en el navegador, enlace, pegar, código roto, manipulado y unir) + regresión completa.

## 2026-10-22 · PDF en cuadrícula, buscar en plural, botón atrás y Vaciar lista

Aprobado por el dueño tras el segundo análisis: los tres fallos de prioridad alta y el PDF en cuadrícula, en una sola publicación.

- **PDF en cuadrícula** de 3 tarjetas por fila:
  - Foto de 42 mm, pedida a 400 px (antes 28 mm en lista). Caben 9 productos por hoja (antes 6): 30 productos ocupan 4 hojas en vez de 5.
  - Cada tarjeta lleva el nombre numerado (hasta 3 líneas, con "…" si es más largo), el formato y precio por kilo, y abajo casilla, cantidad y precio.
  - Lo apuntado a mano sale con su inicial en gris.
  - La raya del total va con el verde de la app y el total ya no salta solo a otra hoja (9 productos y total en 1 hoja).
  - Se descartó doblar la foto en la lista (56 mm): solo cabían 3 productos por hoja.
- **Buscar en plural**:
  - Antes, "plátanos" daba 0 resultados, "yogures" 0, "pizzas" 2 y "fresas" 5. Ahora también vale el singular ("plátano", "yogur"; "nueces" → "nuez"), pero solo al principio de una palabra.
  - Así "ajos" no encuentra "bajo en sal"; un singular de 3 letras tiene que ser la palabra entera ("ajo", "uva").
  - Lo escrito sigue valiendo en cualquier parte del nombre, como antes. Medido con el catálogo real: "plátanos" 15 resultados, "yogures" 49, con "Plátano de Canarias" el primero.
- **Botón atrás del móvil**: antes, con la lista o la ficha abiertas, "atrás" salía de la app (reproducido).
  - Ahora cada ventana abierta añade un paso al historial y "atrás" cierra la de arriba: la ficha y luego la lista.
  - Al cerrar con "Cerrar" o Escape se quita ese paso, así que no quedan pasos sueltos. Un único escuchador cierra siempre solo la de arriba.
- **Vaciar la lista** al final de la lista, lejos del botón del PDF.
  - Sin ventana de confirmar: sale "Has vaciado la lista (N productos)" con **Deshacer**, que tiene el foco.
  - Deshacer devuelve todo con sus cantidades. Deja de ofrecerse en cuanto se apunta algo nuevo.
- Pruebas: 30/30 nuevas + regresión completa (e2e3–e2e27, incluidas la barra y la mudanza); auditoría con 0 problemas axe. Se adaptaron dos comprobaciones del PDF al nuevo formato: los nombres ocupan varias líneas y la cantidad va aparte.

## 2026-10-23 · Favoritos de otra tienda

Pedido por el dueño: poder guardar en favoritos productos de otro supermercado.

- En Favoritos, junto al título, un botón **"+ Otra tienda"** abre un formulario en la misma pantalla (sin ventana nueva):
  - Nombre del producto (obligatorio), tienda y precio aproximado (los dos opcionales).
  - La tienda sugiere las ya usadas y las más comunes (Lidl, Carrefour, Dia, Aldi, frutería…). Vacía queda como "Otra tienda".
  - El precio vale con coma o punto ("2,40", "2.40 €"). Vacío = sin precio, como lo apuntado a mano.
  - Avisa si ya existe el mismo producto en la misma tienda; el mismo nombre en otra tienda sí se puede guardar.
  - Los errores se leen en voz alta y el foco va al campo que falla. Escape o Cancelar cierran y devuelven el foco al botón.
- Se guardan como lo apuntado a mano (sin foto ni ficha, sin llamadas a Mercadona) con un campo `store` nuevo. La tienda hace de categoría en los favoritos y sale debajo del nombre en favoritos, lista, PDF y WhatsApp ("☐ 1 × Pan de pueblo · Panadería").
- Buscar el nombre de la tienda ("lidl") encuentra sus productos; los plurales funcionan igual que con los de Mercadona.
- Quitar uno de otra tienda con el corazón no se puede recuperar buscándolo, así que sale **Deshacer** (vuelve a su sitio). Para los de Mercadona no cambia nada.
- La mudanza entre direcciones ya los lleva (se copian los favoritos enteros).
- No hay editar: para cambiar el precio hay que quitarlo y volver a crearlo.
- Pruebas: 49/49 nuevas (formulario, validación, lista, total, PDF, WhatsApp, deshacer, buscador, recarga, 320 px, escritorio y axe) + regresión completa.

## 2026-10-23 · Pantallas de carga

Pedido por el dueño: que se vea una pantalla de carga si los productos aún no han llegado.

- Antes, mientras Mercadona respondía, Novedades y Rebajas enseñaban un recuadro quieto con "Buscando…" (parecía que no pasaba nada) y el buscador solo "Buscando…".
- Ahora, en cada sección que espera a Mercadona sale un aviso con un indicador que gira y unas filas "fantasma" con la forma de los productos:
  - **Novedades** ("Buscando novedades…") y **Rebajas** ("Buscando rebajas…").
  - **Buscador** ("Buscando en Mercadona…"). Si aún no hay barra de progreso, explica que la primera vez al día tarda un poco. En cuanto salen los primeros resultados, se quita.
  - **Pasillo abierto** ("Cargando productos del pasillo…"). La lista de pasillos ya tenía filas de carga; ahora además se anuncia al lector de pantalla.
- **No tapa la app entera** (decisión, no olvido): la lista y los favoritos están en el móvil y se usan sin Mercadona. Una pantalla de carga general los bloquearía justo cuando Mercadona va lenta, falla o está en pausa.
- Arreglos que salieron al revisarlo:
  - Buscando solo en Favoritos ya no espera a Mercadona.
  - Al cambiar de código postal, Novedades y Rebajas decían "Ahora mismo no hay…" mientras llegaban las de la zona nueva. Ahora salen como cargando.
- Con "reducir movimiento" activado en el móvil, no se anima nada.
- **Fallo encontrado por la regresión** (una prueba antigua fallaba a veces): si la app se recargaba mientras llegaba una respuesta de Mercadona (por ejemplo con "Desliza para actualizar"), la respuesta cortada a medias se tomaba como un rechazo de Mercadona. La app dejaba de renovar precios durante 30 minutos.
  - Ahora una respuesta cortada cuenta como "sin conexión" y no pausa. Una respuesta que llega entera pero con datos rotos sigue pausando, como antes.
  - Reproducido en `main` (pausa) y comprobado tras el arreglo (sin pausa).
- Pruebas: 24/24 nuevas (respuestas de Mercadona retenidas a mano para ver cada carga, su final y el fallo; zona nueva; reducir movimiento; respuesta cortada frente a JSON roto; escritorio; axe) + regresión completa.

## 2026-10-23 · Lista compartida entre varios móviles (y tachar lo que ya está en el carro)

Pedido por el dueño: que 2, 3 o 4 móviles tengan la misma lista, "como Tricount". Elegido: compartir solo la lista (los favoritos siguen siendo de cada móvil) y poder tachar al comprar. Condición: que sea totalmente gratis.

- **Coste cero comprobado** con el acceso a Vercel:
  - La cuenta está en Hobby, sin datos de facturación y con el cobro por exceso desactivado.
  - El plan Free de Upstash en el Marketplace tiene `paymentMethodRequired: false` y preautorización de 0 $; todos los planes de pago exigen tarjeta.
  - En Hobby, superar un límite pausa la función, no cobra.
- **Servidor** (`api/lista.js`, Upstash Redis por su API REST):
  - Sin cuentas: la lista se identifica con un código al azar de 22 caracteres (128 bits); quien tiene el enlace la ve y la cambia.
  - Se guardan solo productos, cantidades y lo que está en el carro. Caduca a los 90 días sin cambios.
  - Todo va por POST (el código no queda en la dirección ni en los registros).
  - Los cambios se envían como operaciones (añadir, restar, quitar, tachar, vaciar, deshacer), no como la lista entera: si dos personas pulsan + a la vez, cuentan los dos.
  - Restar nunca baja de 1 aunque dos "−" lleguen a la vez.
  - Cada envío lleva un identificador: si se corta la cobertura tras guardarse y el móvil reintenta, no se aplica dos veces.
  - Límites: 300 productos, 50 cambios por envío, 100 KB por petición.
  - Lo que llega se limpia campo a campo: solo fotos de Mercadona (otra dirección serviría para saber quién abre la lista), precios con sentido y campos conocidos.
  - Una lista inventada no se crea al escribir en ella (404).
  - Acepta las variables de Upstash con cualquier nombre que ponga Vercel (también con prefijo). `GET /api/lista` solo dice si está conectada.
- **Móvil** (`helpers/sync.ts`, `helpers/listOps.ts`, `useList`):
  - Lo que se ve es la última lista del servidor más los cambios aún sin enviar: se ve al momento y funciona sin cobertura. Al volver la conexión se envía todo.
  - Consulta "¿ha cambiado algo?" (1 sola operación de Upstash) solo con la app a la vista: cada 4 s si se acaba de usar, luego 10 s, 30 s y 60 s. En segundo plano, nada.
  - Si la lista desaparece del servidor, se avisa y la lista se queda en el móvil.
- **Pantallas**:
  - En la cabecera de la lista: "Solo en este móvil" o "Compartida · Al día / Sin conexión…", y el botón Compartir.
  - Hoja Compartir: crear enlace, enviarlo por WhatsApp o copiarlo, dejar de compartir (con confirmación) y "¿Te han pasado un enlace?" para pegarlo. Esto último hace falta en el iPhone con la app en la pantalla de inicio, porque el enlace se abre en Safari.
  - Al abrir un enlace: unirse juntando tus productos, unirse sin ellos, o cambiarse desde otra lista compartida.
  - **Casilla "en el carro"** en cada producto (también sin compartir). Lo tachado baja a "En el carro", sin botones de cantidad. "Quitar lo del carro" se puede deshacer, igual que "Vaciar la lista". En el PDF sale marcado y en WhatsApp con ☑.
- **Gasto estimado** con 4 móviles: unas 25.000 llamadas al mes a las funciones (el límite gratis es 1.000.000, compartido con Mercadona) y unas 50.000 operaciones de Upstash (el límite es 500.000).
- **Pruebas**:
  - Servidor: 47/47 contra un emulador local de Upstash (fakeredis con la misma API REST).
  - App: 49/49 con 5 móviles simulados (crear, unirse juntando o no, pegar enlace, cambios cruzados, + a la vez, tachar, sin conexión, dejar de compartir, vaciar y deshacer, quitar lo del carro, recarga, consumo a la vista y en segundo plano, reintento sin duplicar, lista borrada, enlace malo, sin base de datos, axe).
  - Regresión completa.
- Conectada la base de datos Upstash (plan Free, Frankfurt) al proyecto con prefijo `KV`. La función acepta también el prefijo que sustituye a "KV" (`STORAGE_REST_API_URL`) y solo direcciones http(s). Esta publicación es la que carga las claves en producción (las variables solo llegan a despliegues nuevos).

## 2026-10-23 · Refuerzo de seguridad de la lista compartida

Repaso de seguridad del endpoint nuevo (`api/lista.js`), atacándolo de verdad contra la copia local y blindando lo encontrado. Lo que ya estaba bien se dejó como estaba: identificador de 128 bits (no se adivina), validación campo a campo, solo fotos de Mercadona, claves de Redis siempre a partir de valores validados (sin inyección), CSP estricta, proxies con lista blanca, y `npm audit` sin fallos. El repo es público pero no contiene secretos (las claves de Upstash viven solo en variables de Vercel).

Dos defensas añadidas:
- **Peticiones desde otra web (CSRF).** Una página ajena podía usar el navegador de su visitante para llamar a la API. Ahora se rechazan (403) las peticiones de navegador que llegan desde otro sitio: se mira `Sec-Fetch-Site` y, en Safari viejo, el `Origin`. La propia app (mismo origen) y los clientes que no son navegador pasan. Se suma a que una petición con JSON desde otra web ya chocaba con el preflight de CORS: doble barrera.
- **Agotar la cuota gratis creando listas (denegación de monedero).** Crear lista es lo único sin llave y que gasta. Ahora hay tope por IP (40/hora) y un tope global al día (800) como cortafuegos del gasto. Leer y cambiar una lista existente no se limitan (es lo que usa la familia a diario). La IP se toma de la que pone Vercel y el cliente no puede falsear (x-real-ip, o el último valor de x-forwarded-for), no de la que podría poner él.

Pruebas: 14/14 de seguridad (CSRF desde otra web y en Safari viejo, la app propia sí pasa, tope por IP, otra IP no afectada, no se puede falsear la IP, leer sin límite, caducidad de los contadores) + regresión completa e2e3–e2e30 + servidor 49/49.

Pendiente (fuera del código): en Vercel hay una regla de firewall de 400 peticiones/60 s por IP sobre `/api/`. Conviene mantenerla; el tope de la app es ahora la protección real del gasto.

## 2026-10-23 · Quién apuntó cada producto (lista compartida)

Pedido por el dueño: que en la lista compartida se vea el nombre de quien añadió cada producto.

- Al compartir o al unirse se pide **«Tu nombre»** (opcional). Se guarda en el móvil y se puede cambiar luego en la hoja Compartir.
- Cada producto de la lista muestra **«Apuntado por Ana»**. Manda quien lo apuntó primero: si otro le suma una unidad, no cambia.
- Lo que ya había en el móvil al compartir o al unirse va firmado por esa persona. Sin nombre, se apunta sin firma.
- El servidor guarda el nombre como un campo más del producto (máximo 30 caracteres, solo texto). Es el único dato de una persona que se guarda, y solo si lo escribe.
- Un nombre con código se pinta como texto (React lo escapa).
- Pruebas: 14/14 nuevas con dos móviles simulados + servidor 50/50 + regresión completa.

## 2026-10-23 · Nombre obligatorio en la lista compartida

Pedido por el dueño: que el nombre sea obligatorio y que a quien entró antes sin nombre le salte la petición.

- Crear el enlace, unirse (por enlace o pegándolo) y guardar el nombre ya no dejan seguir con el nombre vacío (ni con solo espacios). Avisa en el campo y el foco va a él.
- Quien ya estaba en una lista compartida sin nombre ve al abrir la app la ventana **«Ponte un nombre»**. No se puede cerrar: ni botón Cerrar, ni Escape, ni tocar fuera, ni el botón atrás. La única otra salida es «Prefiero dejar de compartir» (con confirmación).
- `Sheet` tiene una opción `dismissible={false}` para esto: si se pulsa atrás, vuelve a poner su paso en el historial.
- Pruebas: e2e31 29/29 + regresión completa.

## 2026-10-23 · Carrito con la disposición de Favoritos y sin WhatsApp

Pedido por el dueño: quitar "Enviar por WhatsApp" (no hace falta) y que las filas del carrito se parezcan lo máximo posible a las de Favoritos.

- Fuera el botón "Enviar por WhatsApp" del pie de la lista (y su componente). El de la hoja Compartir, que manda el enlace de invitación, se queda.
- Filas del carrito como las de Favoritos: tarjeta verde clara, foto a la izquierda, nombre arriba que abre la ficha (con el icono ⓘ), papelera donde allí va el corazón, precio en negrita, formato debajo y − cantidad + a la derecha.
- Lo propio del carrito, encajado sin quitar ancho al texto: la casilla "en el carro" va debajo de la foto; "total: X €" solo si hay más de una unidad; "Apuntado por…" bajo el formato.
- Lo que está en el carro: tarjeta gris, nombre tachado y solo la cantidad cogida.
- El botón "Ficha" aparte desaparece: la ficha se abre tocando el nombre, como en Favoritos (mismo nombre accesible "Ficha de…").
- Pruebas: regresión completa; se adaptaron tres pruebas antiguas que pulsaban el botón de WhatsApp.

## 2026-10-23 · Favoritos no reflejan la lista + animación al añadir

Pedido por el dueño: al añadir desde Favoritos debe verse que va a la lista, y Favoritos no debe sincronizarse con la lista (si en la lista se quitan unidades, Favoritos no cambia; tras añadir, la fila queda "por defecto").

- Las filas de Favoritos (también las que salen arriba al buscar) son de **solo añadir**: siempre blancas y con el botón +. Cada toque suma una unidad a la lista. Ya no muestran − cantidad + ni se ponen verdes.
- **Animación:** el botón enseña un ✓ un momento y sale un "+1" que vuela hasta el botón «Lista» de la barra de abajo (o hasta la columna de la lista en escritorio), que da un saltito. Sin desvanecerse, para que el "+1" se lea bien todo el vuelo.
- Con "reducir movimiento" no vuela nada; solo el ✓. El lector de pantalla sigue oyendo "Añadido: … N unidades en la lista". El foco se queda en el botón.
- Resultados de Mercadona, Novedades, Rebajas y Pasillos no cambian (siguen con − cantidad +).
- Pruebas: 17/17 nuevas + regresión completa; dos pruebas antiguas adaptadas (usaban el − cantidad + de Favoritos).

## 2026-10-23 · Varias listas (como los tricounts de Tricount)

Pedido por el dueño: poder tener varias listas, compartidas o solo en el móvil, y ver de cada una sus componentes antes de entrar.

- Pantalla **«Mis listas»**: una tarjeta por lista con nombre, personas (las que han apuntado algo, si es compartida), nº de productos y total. Lápiz para renombrar o borrar (con confirmación); «Nueva lista» pide un nombre obligatorio. Máximo 20.
- Se llega desde el botón **«Mis listas»** de la cabecera de la lista. El botón «Lista» de abajo sigue abriendo directamente la lista actual (decisión: abrir «Mis listas» en cada toque añadía un toque a lo que más se hace, que es mirar la lista). En móvil es una sola hoja que cambia entre la lista y «Mis listas»; en escritorio, hoja aparte.
- Cada lista guarda lo suyo: productos (`L:{id}:order`) y, si es compartida, su estado de sincronización (`L:{id}:shared`). Registro en `lists:v1`. Lo de Favoritos se añade a la lista abierta.
- **Migración:** la lista única anterior pasa a llamarse «La compra» sin perder nada, con su enlace compartido si lo tenía.
- **Unirse con un enlace** crea una lista nueva («Lista compartida», renombrable) en vez de mezclarse con la actual; si ya estabas en esa lista, solo se abre. Desaparecen los botones «Unirme y añadir mis productos» / «sin mis productos».
- **Borrar** una lista solo la quita de ese móvil; los demás siguen con la suya. Nunca se queda en cero listas.
- Puente con la clave antigua `order` (la usa «Llevar mis datos», la mudanza de dirección): se **une** a la lista actual, no la pisa.
- Arreglo de paso: `Sheet` reiniciaba el foco cuando cambiaba la función `onClose` entre renders; ahora usa una referencia estable.
- El título de la hoja móvil sigue mostrando el número: «La compra (3)».
- Pruebas: e2e33 22/22 nuevas + regresión completa; e2e30 y e2e31 reescritas para el nuevo «unirse».

## 2026-10-23 · Copia compartida del catálogo en la base de datos

Pedido por el dueño: para no multiplicar las peticiones a Mercadona, que el primer móvil de cada zona la pida y el resto reciba la copia guardada en la base de datos.

- `api/_catalogcache.js` (nuevo; el guion bajo hace que Vercel no lo trate como función) y cambios en `api/mercadona.js`. Las credenciales de Upstash pasan a `api/_redis.js`, que usan las dos funciones.
- Orden de consulta: CDN de Vercel → copia en la base de datos → Mercadona. Una copia por almacén y ruta (`mc:{wh}:{path}`), comprimida (gzip), fresca 12 h y conservada 2 días.
- **Una sola petición aunque lleguen muchas a la vez:** el primero toma un turno (SET NX, 20 s); los demás esperan su copia (hasta ~5 s) o, si tienen una vieja, reciben esa al momento.
- **Mercadona falla, rechaza (401/403/429), devuelve una página o no responde:** se sirve la última copia (hasta 2 días), con su edad real para que la app la muestre; no se insiste. Un 404 («no existe en tu zona») no se tapa.
- **El CDN guarda la copia solo lo que le queda de frescura** (no 12 h fijas), para que la edad máxima de un precio siga siendo la de antes y las capas no se sumen.
- **Si la base de datos falla, no está o llega al límite:** todo sigue como antes (se pide a Mercadona; el CDN sigue). Nunca bloquea la respuesta: 1,5 s de espera máxima por consulta.
- **Topes diarios** (la base de datos comparte los 500.000 comandos/mes con las listas compartidas): 1.500 consultas y 500 copias nuevas al día; pasados, ese día no se usa. Peor caso ~7.000 comandos/día; una consulta con copia cuesta 2 comandos.
- Mercadona sigue viendo el mismo User-Agent y las mismas rutas; solo se guardan respuestas públicas del catálogo, nada de personas.
- Pruebas: `proxytest/dbcache.mjs` 31/31 (1.000 consultas de 20 categorías → 20 peticiones a Mercadona; 10 a la vez → 1), proxy 5 pruebas, lista 50/50, seguridad 14/14, e2e30.
- No medido: cuántas peticiones llegan de verdad a Mercadona en producción (sin acceso a los registros de Vercel).
