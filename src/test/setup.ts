import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

// O Blob do jsdom não sobrevive ao structuredClone do Node (usado pelo fake-indexeddb):
// vira {}. Usamos o Blob nativo do Node, que é clonável como no navegador real.
globalThis.Blob = NodeBlob as unknown as typeof Blob;
globalThis.File = NodeFile as unknown as typeof File;

import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Desmonta a tela e espera as leituras do banco já iniciadas por ela terminarem. Sem isso, uma tela que ainda
// está carregando (ex.: o Início depois de navegar) pode ter a leitura cortada pelo db.delete() do próximo teste
// (DatabaseClosedError intermitente).
afterEach(async () => {
  cleanup();
  // ponytail: espera fixa de 20 ms; se voltar a falhar, rastrear as leituras pendentes em useAsync e esperá-las.
  await new Promise((ok) => setTimeout(ok, 20));
});
