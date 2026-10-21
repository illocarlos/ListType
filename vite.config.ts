import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// En local hace lo mismo que api/mercadona.js en Vercel (sin la lista blanca ni la caché):
// /api/mercadona?path=categories/112/&lang=es&wh=svq1  ->  https://tienda.mercadona.es/api/categories/112/?lang=es&wh=svq1
function toMercadona(url: string) {
  const parsed = new URL(url, 'http://localhost');
  const path = parsed.searchParams.get('path') ?? '';
  parsed.searchParams.delete('path');
  return `/api/${path}?${parsed.searchParams.toString()}`;
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '^/api/mercadona\\?': {
        target: 'https://tienda.mercadona.es',
        changeOrigin: true,
        rewrite: toMercadona,
      },
    },
  },
})
