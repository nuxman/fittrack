import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

// O Blob do jsdom não sobrevive ao structuredClone do Node (usado pelo fake-indexeddb):
// vira {}. Usamos o Blob nativo do Node, que é clonável como no navegador real.
globalThis.Blob = NodeBlob as unknown as typeof Blob;
globalThis.File = NodeFile as unknown as typeof File;

import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Desmonta a tela antes do próximo teste apagar o banco: leituras que terminam depois disso são descartadas
// pelo useAsync (tela desmontada), em vez de virarem DatabaseClosedError sem tratamento.
afterEach(() => {
  cleanup();
});
