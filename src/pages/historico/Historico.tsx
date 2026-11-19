import { Link, useLocation } from 'react-router-dom';
import { Desfazer } from '../../components/Desfazer';
import { HeartPulse, Plus } from 'lucide-react';
import { Page } from '../../components/Page';
import { useAsync } from '../../useAsync';
import { workoutSessionsRepository, type ExclusaoTreino } from '../../db/repositories/workoutSessions';
import { exerciseSetsRepository } from '../../db/repositories/exerciseSets';
import { cardioSessionsRepository } from '../../db/repositories/cardioSessions';
import type { CardioSession, WorkoutSession } from '../../db/types';
import { ATIVOS, formatarDuracao, volumeKg } from '../../sessao';
import { chaveDia, deChave, inicioSemana } from '../../semana';
import { linhaCardio, NOME_MODALIDADE, resumoCardio } from '../../cardio';

/** Estado da navegação depois de excluir um treino no detalhe. */
export interface Excluido extends ExclusaoTreino {
  em: number;
}
/** Estado da navegação para o Histórico: treino excluído ou cardio avulso excluído (ambos com "Desfazer"). */
export type EstadoHistorico = Excluido | { cardioAvulso: string; em: number };

type Item = { tipo: 'treino'; em: number; sessao: WorkoutSession } | { tipo: 'cardio'; em: number; cardio: CardioSession };

const kg = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`;
const ddmm = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

async function carregar() {
  const [sessoes, sets, cardio] = await Promise.all([
    workoutSessionsRepository.list(),
    exerciseSetsRepository.porSessao(),
    cardioSessionsRepository.list(),
  ]);
  const encerradas = sessoes.filter((s) => !ATIVOS.includes(s.status));
  // Cardio avulso: no dia dele, no horário em que foi registrado (registrado em outro dia: meio-dia).
  const emDe = (c: CardioSession) => (chaveDia(new Date(c.createdAt)) === c.data ? Date.parse(c.createdAt) : deChave(c.data).getTime() + 12 * 36e5);
  const itens: Item[] = [
    ...encerradas.map((s) => ({ tipo: 'treino' as const, em: Date.parse(s.iniciadaEm), sessao: s })),
    ...cardio.filter((c) => !c.sessionId).map((c) => ({ tipo: 'cardio' as const, em: emDe(c), cardio: c })),
  ].sort((a, b) => b.em - a.em);
  const semanas = new Map<string, Item[]>();
  for (const i of itens) {
    const k = chaveDia(inicioSemana(new Date(i.em)));
    semanas.set(k, [...(semanas.get(k) ?? []), i]);
  }
  return { semanas: [...semanas.values()], sets, cardio };
}

/** Treinos encerrados (concluídos e abandonados) e cardios avulsos, agrupados por semana (segunda a domingo). */
export function Historico() {
  const [dados, recarregar] = useAsync(carregar);
  const excluido = useLocation().state as EstadoHistorico | null;
  const registrar = (
    <Link to="/historico/cardio/novo" className="btn-secondary w-full">
      <Plus size={22} /> Registrar cardio
    </Link>
  );

  return (
    <Page title="Histórico">
      {!dados ? (
        <p>Carregando…</p>
      ) : dados.semanas.length === 0 ? (
        <div className="card space-y-4">
          <p className="text-lg text-neutral-300">Seus treinos concluídos aparecem aqui, com data, duração e volume. Comece pela aba Treinar.</p>
          <Link to="/treinar" className="btn-primary w-full">Ir para Treinar</Link>
          {registrar}
        </div>
      ) : (
        <>
          {registrar}
          {dados.semanas.map((lista) => {
            const ini = inicioSemana(new Date(lista[0]!.em));
            const fim = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + 6);
            return (
              <section key={ini.toISOString()} className="space-y-2" aria-label={`Semana de ${ddmm(ini)} a ${ddmm(fim)}`}>
                <h2 className="text-sm font-semibold uppercase text-neutral-400">
                  Semana de {ddmm(ini)} a {ddmm(fim)}
                </h2>
                {lista.map((i) => {
                  if (i.tipo === 'cardio') return <CardCardio key={i.cardio.id} c={i.cardio} />;
                  const s = i.sessao;
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
          })}
        </>
      )}
      {excluido && (
        <Desfazer
          key={excluido.em}
          em={excluido.em}
          texto={'cardioAvulso' in excluido ? 'Cardio excluído' : 'Treino excluído'}
          onDesfazer={async () => {
            if ('cardioAvulso' in excluido) await cardioSessionsRepository.restaurar(excluido.cardioAvulso);
            else await workoutSessionsRepository.restaurar(excluido);
            recarregar();
          }}
        />
      )}
    </Page>
  );
}

function CardCardio({ c }: { c: CardioSession }) {
  return (
    <Link to={`/historico/cardio/${c.id}`} className="card block space-y-1" data-testid="card-cardio">
      <p className="flex items-center gap-2 text-lg font-semibold">
        <HeartPulse size={20} className="text-primary-400" /> {NOME_MODALIDADE[c.modalidade]}
      </p>
      <p className="text-neutral-300">
        {deChave(c.data).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })} · {resumoCardio(c)}
      </p>
    </Link>
  );
}
