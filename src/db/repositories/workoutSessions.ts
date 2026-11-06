import { db } from '../db';
import type { PlanSnapshot, WorkoutSession } from '../types';
import { createRepository } from './base';

const base = createRepository<WorkoutSession>(db.workoutSessions);

export const workoutSessionsRepository = {
  ...base,

  /** Cópia profunda da ficha com nome/tipo/unidade/grupo de cada exercício congelados agora. */
  snapshotDaFicha(planId: string): Promise<PlanSnapshot> {
    return db.transaction('r', db.workoutPlans, db.exercises, async () => {
      const plano = await db.workoutPlans.get(planId);
      if (!plano || plano.deletedAt !== null) throw new Error('Ficha não encontrada');
      const itens = await Promise.all(
        plano.itens.map(async (it) => {
          const e = await db.exercises.get(it.exerciseId);
          if (!e) throw new Error(`Exercício ${it.exerciseId} não encontrado`);
          return { ...it, nome: e.nome, tipo: e.tipo, unidadeCarga: e.unidadeCarga, grupoPrincipal: e.grupoPrincipal };
        }),
      );
      return structuredClone({ ...plano, itens });
    });
  },
};
