import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // All /api requests forwarded to the Express backend
      '/api': {
        target: 'http://3.109.153.167:3000',
        changeOrigin: true,
      },
    },
  },
})
