import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

// Served at the root of https://scribblegolfclub.com (GitHub Pages custom
// domain). Two pages: the website at / (index.html) and the app at /app/
// (app/index.html).
export default defineConfig({
  base: '/',
  build: {
    rollupOptions: {
      input: {
        site: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app/index.html'),
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'logo.png'],
      manifest: {
        name: 'Scribble Golf Club',
        short_name: 'Scribble',
        description: 'Score your round and settle your bets.',
        theme_color: '#065025',
        background_color: '#f6f7f2',
        display: 'standalone',
        orientation: 'portrait',
        // The home-screen icon opens the app, not the website.
        start_url: '/app/',
        scope: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Offline, any /app/... address opens the app shell.
        navigateFallback: '/app/index.html',
        navigateFallbackAllowlist: [/^\/app(\/|$)/],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
});
