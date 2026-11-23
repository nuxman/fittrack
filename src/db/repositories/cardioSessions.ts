import { z } from 'zod';
import { db } from '../db';
import { MODALIDADES_CARDIO, type CardioSession } from '../types';
import { createRepository, now } from './base';
import { workoutSessionsRepository } from './workoutSessions';
import { chaveDia } from '../../semana';
import type { DadosCardio } from '../../cardio';

const base = createRepository<CardioSession>(db.cardioSessions);

export type DadosCardioCompleto = DadosCardio & { rpe: number | null; observacoes: string };

const opcional = (min: number, max: number, rotulo: string) =>
  z.number().min(min, `${rotulo}: de ${min} a ${max}`).max(max, `${rotulo}: de ${min} a ${max}`).nullable();

/** Validação de tudo que é gravado num cardio (avulso ou correção do ligado ao treino). */
export const cardioSchema = z.object({
  modalidade: z.enum(MODALIDADES_CARDIO),
  duracaoMin: z.number().int('Duração (min): de 1 a 300').min(1, 'Duração (min): de 1 a 300').max(300, 'Duração (min): de 1 a 300'),
  velocidadeKmh: opcional(0, 30, 'Velocidade (km/h)'),
  inclinacaoNivel: z.object({ valor: z.number().min(0), rotulo: z.string().min(1) }).nullable(),
  distanciaKm: opcional(0, 100, 'Distância (km)'),
  andares: z.number().int('Andares: número inteiro de 0 a 1000').min(0, 'Andares: número inteiro de 0 a 1000').max(1000, 'Andares: número inteiro de 0 a 1000').optional(),
  fcMedia: z.number().int().min(30, 'FC média: de 30 a 250').max(250, 'FC média: de 30 a 250').optional(),
  rpe: z.number().int().min(0, 'RPE deve ser de 0 a 10').max(10, 'RPE deve ser de 0 a 10').nullable(),
  observacoes: z.string().trim(),
}).refine((c) => (c.modalidade === 'escada' ? c.velocidadeKmh === null && c.distanciaKm === null : c.andares === undefined), {
  message: 'Escada não tem velocidade nem distância; andares só na escada',
});

const dataSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data')
  .refine((d) => d <= chaveDia(new Date()), 'A data não pode ser no futuro');

function validar<T>(schema: z.ZodType<T>, dados: unknown): T {
  const r = schema.safeParse(dados);
  if (!r.success) throw new Error(r.error.issues[0]!.message);
  return r.data;
}

export const cardioSessionsRepository = {
  ...base,

  /**
   * Grava o cardio pós-treino ligado à sessão (data = dia em que foi aberto) e encerra o cardio em curso,
   * na mesma transação.
   */
  async concluirDoTreino(sessionId: string, dados: DadosCardioCompleto): Promise<CardioSession> {
    const v = validar(cardioSchema, dados);
    return db.transaction('rw', db.cardioSessions, db.workoutSessions, async () => {
      const s = await workoutSessionsRepository.get(sessionId);
      if (!s?.cardio) throw new Error('Nenhum cardio em curso para este treino');
      const c = await base.create({ ...v, sessionId, data: chaveDia(new Date(s.cardio.desde)) });
      await workoutSessionsRepository.encerrarCardio(sessionId);
      return c;
    });
  },

  /** Cardio avulso (sem treino): conta nos minutos e na faixa da semana, nunca no "X de Y" nem nas pendências. */
  async registrarAvulso(dados: DadosCardioCompleto & { data: string }): Promise<CardioSession> {
    return base.create({ ...validar(cardioSchema, dados), data: validar(dataSchema, dados.data) });
  },

  /** Correção pelo Histórico. A data só muda no avulso; o ligado segue o dia do treino. */
  async editar(id: string, dados: DadosCardioCompleto & { data?: string }): Promise<CardioSession> {
    const atual = await base.get(id);
    if (!atual) throw new Error('Cardio não encontrado');
    const v = validar(cardioSchema, dados);
    const data = atual.sessionId || dados.data === undefined ? atual.data : validar(dataSchema, dados.data);
    const next: CardioSession = { ...atual, ...v, data, updatedAt: now() };
    // Opcionais apagados (ou que não valem para a modalidade) somem do registro.
    if (v.fcMedia === undefined) delete next.fcMedia;
    if (v.andares === undefined) delete next.andares;
    await db.cardioSessions.put(next);
    return next;
  },

  /** Exclui (soft delete) um cardio avulso. O ligado a um treino sai junto com o treino. */
  async excluirAvulso(id: string): Promise<void> {
    const c = await base.get(id);
    if (!c) throw new Error('Cardio não encontrado');
    if (c.sessionId) throw new Error('Este cardio é excluído junto com o treino');
    await base.remove(id);
  },

  /** Desfaz `excluirAvulso`. */
  restaurar: (id: string) => db.cardioSessions.update(id, { deletedAt: null, updatedAt: now() }).then(() => undefined),
};
