import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Two build targets:
//  - default: installable PWA (manifest + service worker) for real deployment (e.g. Vercel)
//  - demo:    one self-contained HTML file (no service worker) for the hosted demo
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    base: './',
    define: { __DEMO__: JSON.stringify(demo) },
    plugins: [
      react(),
      demo
        ? viteSingleFile()
        : VitePWA({
            registerType: 'autoUpdate',
            injectRegister: null,
            includeAssets: ['icon.svg', 'push-sw.js'],
            workbox: { importScripts: ['push-sw.js'], navigateFallbackDenylist: [/^\/api\//] },
            manifest: {
              name: 'FitnessAI',
              short_name: 'FitnessAI',
              description: 'Clients, circuits, progress and scheduling for personal trainers',
              theme_color: '#2747D6',
              background_color: '#F4F5F2',
              display: 'standalone',
              start_url: './',
              icons: [
                { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
              ]
            }
          })
    ],
    build: { outDir: demo ? 'dist-demo' : 'dist' },
    test: { environment: 'node' }
  };
});
