import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

// O Blob do jsdom não sobrevive ao structuredClone do Node (usado pelo fake-indexeddb):
// vira {}. Usamos o Blob nativo do Node, que é clonável como no navegador real.
globalThis.Blob = NodeBlob as unknown as typeof Blob;
globalThis.File = NodeFile as unknown as typeof File;
