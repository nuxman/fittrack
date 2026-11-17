import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { requestPersistence } from './storage';
import { emDemo } from './modo';
import './index.css';

if (emDemo()) document.documentElement.dataset.demo = '';

void requestPersistence();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
