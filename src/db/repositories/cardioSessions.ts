import { db } from '../db';
import type { CardioSession } from '../types';
import { createRepository } from './base';
import { workoutSessionsRepository } from './workoutSessions';
import { chaveDia } from '../../semana';
import type { DadosCardio } from '../../cardio';

const base = createRepository<CardioSession>(db.cardioSessions);

export const cardioSessionsRepository = {
  ...base,

  /**
   * Grava o cardio pós-treino ligado à sessão (data = dia em que foi aberto) e encerra o cardio em curso,
   * na mesma transação.
   */
  concluirDoTreino(sessionId: string, dados: DadosCardio & { rpe: number | null; observacoes: string }): Promise<CardioSession> {
    if (dados.rpe !== null && (!Number.isInteger(dados.rpe) || dados.rpe < 0 || dados.rpe > 10)) throw new Error('RPE deve ser de 0 a 10');
    return db.transaction('rw', db.cardioSessions, db.workoutSessions, async () => {
      const s = await workoutSessionsRepository.get(sessionId);
      if (!s?.cardio) throw new Error('Nenhum cardio em curso para este treino');
      const c = await base.create({ ...dados, sessionId, data: chaveDia(new Date(s.cardio.desde)), observacoes: dados.observacoes.trim() });
      await workoutSessionsRepository.encerrarCardio(sessionId);
      return c;
    });
  },
};
