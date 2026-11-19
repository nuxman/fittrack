import { lazy, Suspense, type ReactNode } from 'react';
import { Outlet, type RouteObject } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { FaixaDemo } from './components/FaixaDemo';
import { ConfirmDialogProvider } from './components/ConfirmDialog';
import { Inicio } from './pages/Inicio';
import { Configuracoes } from './pages/Configuracoes';
import { Fichas } from './pages/Fichas';
import { FichaEditor } from './pages/FichaEditor';
import { Exercicios } from './pages/Exercicios';
import { ExercicioEditor } from './pages/ExercicioEditor';
import { ExercicioDetalhe } from './pages/ExercicioDetalhe';
import { ErroTela } from './components/ErroTela';
import { RetomarSessao } from './components/RetomarSessao';
import { SessaoLayout } from './pages/sessao/SessaoLayout';
import { SessaoVisao } from './pages/sessao/SessaoVisao';
import { SessaoExecucao } from './pages/sessao/SessaoExecucao';
import { SessaoFinalizar } from './pages/sessao/SessaoFinalizar';
import { Cardio } from './pages/Cardio';
import { Historico } from './pages/historico/Historico';
import { HistoricoDetalhe } from './pages/historico/HistoricoDetalhe';
import { CardioAvulso } from './pages/historico/CardioAvulso';
import { Medidas } from './pages/medidas/Medidas';
import { MedidaEditor } from './pages/medidas/MedidaEditor';
import { CompararFotos } from './pages/medidas/CompararFotos';

// Evolução e Recharts sob demanda: não pesam a abertura do app.
const Evolucao = lazy(() => import('./pages/evolucao/Evolucao'));
const EvolucaoExercicio = lazy(() => import('./pages/evolucao/EvolucaoExercicio'));
const sobDemanda = (el: ReactNode) => <Suspense fallback={<p className="p-4">Carregando…</p>}>{el}</Suspense>;

// Falha ao carregar a Evolução (sem internet, ou arquivo antigo apagado por um deploy novo).
const erroEvolucao = <ErroTela titulo="Não foi possível abrir a Evolução." />;

/** Raiz: diálogo, retomada da sessão e navegação inferior em volta de todas as telas. */
// Arquivo de configuração de rotas, não de componentes: fast refresh recarrega a página inteira, sem problema.
/* eslint-disable react-refresh/only-export-components */
function Raiz() {
  return (
    <ConfirmDialogProvider>
      <FaixaDemo />
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
    errorElement: <ErroTela />,
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
      { path: '/cardio/:sessionId', element: <Cardio /> },
      { path: '/fichas/nova', element: <FichaEditor /> },
      { path: '/fichas/:id', element: <FichaEditor /> },
      { path: '/exercicios', element: <Exercicios /> },
      { path: '/exercicios/novo', element: <ExercicioEditor /> },
      { path: '/exercicios/:id', element: <ExercicioEditor /> },
      { path: '/exercicio/:id', element: <ExercicioDetalhe /> },
      { path: '/historico', element: <Historico /> },
      { path: '/historico/cardio/:id', element: <CardioAvulso /> },
      { path: '/historico/:id', element: <HistoricoDetalhe /> },
      { path: '/evolucao', element: sobDemanda(<Evolucao />), errorElement: erroEvolucao },
      { path: '/evolucao/:id', element: sobDemanda(<EvolucaoExercicio />), errorElement: erroEvolucao },
      { path: '/medidas', element: <Medidas /> },
      { path: '/medidas/comparar', element: <CompararFotos /> },
      { path: '/medidas/:id', element: <MedidaEditor /> },
      { path: '/configuracoes', element: <Configuracoes /> },
    ],
  },
];

/** Ativa já o comportamento do React Router v7 (remove os avisos do console). */
export const ROUTER_FUTURE = { v7_relativeSplatPath: true } as const;
export const PROVIDER_FUTURE = { v7_startTransition: true } as const;
