import { db } from '../db';
import type { ExerciseSet } from '../types';
import { ativo, createRepository } from './base';

const base = createRepository<ExerciseSet>(db.exerciseSets);

const porConclusao = (a: ExerciseSet, b: ExerciseSet) => a.concluidaEm.localeCompare(b.concluidaEm);

export const exerciseSetsRepository = {
  get: base.get,

  /** Séries ativas da sessão, em ordem de conclusão. */
  async listarDaSessao(sessionId: string): Promise<ExerciseSet[]> {
    return (await db.exerciseSets.where('sessionId').equals(sessionId).filter(ativo).toArray()).sort(porConclusao);
  },

  /** Série mais recente do exercício em qualquer sessão (carga sugerida = última registrada). */
  async ultimaDoExercicio(exerciseId: string): Promise<ExerciseSet | undefined> {
    return (await db.exerciseSets.where('exerciseId').equals(exerciseId).filter(ativo).toArray()).sort(porConclusao).at(-1);
  },

  /** Grava a próxima série do exercício na sessão (numeroSerie = feitas + 1), na mesma transação. */
  registrar(dados: Pick<ExerciseSet, 'sessionId' | 'exerciseId' | 'carga' | 'reps'>): Promise<ExerciseSet> {
    return db.transaction('rw', db.exerciseSets, async () => {
      const feitas = await db.exerciseSets
        .where('sessionId').equals(dados.sessionId)
        .filter((s) => ativo(s) && s.exerciseId === dados.exerciseId)
        .count();
      return base.create({ ...dados, numeroSerie: feitas + 1, lado: null, concluidaEm: new Date().toISOString() });
    });
  },

  /** Soft delete da série mais recente do exercício na sessão. */
  async desfazerUltima(sessionId: string, exerciseId: string): Promise<ExerciseSet | undefined> {
    const ultima = (await exerciseSetsRepository.listarDaSessao(sessionId)).filter((s) => s.exerciseId === exerciseId).at(-1);
    if (ultima) await base.remove(ultima.id);
    return ultima;
  },
};
