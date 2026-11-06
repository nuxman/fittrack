import { HashRouter, Route, Routes } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { Inicio } from './pages/Inicio';
import { Configuracoes } from './pages/Configuracoes';
import { Vazia } from './pages/Vazia';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/treinar" element={<Vazia title="Treinar" />} />
        <Route path="/historico" element={<Vazia title="Histórico" />} />
        <Route path="/evolucao" element={<Vazia title="Evolução" />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
      </Routes>
      <BottomNav />
    </HashRouter>
  );
}
