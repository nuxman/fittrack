import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { requestPersistence } from './storage';
import { demoRepository } from './db/repositories/demo';
import { bodyPhotosRepository } from './db/repositories/bodyPhotos';
import { registerSW } from 'virtual:pwa-register';
import { avisarNovaVersao } from './atualizacao';
import './index.css';

if (demoRepository.ativo()) document.documentElement.dataset.demo = '';

void requestPersistence();
// Service worker (offline). Versão nova: espera o toque em "Nova versão disponível — atualizar".
const atualizarSW = registerSW({ onNeedRefresh: () => avisarNovaVersao(() => atualizarSW(true)) });
// Fotos corporais de medições excluídas há mais que o prazo do "Desfazer" (ex.: app fechado durante o aviso): libera o espaço.
void bodyPhotosRepository.esvaziarExcluidas();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
