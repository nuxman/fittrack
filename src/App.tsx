import { HashRouter, Route, Routes } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { ConfirmDialogProvider } from './components/ConfirmDialog';
import { Inicio } from './pages/Inicio';
import { Configuracoes } from './pages/Configuracoes';
import { Vazia } from './pages/Vazia';
import { Fichas } from './pages/Fichas';
import { FichaEditor } from './pages/FichaEditor';
import { Exercicios } from './pages/Exercicios';
import { ExercicioEditor } from './pages/ExercicioEditor';
import { RetomarSessao } from './components/RetomarSessao';
import { SessaoLayout } from './pages/sessao/SessaoLayout';
import { SessaoVisao } from './pages/sessao/SessaoVisao';
import { SessaoExecucao } from './pages/sessao/SessaoExecucao';
import { SessaoFinalizar } from './pages/sessao/SessaoFinalizar';

export function AppRoutes() {
  return (
    <ConfirmDialogProvider>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/treinar" element={<Fichas />} />
        <Route path="/sessao" element={<SessaoLayout />}>
          <Route index element={<SessaoVisao />} />
          <Route path="finalizar" element={<SessaoFinalizar />} />
          <Route path=":exerciseId" element={<SessaoExecucao />} />
        </Route>
        <Route path="/fichas/nova" element={<FichaEditor />} />
        <Route path="/fichas/:id" element={<FichaEditor />} />
        <Route path="/exercicios" element={<Exercicios />} />
        <Route path="/exercicios/novo" element={<ExercicioEditor />} />
        <Route path="/exercicios/:id" element={<ExercicioEditor />} />
        <Route path="/historico" element={<Vazia title="Histórico" mensagem="Seus treinos concluídos aparecem aqui, com data, duração e volume. Comece pela aba Treinar." />} />
        <Route path="/evolucao" element={<Vazia title="Evolução" mensagem="Aqui você vai ver a evolução de carga, volume e recordes de cada exercício depois dos primeiros treinos. Comece pela aba Treinar." />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
      </Routes>
      <RetomarSessao />
      <BottomNav />
    </ConfirmDialogProvider>
  );
}

/** Ativa já o comportamento do React Router v7 (remove os avisos do console). */
export const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

export function App() {
  return (
    <HashRouter future={ROUTER_FUTURE}>
      <AppRoutes />
    </HashRouter>
  );
}
