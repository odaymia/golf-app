import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Production is served at the root of https://scribblegolfclub.com (GitHub
// Pages custom domain). Set BASE_PATH=/golf-app/ to build for the old
// odaymia.github.io/golf-app/ address instead.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? base : '/',
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
        // start_url and scope default to the base path
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
}));
