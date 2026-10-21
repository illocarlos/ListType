# Architecture: ListType + catálogo Mercadona

No es un clon: es ListType ampliado con el catálogo de Mercadona como fuente de datos. Por decisión del usuario se descartan las elecciones por defecto de REA (Next.js, Postgres, auth, pagos, email).

## Stack

| layer | choice | why |
| --- | --- | --- |
| web | React 18 + TypeScript + Vite + Tailwind (lo que ya hay) | el usuario lo conoce; cambiar de stack no aporta nada |
| database | ninguna: `localStorage` del navegador | requisito del usuario |
| proxy | 1 función serverless de Vercel (`api/mercadona.js`, Node) | el navegador no puede llamar a Mercadona desde otro dominio (CORS); sin estado, solo reenvía y cachea |
| auth | ninguna | app personal |
| payments / email / jobs | ninguno | no aplican |
| PDF | jsPDF (lo que ya hay) | conservar la funcionalidad |
| hosting | Vercel (lo que ya hay) | despliegue automático desde `main` |

## Modelo de datos (localStorage, no SQL)

No hay tablas. Hay claves de `localStorage`, y su formato es contrato: lo que ya está guardado en el móvil de Anita tiene que seguir leyéndose.

| clave | contenido | cambios |
| --- | --- | --- |
| `order` | `OrderItem[]` | **compatible**: se añaden campos opcionales; los objetos antiguos siguen siendo válidos |
| `itemArrayNew` | `ListItem[]` (productos creados a mano) | sin cambios de formato |
| `mercadona:v1:wh` | código de almacén (string) | nueva |
| `mercadona:v1:<wh>:categories` | `{ savedAt, data: MercadonaGroup[] }` | nueva, caduca a las 24 h |
| `mercadona:v1:<wh>:cat:<id>` | `{ savedAt, data: MercadonaProduct[] }` por pasillo (nivel 2) | nueva, caduca a las 24 h; se borran las más antiguas si salta `QuotaExceededError` |

```ts
// tipos (src/types/types.ts) — campos nuevos todos opcionales
type listItem = {
  id: number; name: string; type: string; price: number;
  source?: 'catalog' | 'manual' | 'mercadona';
  image?: string;          // miniatura de Mercadona
  mercadonaId?: string;
  packaging?: string;      // "Paquete 500 g"
  unitPrice?: string;      // "2,30 €/kg"
}
type orderItem = listItem & { quantity: number }
```

Ids: catálogo propio 1-69, manuales aleatorios de 10 dígitos (< 1e10). Los de Mercadona se convierten a número como `1e12 + hash(id de Mercadona)`, en un rango que no choca con los otros dos y sigue siendo `number`, así `addItem` (que deduplica por id) funciona igual.

Al añadir un producto de Mercadona se copia en el `OrderItem` todo lo necesario para pintarlo y para el PDF. La cesta nunca vuelve a llamar a la API.

## API (proxy)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| GET `/api/mercadona/categories/` | árbol grupo → pasillo | cualquiera (sin datos personales) | `wh` | JSON de Mercadona tal cual | F05 |
| GET `/api/mercadona/categories/:id/` | productos de un pasillo agrupados por subcategoría | cualquiera | `id` numérico, `wh` | JSON de Mercadona tal cual | F05, F06 |
| GET `/api/mercadona-img?url=` | reenvía una miniatura para meterla en el PDF | cualquiera | URL de `prod-mercadona.imgix.net` únicamente | imagen | F04 |

Reglas del proxy:
- **Lista blanca de rutas** (regex): solo esas dos formas de `categories`. Nada de proxy abierto.
- Imágenes: solo el host `prod-mercadona.imgix.net`, solo `https`.
- `Cache-Control: s-maxage=86400, stale-while-revalidate=604800`: el CDN de Vercel sirve casi todo sin tocar Mercadona.
- Si Mercadona devuelve 4xx con el `wh` pedido, reintenta una vez sin `wh` y lo indica con la cabecera `x-wh-fallback: 1`.
- 429 y 5xx se devuelven tal cual; el cliente muestra error y botón de reintentar.
- En desarrollo, `vite.config.ts` hace de proxy hacia Mercadona con las mismas rutas.

Webhooks: ninguno. Jobs: ninguno.

Estructura de la respuesta (de fuentes públicas de terceros; **no verificada** contra una respuesta real porque el `robots.txt` de Mercadona bloquea la herramienta de lectura automática): `results[].categories[]` para el árbol; `categories[].products[]` dentro de un pasillo; producto con `id`, `display_name`, `packaging`, `thumbnail`, `price_instructions.{unit_price, bulk_price, reference_price, reference_format, unit_size, size_format, previous_unit_price}`. El parser se escribe tolerante: cualquier campo puede faltar y el producto se descarta solo si no tiene id o nombre.

## The parts that bite

- **robots.txt y términos:** Mercadona bloquea el acceso automatizado a `/api` en su `robots.txt`. El proxy no rastrea: solo pide un pasillo cuando Anita lo abre, y el CDN de Vercel evita repetir peticiones. Aun así, es la decisión de riesgo asumida por el usuario y puede dejar de funcionar.
- **IPs de Vercel:** Mercadona podría bloquear las IPs de centros de datos. Si pasa, la app sigue funcionando con catálogo propio y alta manual.
- **Rate limit (429):** caché de 24 h en el navegador + caché del CDN + nada de precargar el catálogo entero.
- **Cuota de localStorage (~5 MB):** caché por pasillo con productos recortados (~250 bytes), purga de los más antiguos si no cabe. La lista (`order`) nunca se purga.
- **Almacén:** por defecto `svq1` (Sevilla, sin verificar). Editable en el panel de Mercadona.
- **CORS de imágenes en el PDF:** jsPDF necesita los bytes. Se intenta directo al CDN y, si falla, por `/api/mercadona-img`. Si también falla, la línea sale sin foto. El PDF nunca falla por una imagen.
- **PDF largo:** salto de página cuando no cabe la siguiente línea.
- **Migración:** no hace falta script: todos los campos nuevos son opcionales.
- Zonas horarias, idempotencia, carreras: no aplican.

## Build order

1. **Arreglos de lo actual** (S01-S04): filtro por categoría, botones de categoría, alta manual, productos manuales visibles al recargar, +/- en la cesta, título, idioma y favicon. Sin esto la base es frágil.
2. **Rebanada vertical Mercadona** (S05, S06 → S03): proxy, navegar pasillos, tocar producto, verlo en la cesta con foto y precio.
3. **PDF** (S04): paginación, precio por línea, total, miniatura.
4. **Should**: búsqueda local (S06), precio por unidad y formato, ajuste de almacén (S08).
5. **Could**: ficha de producto (S07), alérgenos, agrupar la lista por pasillo.

Design (fase 3) no se ejecuta como fase aparte: se mantiene el estilo actual (Tailwind, tonos esmeralda) para no cambiarle la app a Anita.
