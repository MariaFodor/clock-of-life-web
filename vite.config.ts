/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Static SPA. In production the Rust service serves the built `dist/`; in dev we proxy /api to it.
//
// The target is configurable because a service instance is not always on 8080: reviewing a bundle
// change means running the old and the new one at once (see the service's CLOCK_ADDR).
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
