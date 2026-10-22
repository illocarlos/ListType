import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
// Fuente Onest servida desde la propia app (antes venía de Google Fonts, que recibía la IP de cada usuario).
// Solo el juego latino (español incluido) y los grosores que se usan.
import '@fontsource/onest/latin-400.css'
import '@fontsource/onest/latin-500.css'
import '@fontsource/onest/latin-600.css'
import '@fontsource/onest/latin-700.css'
import '@fontsource/onest/latin-800.css'
import './index.css'
import { captureInstallPrompt } from './helpers/install'
import { importFromLink, MOVE_HASH } from './helpers/move'

// Antes de pintar la app: el navegador avisa de que se puede instalar muy pronto y no hay que perderlo
captureInstallPrompt()

// Si se llega por el enlace de la mudanza (mercalista.vercel.app/#mudanza=…), los datos se guardan antes
// de pintar: la lista y los favoritos se leen del almacenamiento al arrancar. Sin enlace no espera nada.
// Si la app nueva ya estaba abierta y llega el enlace a la misma página, solo cambia lo de tras la #
window.addEventListener('hashchange', () => {
  if (location.hash.startsWith(MOVE_HASH)) importFromLink().finally(() => location.reload())
})
importFromLink().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})

// Modo sin conexión de la app instalable. Solo en producción: en desarrollo la caché estorba.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // sin service worker la app funciona igual, solo que necesita conexión para abrirse
    })
  })
}
