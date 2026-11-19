import type { Medida, Ponto } from '../../evolucao';
import type { CardioSession, ModalidadeCardio } from '../../db/types';
import { ehEscada } from '../../cardio';
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

/** "DD/MM" de um ISO com horário ou de uma data 'AAAA-MM-DD' (cardio), sem desvio de fuso. */
export const ddmm = (iso: string) =>
  (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00`) : new Date(iso)).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

export interface Serie<P = Ponto> {
  titulo: string;
  valor: (p: P) => number | null;
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


/** Gráficos do cardio: duração e distância; velocidade só das sessões com velocidade. Escada: duração e andares. Inclinação/nível só na tabela. */
export function seriesCardio(m: ModalidadeCardio): Serie<CardioSession>[] {
  const duracao: Serie<CardioSession> = { titulo: 'Duração por sessão', valor: (c) => c.duracaoMin, formatar: (v) => `${num(v)} min` };
  if (ehEscada(m)) return [duracao, { titulo: 'Andares por sessão', valor: (c) => c.andares ?? null, formatar: (v) => `${num(v)} andares` }];
  return [
    duracao,
    { titulo: 'Distância por sessão', valor: (c) => c.distanciaKm, formatar: (v) => `${num(v)} km` },
    { titulo: 'Velocidade média', valor: (c) => c.velocidadeKmh, formatar: (v) => `${num(v)} km/h` },
  ];
}
