import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// "npm run dev:phone" usa --mode phone: HTTPS com certificado autoassinado, necessário
// para crypto.randomUUID, storage.persist e Wake Lock ao abrir pelo IP da rede.
export default defineConfig(({ mode }) => ({
  base: '/fittrack/',
  plugins: [react(), ...(mode === 'phone' ? [basicSsl()] : [])],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
}));
