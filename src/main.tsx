import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { seedIfEmpty } from './db/seed';
import { requestPersistence } from './storage';
import './index.css';

void requestPersistence();

seedIfEmpty()
  .catch((e) => console.error('Falha ao carregar ficha inicial', e))
  .finally(() =>
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  );
