# Auditoría de accesibilidad

Fecha: 2026-10-21. Público objetivo: personas de toda España, incluidas personas mayores y con discapacidad visual, motriz o cognitiva.

Método: axe-core 4.14 (WCAG 2.2 A/AA + buenas prácticas) en 7 pantallas con móvil de 390 px, y comprobaciones propias: foco atrapado en diálogos, foco tapado por barras fijas, texto menor de 14 px y zonas táctiles menores de 44 px. Además, revisión manual del código.

## Encontrado y corregido

| problema | afecta a | arreglo |
| --- | --- | --- |
| "Ver lista" se anunciaba con un nombre distinto del texto visible | control por voz | el nombre sale del texto visible + texto oculto con el número de productos |
| El foco del teclado se escapaba del diálogo de la lista (15 de 25) y no volvía al cerrar | teclado, lector de pantalla | foco atrapado en el diálogo, vuelve al botón que lo abrió, botón "Cerrar" con texto |
| Textos de 12 px con información (formato, €/L, precio anterior, contadores) | baja visión | mínimo 14 px en todo el texto |
| Zonas táctiles de 36-40 px (corazón, − +, pestañas, chips, borrar búsqueda) | temblor, poca precisión | todas a 44 px como mínimo |
| La cantidad (− 2 +) no se leía | lector de pantalla | texto oculto "2 en la lista" / "X2 unidades" |
| Al buscar no se anunciaba cuántos resultados hay | lector de pantalla | región viva con "N resultados" / "No hay resultados" |
| Pestañas sin flechas del teclado | teclado | flechas, Inicio y Fin; solo la pestaña activa es tabulable |
| Botón "+" sin texto | comprensión | botón "Añadir" escrito |
| Nombres cortados con "…" | comprensión, baja visión | nombre completo |
| Precio tachado sin contexto | lector de pantalla | se lee "antes 1,30 €" |
| Errores con jerga ("error 404 de Vercel") | comprensión | frase llana + código corto al final (M/V/R) para diagnóstico |
| "Almacén SVQ1" | comprensión | se pide el código postal y la app averigua la zona |
| La app instalada bloqueaba el giro de pantalla | móvil fijo en horizontal (soportes) | quitado `orientation` del manifest |
| Pegar "41 300" dejaba "4130" | todos | el campo filtra dígitos antes de limitar a 5 |
| Escribir el código postal cuesta a algunas personas | motricidad, comprensión | botón "Usar mi ubicación" (con permiso) |
| Zoom de foto con "mantener pulsado" | motricidad, lector de pantalla | botón usable con teclado (Intro abre, Escape cierra). Por decisión del usuario, el toque corto no la deja abierta: quien no pueda mantener el dedo no tiene alternativa táctil |
| Instalar la app exige pasos escondidos | comprensión | botón "Instalar la app" en Android/ordenador; pasos numerados en iPhone |

## Ya estaba bien (no se toca)

Contraste AA en los 20 pares de colores, zoom permitido, idioma `es`, movimiento reducido respetado, fotos decorativas con `alt=""`, foco nunca tapado por la cabecera ni la barra inferior (0 de 40), estructura simple de una sola pantalla.

## Resultado final

0 problemas de axe en las 7 pantallas, 0 textos menores de 14 px, 0 zonas táctiles menores de 44 px, foco atrapado correctamente en el diálogo (0 escapes) y devuelto al cerrar.

## Pendiente (no se puede arreglar en código)

- El PDF que genera jsPDF no es accesible para lectores de pantalla (no lleva etiquetas). La lista accesible es la de la app.
- Las fotos y nombres de producto vienen de Mercadona tal cual.
