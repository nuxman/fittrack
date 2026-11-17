import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { requestPersistence } from './storage';
import { demoRepository } from './db/repositories/demo';
import './index.css';

if (demoRepository.ativo()) document.documentElement.dataset.demo = '';

void requestPersistence();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
