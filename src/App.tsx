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

export function AppRoutes() {
  return (
    <ConfirmDialogProvider>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/treinar" element={<Fichas />} />
        <Route path="/fichas/nova" element={<FichaEditor />} />
        <Route path="/fichas/:id" element={<FichaEditor />} />
        <Route path="/exercicios" element={<Exercicios />} />
        <Route path="/exercicios/novo" element={<ExercicioEditor />} />
        <Route path="/exercicios/:id" element={<ExercicioEditor />} />
        <Route path="/historico" element={<Vazia title="Histórico" />} />
        <Route path="/evolucao" element={<Vazia title="Evolução" />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
      </Routes>
      <BottomNav />
    </ConfirmDialogProvider>
  );
}

export function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
