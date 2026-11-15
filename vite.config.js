import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

// Web: served at the root of https://scribblegolfclub.com (GitHub Pages
// custom domain): the website at / (index.html), the app at /app/
// (app/index.html), and the privacy/terms pages.
// Native (`vite build --mode native`, used by `npm run build:native`): just
// the app, into dist-native/ for Capacitor's iPhone and Android projects.
export default defineConfig(({ mode }) => {
  const native = mode === 'native';
  return {
  base: '/',
  build: native
    ? { outDir: 'dist-native', emptyOutDir: true, rollupOptions: { input: { app: resolve(__dirname, 'app/index.html') } } }
    : {
        rollupOptions: {
          input: {
            site: resolve(__dirname, 'index.html'),
            app: resolve(__dirname, 'app/index.html'),
            privacy: resolve(__dirname, 'privacy/index.html'),
            terms: resolve(__dirname, 'terms/index.html'),
          },
        },
      },
  plugins: [
    react(),
    VitePWA({
      // The store apps bundle everything; no service worker needed there.
      disable: native,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'logo.png', 'splash.webp'],
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
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        // Offline, any /app/... address opens the app shell.
        navigateFallback: '/app/index.html',
        navigateFallbackAllowlist: [/^\/app(\/|$)/],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
  };
});
