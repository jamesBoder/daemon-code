import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Never register the service worker under `npm run dev` (command === 'serve').
      // A dev SW fights Vite's HMR and causes a full-reload loop; it only belongs in
      // production builds. Prod (`vite build`) is unaffected.
      disable:         command === 'serve',
      strategies:      'injectManifest',
      srcDir:          'src',
      filename:        'sw.ts',
      manifest:        false,       // managed in public/manifest.json
      injectRegister:  'auto',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
  server: {
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
            return 'vendor-react'
          }
          if (id.includes('node_modules/framer-motion')) {
            return 'vendor-motion'
          }
          if (id.includes('node_modules/@tanstack/react-query')) {
            return 'vendor-query'
          }
        },
      },
    },
  },
}))
