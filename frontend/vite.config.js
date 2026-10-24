import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      usePolling: true,
    },
    host: true,
    allowedHosts: ['produccion.nutriestacionsas.com'],
    port: 80,
    hmr: {
      clientPort: 5175,
    },
    proxy: {
      '/api': {
        target: 'http://dev_produccion-backend-1:8000',
        changeOrigin: true,
        secure: false,
        timeout: 600000,
        proxyTimeout: 600000,
      }
    }
  }
})
