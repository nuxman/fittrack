import { z } from 'zod';
import { db } from '../db';
import type { Equipment, Exercise } from '../types';
import { createRepository } from './base';

const base = createRepository<Equipment>(db.equipment);

export const equipmentSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome do aparelho').transform((s) => s.replace(/\s+/g, ' ')),
  observacoes: z.string().trim(),
});

export class AparelhoEmUsoError extends Error {
  constructor(readonly exercicios: Exercise[]) {
    super(`Usado em: ${exercicios.map((e) => e.nome).join(', ')}. Tire o aparelho desses exercícios antes de excluir.`);
  }
}

const exerciciosQueUsam = (id: string) =>
  db.exercises.where('equipmentId').equals(id).filter((e) => e.deletedAt === null).sortBy('nome');

export const equipmentRepository = {
  get: base.get,
  list: async () => (await base.list()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  exerciciosQueUsam,
  create: (dados: Pick<Equipment, 'nome' | 'observacoes'>) => base.create(equipmentSchema.parse(dados)),
  async update(id: string, dados: Partial<Pick<Equipment, 'nome' | 'observacoes'>>): Promise<Equipment> {
    const atual = await base.get(id);
    if (!atual) throw new Error('Aparelho não encontrado');
    return base.update(id, equipmentSchema.parse({ ...atual, ...dados }));
  },
  /** Bloqueado enquanto algum exercício usar o aparelho. */
  remove(id: string): Promise<void> {
    return db.transaction('rw', db.equipment, db.exercises, async () => {
      const ex = await exerciciosQueUsam(id);
      if (ex.length) throw new AparelhoEmUsoError(ex);
      await base.remove(id);
    });
  },
};
