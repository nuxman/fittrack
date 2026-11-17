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
