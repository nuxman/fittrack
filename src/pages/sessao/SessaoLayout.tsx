import { createContext, useCallback, useContext, useState } from 'react';
import { Navigate, Outlet, useMatch, useNavigate } from 'react-router-dom';
import { Pause, Play, X } from 'lucide-react';
import { useAsync } from '../../useAsync';
import { useAgora } from '../../useAgora';
import { useWakeLock, type EstadoWakeLock } from '../../useWakeLock';
import { useDialog } from '../../components/ConfirmDialog';
import { workoutSessionsRepository } from '../../db/repositories/workoutSessions';
import { exerciseSetsRepository } from '../../db/repositories/exerciseSets';
import { exercisesRepository } from '../../db/repositories/exercises';
import { exerciseImagesRepository } from '../../db/repositories/exerciseImages';
import { settingsRepository } from '../../db/repositories/settings';
import type { Exercise, ExerciseSet, WorkoutSession } from '../../db/types';
import { formatarDuracao, progresso, pulados, tempoAtivoEm } from '../../sessao';

function porId<T>(ids: string[], vals: (T | undefined)[]): Map<string, T> {
  const m = new Map<string, T>();
  ids.forEach((id, k) => {
    const v = vals[k];
    if (v !== undefined) m.set(id, v);
  });
  return m;
}

async function carregar() {
  const sessao = await workoutSessionsRepository.ativa();
  if (!sessao) return null;
  const ids = sessao.planSnapshot.itens.map((i) => i.exerciseId);
  const [sets, exs, imgs, ultimas, settings] = await Promise.all([
    exerciseSetsRepository.listarDaSessao(sessao.id),
    Promise.all(ids.map((id) => exercisesRepository.get(id))),
    Promise.all(ids.map((id) => exerciseImagesRepository.getForExercise(id))),
    Promise.all(ids.map((id) => exerciseSetsRepository.ultimaDoExercicio(id))),
    settingsRepository.get(),
  ]);
  return {
    sessao,
    sets,
    exercicios: porId<Exercise>(ids, exs),
    imagens: porId<Blob>(ids, imgs.map((i) => (i && i.blob.size > 0 ? i.blob : undefined))),
    ultimas: porId<ExerciseSet>(ids, ultimas),
    vibrar: settings.interface.vibrar,
  };
}

type Dados = NonNullable<Awaited<ReturnType<typeof carregar>>>;
interface CtxSessao extends Dados {
  recarregar: () => void;
  /** Executa uma ação no banco e recarrega a sessão. */
  agir: (f: (s: WorkoutSession) => Promise<unknown>) => Promise<void>;
}

const Ctx = createContext<CtxSessao | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useSessao() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSessao fora de SessaoLayout');
  return c;
}

const TEXTO_WAKE: Record<EstadoWakeLock, string> = { ativa: 'ativa', inativa: 'desligada', indisponivel: 'indisponível' };

/** Rotas /sessao/*: dados da sessão ativa, barra com tempo/progresso/pausa e tela sempre ligada. */
export function SessaoLayout() {
  const [dados, recarregar] = useAsync(carregar);
  // Wake Lock só com a sessão em andamento: solto ao pausar, finalizar, abandonar ou sair de /sessao.
  const wake = useWakeLock(dados?.sessao.status === 'em_andamento');

  const agir = useCallback(
    async (f: (s: WorkoutSession) => Promise<unknown>) => {
      if (!dados) return;
      await f(dados.sessao);
      recarregar();
    },
    [dados, recarregar],
  );

  if (dados === undefined) return <main className="mx-auto max-w-xl px-4 pt-6">Carregando…</main>;
  if (dados === null) return <Navigate to="/treinar" replace />;

  return (
    <Ctx.Provider value={{ ...dados, recarregar, agir }}>
      <main className="mx-auto max-w-xl space-y-4 px-4 pb-nav pt-4">
        <BarraSessao />
        <Outlet />
        <p className="text-center text-xs text-neutral-500">Tela sempre ligada: {TEXTO_WAKE[wake]}</p>
      </main>
    </Ctx.Provider>
  );
}

function BarraSessao() {
  const { sessao, sets, agir } = useSessao();
  const naFinalizacao = useMatch('/sessao/finalizar');
  const agora = useAgora();
  const navigate = useNavigate();
  const { confirmar } = useDialog();
  const [ocupado, setOcupado] = useState(false);
  if (naFinalizacao) return null;

  const pausada = sessao.status === 'pausada';
  const { feitos, total } = progresso(sessao.planSnapshot.itens, sets, pulados(sessao));
  const executar = async (f: (s: WorkoutSession) => Promise<unknown>) => {
    setOcupado(true);
    try {
      await agir(f);
    } finally {
      setOcupado(false);
    }
  };

  const abandonar = async () => {
    const ok = await confirmar('Abandonar treino?', 'As séries já registradas ficam salvas. O treino não conta como feito.', 'Abandonar', true);
    if (!ok) return;
    await workoutSessionsRepository.abandonar(sessao.id);
    navigate('/treinar', { replace: true });
  };

  return (
    <header className="card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-primary-400">{sessao.planSnapshot.nome}</h1>
          <p className="text-neutral-300" data-testid="progresso">
            {feitos} de {total} exercícios concluídos
          </p>
        </div>
        <p className="text-3xl font-bold tabular-nums" aria-label="Tempo total">
          {formatarDuracao(tempoAtivoEm(sessao, agora))}
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-raised">
        <div className="h-full bg-primary-400" style={{ width: `${total ? (feitos / total) * 100 : 0}%` }} />
      </div>
      {pausada && <p className="font-semibold text-primary-400">Treino pausado</p>}
      <div className="grid grid-cols-2 gap-2">
        {pausada ? (
          <button type="button" className="btn-primary" disabled={ocupado} onClick={() => executar((s) => workoutSessionsRepository.retomar(s.id))}>
            <Play size={20} /> Retomar
          </button>
        ) : (
          <button type="button" className="btn-secondary" disabled={ocupado} onClick={() => executar((s) => workoutSessionsRepository.pausar(s.id))}>
            <Pause size={20} /> Pausar
          </button>
        )}
        <button type="button" className="btn-secondary" disabled={ocupado} onClick={abandonar}>
          <X size={20} /> Abandonar
        </button>
      </div>
    </header>
  );
}
