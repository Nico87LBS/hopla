import fs from 'node:fs'

import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// The Hopla version is the VERSION file at the root of the repository, shared
// by the server and the web app.
const version = fs
  .readFileSync(new URL('../VERSION', import.meta.url), 'utf-8')
  .trim()

// https://vitejs.dev/config/
export default ({ command }) => {
  return defineConfig({
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
    },
    // Strip console.* / debugger from production bundles only, so dev logging
    // is untouched. `command` is 'build' for `vite build`, 'serve' for the dev server.
    esbuild: {
      drop: command === 'build' ? ['console', 'debugger'] : [],
    },
    plugins: [
      react(),
      VitePWA({
        includeAssets: [
          'favicon.ico',
          'robots.txt',
          'apple-touch-icon.png',
          'safari-pinned-tab.svg',
          'mstile-150x150.png',
        ],
        injectManifest: {
          globIgnores: ['index.html'],
          globPatterns: ['**/*.{js,css,html,png,svg}'],
        },
        manifest: {
          background_color: '#ffffff',
          display: 'standalone',
          icons: [
            {
              sizes: '192x192',
              src: '/android-chrome-192x192.png',
              type: 'image/png',
            },
            {
              sizes: '512x512',
              src: '/android-chrome-512x512.png',
              type: 'image/png',
            },
            {
              sizes: '64x64',
              src: 'pwa-64x64.png',
              type: 'image/png',
            },
            {
              sizes: '192x192',
              src: 'pwa-192x192.png',
              type: 'image/png',
            },
            {
              sizes: '512x512',
              src: 'pwa-512x512.png',
              type: 'image/png',
            },
            {
              purpose: 'maskable',
              sizes: '512x512',
              src: 'maskable-icon-512x512.png',
              type: 'image/png',
            },
          ],
          name: 'Hopla',
          description: 'Les tâches de la famille, en jeu.',
          short_name: 'Hopla',
          theme_color: '#ffffff',
        },
        registerType: 'prompt',
        workbox: {
          sourcemap: false,
          maximumFileSizeToCacheInBytes: 6000000, // 6MB
          // The translations are cached too, so the learning games open
          // offline.
          globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2,json}'],
          //Exclude API and Swagger routes from service worker navigation fallback
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [
            /^\/api\//, // Exclude all API routes
            /^\/swagger/, // Exclude all Swagger routes
          ],
          // Do not use skipWaiting/clientsClaim with the prompt flow. The new
          // worker activates only after the user accepts the in-app update.
          skipWaiting: false,
        },
      }),
    ],

    resolve: {
      alias: [
        {
          find: '@',
          replacement: '/src',
        },
        // One moment for the app and its locales: the CommonJS build and the
        // locale files do not share an instance once bundled, so French dates
        // silently fell back to English.
        {
          find: /^moment$/,
          replacement: 'moment/dist/moment.js',
        },
      ],
    },
  })
}
