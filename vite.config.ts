import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

// "npm run dev:phone" usa --mode phone: HTTPS com certificado autoassinado, necessário
// para crypto.randomUUID, storage.persist e Wake Lock ao abrir pelo IP da rede.
export default defineConfig(({ command, mode }) => ({
  base: '/fittrack/',
  // Versão mostrada em Configurações. No dev (vite serve), o hash aparece como "dev".
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(command === 'build' ? execSync('git rev-parse --short HEAD').toString().trim() : 'dev'),
    __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    ...(mode === 'phone' ? [basicSsl()] : []),
    VitePWA({
      // "prompt": o service worker novo espera; o app mostra "Nova versão disponível — atualizar" (AvisoAtualizacao).
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'FitTrack',
        short_name: 'FitTrack',
        description: 'Controle de musculação, cardio e medidas, 100% offline.',
        lang: 'pt-BR',
        start_url: '/fittrack/',
        scope: '/fittrack/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0a0a0a',
        theme_color: '#0a0a0a',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Tudo do build, inclusive as partes sob demanda (Evolução, EvolucaoExercicio, MiniGrafico, Grafico/Recharts):
        // abrem offline. Limite folgado (o maior arquivo, o app, tem ≈560 kB).
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/fittrack/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
}));
