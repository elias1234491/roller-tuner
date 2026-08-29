import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Alles lokal im Browser — kein Server. Als PWA installierbar (offline).
// BASE_PATH wird von der GitHub-Pages-Action gesetzt (Unterpfad /roller-tuner/).
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Roller-Tuner',
        short_name: 'Roller-Tuner',
        description: 'E-Scooter auslesen und tunen — laeuft lokal im Browser.',
        theme_color: '#0b0f14',
        background_color: '#0b0f14',
        display: 'standalone',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
})
