import { z } from 'zod';
import { db } from '../db';
import {
  GRUPOS_MUSCULARES, TIPOS_EXERCICIO, UNIDADES_CARGA,
  type Exercise, type NewRecord, type WorkoutPlan,
} from '../types';
import { createRepository, now } from './base';
import { normalizeNome } from '../normalize';
import { SEMANA } from '../../dias';

const vazioParaUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

export const videoUrlSchema = z.preprocess(
  vazioParaUndefined,
  z
    .string()
    .trim()
    .url('Link inválido')
    .refine((u) => u.startsWith('https://'), 'O link precisa começar com https://')
    .optional(),
);

export const exerciseSchema = z
  .object({
    nome: z.string().trim().min(1, 'Informe o nome do exercício').transform((s) => s.replace(/\s+/g, ' ')),
    tipo: z.enum(TIPOS_EXERCICIO),
    unidadeCarga: z.enum(UNIDADES_CARGA),
    equipmentId: z.string().optional(),
    grupoPrincipal: z.enum(GRUPOS_MUSCULARES, { errorMap: () => ({ message: 'Escolha o grupo principal' }) }),
    gruposSecundarios: z.array(z.enum(GRUPOS_MUSCULARES)),
    porLado: z.boolean(),
    videoUrl: videoUrlSchema,
    anotacoes: z.preprocess(vazioParaUndefined, z.string().optional()),
  })
  .transform((e) => ({
    ...e,
    gruposSecundarios: [...new Set(e.gruposSecundarios)].filter((g) => g !== e.grupoPrincipal),
  }));

/** Nome normalizado já usado. excluido=true: o app deve oferecer "Restaurar". */
export class NomeDuplicadoError extends Error {
  constructor(
    readonly existente: Exercise,
    readonly excluido: boolean,
  ) {
    super(
      excluido
        ? `Existe um exercício excluído chamado "${existente.nome}"`
        : `Já existe o exercício "${existente.nome}"`,
    );
  }
}

export class ExercicioEmUsoError extends Error {
  constructor(readonly fichas: WorkoutPlan[]) {
    super(`Usado em: ${fichas.map((f) => f.nome).join(', ')}. Remova das fichas antes de excluir.`);
  }
}

const base = createRepository<Exercise>(db.exercises);

/** Busca pelo nome normalizado entre ativos e excluídos (excluído mais recente). */
async function buscarPorNome(nome: string, ignorarId?: string) {
  const alvo = normalizeNome(nome);
  const iguais = await db.exercises.filter((e) => e.id !== ignorarId && normalizeNome(e.nome) === alvo).toArray();
  return {
    ativo: iguais.find((e) => e.deletedAt === null),
    excluido: iguais
      .filter((e) => e.deletedAt !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0],
  };
}

function fichasQueUsam(exerciseId: string): Promise<WorkoutPlan[]> {
  return db.workoutPlans
    .filter((p) => p.deletedAt === null && p.itens.some((i) => i.exerciseId === exerciseId))
    .toArray()
    .then((ps) => ps.sort((a, b) => SEMANA.indexOf(a.diaSemana) - SEMANA.indexOf(b.diaSemana)));
}

export const exercisesRepository = {
  list: base.list,
  get: base.get,
  fichasQueUsam,

  async create(data: NewRecord<Exercise>): Promise<Exercise> {
    const v = exerciseSchema.parse(data);
    return db.transaction('rw', db.exercises, async () => {
      const { ativo, excluido } = await buscarPorNome(v.nome);
      if (ativo) throw new NomeDuplicadoError(ativo, false);
      if (excluido) throw new NomeDuplicadoError(excluido, true);
      return base.create(v);
    });
  },

  async update(id: string, changes: Partial<NewRecord<Exercise>>): Promise<Exercise> {
    return db.transaction('rw', db.exercises, async () => {
      const atual = await base.get(id);
      if (!atual) throw new Error('Exercício não encontrado');
      const v = exerciseSchema.parse({ ...atual, ...changes });
      const { ativo } = await buscarPorNome(v.nome, id);
      if (ativo) throw new NomeDuplicadoError(ativo, false);
      // Chaves opcionais sempre presentes: limpar um campo precisa sobrescrever o valor antigo.
      return base.update(id, { ...v, videoUrl: v.videoUrl, anotacoes: v.anotacoes, equipmentId: v.equipmentId });
    });
  },

  /** Bloqueado enquanto o exercício estiver em alguma ficha. */
  async remove(id: string): Promise<void> {
    await db.transaction('rw', db.exercises, db.workoutPlans, async () => {
      const fichas = await fichasQueUsam(id);
      if (fichas.length) throw new ExercicioEmUsoError(fichas);
      await base.remove(id);
    });
  },

  async restore(id: string): Promise<Exercise> {
    return db.transaction('rw', db.exercises, async () => {
      const r = await db.exercises.get(id);
      if (!r) throw new Error('Exercício não encontrado');
      if (r.deletedAt === null) return r;
      const { ativo } = await buscarPorNome(r.nome, id);
      if (ativo) throw new NomeDuplicadoError(ativo, false);
      const restaurado = { ...r, deletedAt: null, updatedAt: now() };
      await db.exercises.put(restaurado);
      return restaurado;
    });
  },

  /** Mesmo nome = mesmo exercício (ignora espaços extras, maiúsculas e acentos). */
  async findByName(nome: string): Promise<Exercise | undefined> {
    return (await buscarPorNome(nome)).ativo;
  },

  /** Excluído com o mesmo nome normalizado, para oferecer "Restaurar". */
  async findDeletedByName(nome: string): Promise<Exercise | undefined> {
    const { ativo, excluido } = await buscarPorNome(nome);
    return ativo ? undefined : excluido;
  },
};
