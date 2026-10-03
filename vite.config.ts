import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
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
