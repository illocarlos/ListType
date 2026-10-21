import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // En local hace lo mismo que api/mercadona.js en Vercel (sin la lista blanca ni la caché)
      '^/api/mercadona/': {
        target: 'https://tienda.mercadona.es',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/mercadona\//, '/api/'),
      },
    },
  },
})
