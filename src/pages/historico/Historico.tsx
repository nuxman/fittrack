import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Page } from '../../components/Page';
import { useAsync } from '../../useAsync';
import { workoutSessionsRepository, type ExclusaoTreino } from '../../db/repositories/workoutSessions';
import { exerciseSetsRepository } from '../../db/repositories/exerciseSets';
import { cardioSessionsRepository } from '../../db/repositories/cardioSessions';
import type { WorkoutSession } from '../../db/types';
import { ATIVOS, formatarDuracao, volumeKg } from '../../sessao';
import { chaveDia, inicioSemana } from '../../semana';
import { linhaCardio } from '../../cardio';

const DESFAZER_MS = 8000;
/** Estado da navegação depois de excluir um treino no detalhe. */
export interface Excluido extends ExclusaoTreino {
  em: number;
}

const kg = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`;
const ddmm = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

async function carregar() {
  const [sessoes, sets, cardio] = await Promise.all([
    workoutSessionsRepository.list(),
    exerciseSetsRepository.porSessao(),
    cardioSessionsRepository.list(),
  ]);
  const encerradas = sessoes.filter((s) => !ATIVOS.includes(s.status)).sort((a, b) => b.iniciadaEm.localeCompare(a.iniciadaEm));
  const semanas = new Map<string, WorkoutSession[]>();
  for (const s of encerradas) {
    const k = chaveDia(inicioSemana(new Date(s.iniciadaEm)));
    semanas.set(k, [...(semanas.get(k) ?? []), s]);
  }
  return { semanas: [...semanas.values()], sets, cardio };
}

/** Treinos encerrados (concluídos e abandonados), agrupados por semana (segunda a domingo). */
export function Historico() {
  const [dados, recarregar] = useAsync(carregar);
  const excluido = useLocation().state as Excluido | null;

  return (
    <Page title="Histórico">
      {!dados ? (
        <p>Carregando…</p>
      ) : dados.semanas.length === 0 ? (
        <div className="card space-y-4">
          <p className="text-lg text-neutral-300">Seus treinos concluídos aparecem aqui, com data, duração e volume. Comece pela aba Treinar.</p>
          <Link to="/treinar" className="btn-primary w-full">Ir para Treinar</Link>
        </div>
      ) : (
        dados.semanas.map((lista) => {
          const ini = inicioSemana(new Date(lista[0]!.iniciadaEm));
          const fim = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + 6);
          return (
            <section key={ini.toISOString()} className="space-y-2" aria-label={`Semana de ${ddmm(ini)} a ${ddmm(fim)}`}>
              <h2 className="text-sm font-semibold uppercase text-neutral-400">
                Semana de {ddmm(ini)} a {ddmm(fim)}
              </h2>
              {lista.map((s) => {
                const vol = volumeKg(dados.sets.get(s.id) ?? [], s.planSnapshot.itens);
                const cardio = dados.cardio.filter((c) => c.sessionId === s.id);
                return (
                  <Link key={s.id} to={`/historico/${s.id}`} className="card block space-y-1" data-testid="card-historico">
                    <p className="flex items-center gap-2 text-lg font-semibold">
                      {s.planSnapshot.nome}
                      {s.status === 'abandonada' && <span className="rounded-full bg-surface-raised px-2 text-xs font-normal text-neutral-300">abandonado</span>}
                    </p>
                    <p className="text-neutral-300">
                      {new Date(s.iniciadaEm).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
                      {formatarDuracao(s.duracaoAtivaSeg)} · {vol === null ? '—' : kg(vol)}
                      {s.rpe !== null && ` · RPE ${s.rpe}`}
                    </p>
                    {cardio.map((c) => (
                      <p key={c.id} className="text-sm text-neutral-400">{linhaCardio(c)}</p>
                    ))}
                  </Link>
                );
              })}
            </section>
          );
        })
      )}
      {excluido && <Desfazer key={excluido.em} excluido={excluido} onDesfeito={recarregar} />}
    </Page>
  );
}

/** "Treino excluído · Desfazer" por 8 s a partir da exclusão (recarregar a página não estende o prazo). */
function Desfazer({ excluido, onDesfeito }: { excluido: Excluido; onDesfeito: () => void }) {
  const navigate = useNavigate();
  const [visivel, setVisivel] = useState(() => Date.now() - excluido.em < DESFAZER_MS);
  useEffect(() => {
    if (!visivel) return;
    const t = setTimeout(() => setVisivel(false), excluido.em + DESFAZER_MS - Date.now());
    return () => clearTimeout(t);
  }, [visivel, excluido.em]);
  if (!visivel) return null;
  const desfazer = async () => {
    setVisivel(false);
    await workoutSessionsRepository.restaurar(excluido);
    navigate('.', { replace: true, state: null });
    onDesfeito();
  };
  return (
    <div role="status" className="fixed inset-x-4 bottom-[calc(var(--nav-h)+max(env(safe-area-inset-bottom),8px)+0.75rem)] z-20 mx-auto flex max-w-md items-center justify-between rounded-2xl bg-surface-raised px-4 py-2 shadow-lg">
      <span>Treino excluído</span>
      <button type="button" className="min-h-11 px-2 font-semibold text-primary-400" onClick={() => void desfazer()}>
        Desfazer
      </button>
    </div>
  );
}
