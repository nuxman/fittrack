import { Outlet, type RouteObject } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { ConfirmDialogProvider } from './components/ConfirmDialog';
import { Inicio } from './pages/Inicio';
import { Configuracoes } from './pages/Configuracoes';
import { Vazia } from './pages/Vazia';
import { Fichas } from './pages/Fichas';
import { FichaEditor } from './pages/FichaEditor';
import { Exercicios } from './pages/Exercicios';
import { ExercicioEditor } from './pages/ExercicioEditor';
import { ExercicioDetalhe } from './pages/ExercicioDetalhe';
import { RetomarSessao } from './components/RetomarSessao';
import { SessaoLayout } from './pages/sessao/SessaoLayout';
import { SessaoVisao } from './pages/sessao/SessaoVisao';
import { SessaoExecucao } from './pages/sessao/SessaoExecucao';
import { SessaoFinalizar } from './pages/sessao/SessaoFinalizar';

/** Raiz: diálogo, retomada da sessão e navegação inferior em volta de todas as telas. */
// Arquivo de configuração de rotas, não de componentes: fast refresh recarrega a página inteira, sem problema.
/* eslint-disable react-refresh/only-export-components */
function Raiz() {
  return (
    <ConfirmDialogProvider>
      <Outlet />
      <RetomarSessao />
      <BottomNav />
    </ConfirmDialogProvider>
  );
}

/** Rotas do app (as mesmas URLs de antes, com # no endereço). */
export const ROTAS: RouteObject[] = [
  {
    element: <Raiz />,
    children: [
      { path: '/', element: <Inicio /> },
      { path: '/treinar', element: <Fichas /> },
      {
        path: '/sessao',
        element: <SessaoLayout />,
        children: [
          { index: true, element: <SessaoVisao /> },
          { path: 'finalizar', element: <SessaoFinalizar /> },
          { path: ':exerciseId', element: <SessaoExecucao /> },
        ],
      },
      { path: '/fichas/nova', element: <FichaEditor /> },
      { path: '/fichas/:id', element: <FichaEditor /> },
      { path: '/exercicios', element: <Exercicios /> },
      { path: '/exercicios/novo', element: <ExercicioEditor /> },
      { path: '/exercicios/:id', element: <ExercicioEditor /> },
      { path: '/exercicio/:id', element: <ExercicioDetalhe /> },
      { path: '/historico', element: <Vazia title="Histórico" mensagem="Seus treinos concluídos aparecem aqui, com data, duração e volume. Comece pela aba Treinar." /> },
      { path: '/evolucao', element: <Vazia title="Evolução" mensagem="Aqui você vai ver a evolução de carga, volume e recordes de cada exercício depois dos primeiros treinos. Comece pela aba Treinar." /> },
      { path: '/configuracoes', element: <Configuracoes /> },
    ],
  },
];

/** Ativa já o comportamento do React Router v7 (remove os avisos do console). */
export const ROUTER_FUTURE = { v7_relativeSplatPath: true } as const;
export const PROVIDER_FUTURE = { v7_startTransition: true } as const;
