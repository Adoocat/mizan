import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const apiTarget = process.env.MIZAN_API_URL ?? 'http://127.0.0.1:3000'
const port = Number.parseInt(process.env.MIZAN_WEB_PORT ?? '5173', 10)

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port,
    strictPort: true,
    proxy: { '/api': { target: apiTarget, changeOrigin: false } },
  },
  preview: {
    host: 'localhost',
    port,
    strictPort: true,
    proxy: { '/api': { target: apiTarget, changeOrigin: false } },
  },
  build: {
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
