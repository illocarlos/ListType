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
