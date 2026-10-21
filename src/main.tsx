import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { captureInstallPrompt } from './helpers/install'

// Antes de pintar la app: el navegador avisa de que se puede instalar muy pronto y no hay que perderlo
captureInstallPrompt()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Modo sin conexión de la app instalable. Solo en producción: en desarrollo la caché estorba.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // sin service worker la app funciona igual, solo que necesita conexión para abrirse
    })
  })
}
