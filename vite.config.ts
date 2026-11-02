import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Expose on LAN so real phones can test against the dev server.
  server: { host: true },
  preview: { host: true },
})
