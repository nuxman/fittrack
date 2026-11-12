import { workoutPlansRepository } from './db/repositories/workoutPlans';
import { workoutSessionsRepository } from './db/repositories/workoutSessions';
import { exercisesRepository } from './db/repositories/exercises';
import { exerciseImagesRepository } from './db/repositories/exerciseImages';
import { exerciseSetsRepository } from './db/repositories/exerciseSets';
import { cardioSessionsRepository } from './db/repositories/cardioSessions';
import { restDaysRepository } from './db/repositories/restDays';
import { settingsRepository } from './db/repositories/settings';
import { SEMANA } from './dias';

/** Dados do Início e da aba Treinar, numa leitura só. */
export async function carregarPainel() {
  const [planos, sessoes, exercicios, imagens, cardio, descansos, settings, ativa] = await Promise.all([
    workoutPlansRepository.list(),
    workoutSessionsRepository.list(),
    exercisesRepository.list(),
    exerciseImagesRepository.mapaAtivas(),
    cardioSessionsRepository.list(),
    restDaysRepository.list(),
    settingsRepository.get(),
    workoutSessionsRepository.ativa(),
  ]);
  const ultima = sessoes.filter((s) => s.status === 'concluida').sort((a, b) => b.iniciadaEm.localeCompare(a.iniciadaEm))[0];
  return {
    planos: planos.sort((a, b) => SEMANA.indexOf(a.diaSemana) - SEMANA.indexOf(b.diaSemana)),
    sessoes,
    exercicios: new Map(exercicios.map((e) => [e.id, e])),
    imagens,
    cardio,
    descansos,
    settings,
    ativa,
    ultima: ultima && { sessao: ultima, sets: await exerciseSetsRepository.listarDaSessao(ultima.id) },
  };
}

export type Painel = Awaited<ReturnType<typeof carregarPainel>>;
