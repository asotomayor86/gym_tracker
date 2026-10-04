import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// Versión en ejecución: commit de Vercel o de git y fecha de compilación
const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? (() => { try { return execSync('git rev-parse HEAD').toString().trim() } catch { return 'dev' } })()).slice(0, 7)

// https://vite.dev/config/
export default defineConfig({
  define: { __APP_COMMIT__: JSON.stringify(commit), __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate', // el SW nuevo se activa solo; src/lib/swUpdate.ts decide cuándo recargar la página
      injectRegister: null, // el registro lo hace src/lib/swUpdate.ts
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Gym Tracker',
        short_name: 'Gym',
        description: 'Seguimiento de entrenamientos',
        theme_color: '#05070a',
        background_color: '#05070a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        // Fuentes latinas disponibles offline (sin subconjuntos cirílico/vietnamita/latin-ext)
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/*-cyrillic-*', '**/*-vietnamese-*', '**/*-latin-ext-*'],
      },
    }),
  ],
  test: { include: ['src/**/*.test.ts'] },
})
