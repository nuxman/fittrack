import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useMatch, useNavigate } from 'react-router-dom';
import { EllipsisVertical, Pause, Play, X } from 'lucide-react';
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
    settings,
    vibrar: settings.interface.vibrar,
  };
}

type Dados = NonNullable<Awaited<ReturnType<typeof carregar>>>;
interface CtxSessao extends Dados {
  recarregar: () => void;
  /** Estado da tela sempre ligada, em texto ("ativa", "desligada", "indisponível"). */
  wake: string;
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

/**
 * Rotas /sessao/*: tela cheia em coluna (sem a navegação inferior): cabeçalho compacto,
 * conteúdo rolável e, em cada tela, o próprio rodapé fixo.
 */
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
    <Ctx.Provider value={{ ...dados, recarregar, agir, wake: TEXTO_WAKE[wake] }}>
      <main className="mx-auto flex h-dvh max-w-xl flex-col" data-testid="tela-sessao">
        <BarraSessao />
        <Outlet />
      </main>
    </Ctx.Provider>
  );
}

/** Texto pequeno no fim do conteúdo rolável de cada tela da sessão. */
export function EstadoTela() {
  return <p className="py-2 text-center text-xs text-neutral-500">Tela sempre ligada: {useSessao().wake}</p>;
}

/** Uma linha: ficha, "X de Y", tempo total e menu ⋮ com Pausar/Retomar e Abandonar. */
function BarraSessao() {
  const { sessao, sets, agir } = useSessao();
  const naFinalizacao = useMatch('/sessao/finalizar');
  const agora = useAgora();
  const navigate = useNavigate();
  const { confirmar } = useDialog();
  const [ocupado, setOcupado] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const fora = (e: PointerEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, [menu]);

  if (naFinalizacao) return null;

  const pausada = sessao.status === 'pausada';
  const { feitos, total } = progresso(sessao.planSnapshot.itens, sets, pulados(sessao));
  const executar = async (f: (s: WorkoutSession) => Promise<unknown>) => {
    setMenu(false);
    setOcupado(true);
    try {
      await agir(f);
    } finally {
      setOcupado(false);
    }
  };

  const abandonar = async () => {
    setMenu(false);
    const ok = await confirmar('Abandonar treino?', 'As séries já registradas ficam salvas. O treino não conta como feito.', 'Abandonar', true);
    if (!ok) return;
    await workoutSessionsRepository.abandonar(sessao.id);
    navigate('/treinar', { replace: true });
  };

  return (
    <header className="shrink-0 border-b border-neutral-800 bg-surface px-4">
      <div className="flex h-12 items-center gap-2 text-sm">
        <h1 className="min-w-0 flex-1 truncate font-semibold text-primary-400">{sessao.planSnapshot.nome}</h1>
        <span className="shrink-0 text-neutral-300" data-testid="progresso" aria-label={`${feitos} de ${total} exercícios concluídos`}>
          {feitos} de {total}
        </span>
        <span className="shrink-0 tabular-nums text-neutral-300" aria-label="Tempo total">
          {formatarDuracao(tempoAtivoEm(sessao, agora))}
        </span>
        {pausada && (
          <button type="button" className="shrink-0 rounded-lg bg-primary-400 px-2 py-1 font-semibold text-neutral-950" disabled={ocupado} onClick={() => executar((s) => workoutSessionsRepository.retomar(s.id))}>
            <Play size={14} className="mr-1 inline" aria-hidden />
            Retomar
          </button>
        )}
        <div className="relative shrink-0" ref={menuRef}>
          <button type="button" aria-label="Mais opções" aria-expanded={menu} className="-mr-2 p-2 text-neutral-300" onClick={() => setMenu((m) => !m)}>
            <EllipsisVertical size={22} />
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 top-full z-30 w-48 overflow-hidden rounded-xl bg-surface-raised shadow-lg">
              {pausada ? (
                <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-4 py-3 text-left" disabled={ocupado} onClick={() => executar((s) => workoutSessionsRepository.retomar(s.id))}>
                  <Play size={18} /> Retomar
                </button>
              ) : (
                <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-4 py-3 text-left" disabled={ocupado} onClick={() => executar((s) => workoutSessionsRepository.pausar(s.id))}>
                  <Pause size={18} /> Pausar
                </button>
              )}
              <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-4 py-3 text-left text-red-400" disabled={ocupado} onClick={abandonar}>
                <X size={18} /> Abandonar
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="-mx-4 h-1 bg-surface-raised">
        <div className="h-full bg-primary-400" style={{ width: `${total ? (feitos / total) * 100 : 0}%` }} />
      </div>
    </header>
  );
}
