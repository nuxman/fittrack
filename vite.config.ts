import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
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
  plugins: [react(), ...(mode === 'phone' ? [basicSsl()] : [])],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
}));
