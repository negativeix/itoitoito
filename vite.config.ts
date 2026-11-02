import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered manually in main.tsx (with periodic update checks)
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ito',
        short_name: 'ito',
        description: 'ร้อยความคิดให้ตรงกัน — เกม ito สำหรับเล่นกับเพื่อนในวง',
        lang: 'th',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#E0393E',
        background_color: '#F5EFE4',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // Supabase traffic is cross-origin and always live; never cache it.
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//, /^\/realtime\//],
      },
    }),
  ],
  // Expose on LAN so real phones can test against the dev server.
  server: { host: true },
  preview: { host: true },
})
