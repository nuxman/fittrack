import { z } from 'zod';
import { db } from '../db';
import { CORES_APARELHO, type CorAparelho, type Equipment, type Exercise, type GrupoMuscular } from '../types';
import { createRepository } from './base';

const base = createRepository<Equipment>(db.equipment);

export const equipmentSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome do aparelho').transform((s) => s.replace(/\s+/g, ' ')),
  observacoes: z.string().trim(),
  cor: z.enum(CORES_APARELHO).optional(),
  numero: z.preprocess((v) => (typeof v === 'string' ? v.trim() || undefined : v), z.string().max(10, 'Número: no máximo 10 caracteres').optional()),
});

export type DadosAparelho = Pick<Equipment, 'nome' | 'observacoes' | 'cor' | 'numero'>;

export const NOME_COR: Record<CorAparelho, string> = { azul: 'Azul', laranja: 'Laranja', verde: 'Verde', vermelho: 'Vermelho' };

/** "Azul 12", "Azul", "12" ou o nome do aparelho (nunca só a cor sem texto). */
export const textoEtiqueta = (a: Pick<Equipment, 'nome' | 'cor' | 'numero'>) =>
  [a.cor && NOME_COR[a.cor], a.numero].filter(Boolean).join(' ') || a.nome;

/** Cor sugerida pelo grupo principal do exercício (editável). */
export function corSugerida(g: GrupoMuscular): CorAparelho {
  if (['quadríceps', 'posterior de coxa', 'glúteos', 'adutores', 'panturrilha'].includes(g)) return 'azul';
  if (['peito', 'costas', 'ombros'].includes(g)) return 'laranja';
  if (['bíceps', 'tríceps', 'antebraço'].includes(g)) return 'verde';
  return 'vermelho';
}

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
  create: async (dados: DadosAparelho) => base.create(equipmentSchema.parse(dados)),
  async update(id: string, dados: Partial<DadosAparelho>): Promise<Equipment> {
    const atual = await base.get(id);
    if (!atual) throw new Error('Aparelho não encontrado');
    const v = equipmentSchema.parse({ ...atual, ...dados });
    // cor e número limpos somem do registro.
    return base.update(id, { ...v, cor: v.cor, numero: v.numero });
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
