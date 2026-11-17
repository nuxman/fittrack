import type { Medida, Ponto } from '../../evolucao';
import { num } from '../../components/CampoSerie';
import { workoutSessionsRepository } from '../../db/repositories/workoutSessions';
import { exerciseSetsRepository } from '../../db/repositories/exerciseSets';
import { exercisesRepository } from '../../db/repositories/exercises';

/** Sessões, séries por sessão e nomes atuais dos exercícios (uma leitura para a aba Evolução). */
export async function carregarEvolucao() {
  const [sessoes, sets, exercicios] = await Promise.all([
    workoutSessionsRepository.list(),
    exerciseSetsRepository.porSessao(),
    exercisesRepository.list(),
  ]);
  return { sessoes, sets, nomes: new Map(exercicios.map((e) => [e.id, e.nome])) };
}

export const ddmm = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

export interface Serie {
  titulo: string;
  valor: (p: Ponto) => number | null;
  formatar: (v: number) => string;
}

export const kg = (v: number) => `${num(v)} kg`;
/** Gráficos de cada medida. Placa: só progressão de placa (sem volume em kg). Peso corporal: total de reps. */
export const SERIES: Record<Medida, Serie[]> = {
  kg: [
    { titulo: 'Carga máxima por treino', valor: (p) => p.cargaMax, formatar: kg },
    { titulo: 'Volume por treino', valor: (p) => p.volume, formatar: kg },
  ],
  placa: [{ titulo: 'Progressão de placa', valor: (p) => p.cargaMax, formatar: (v) => `placa ${num(v)}` }],
  peso_corporal: [{ titulo: 'Total de repetições por treino', valor: (p) => p.reps, formatar: (v) => `${num(v)} reps` }],
  tempo: [{ titulo: 'Maior tempo por treino', valor: (p) => p.tempoMax, formatar: (v) => `${num(v)} s` }],
};

