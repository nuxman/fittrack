import { z } from 'zod';
import { db } from '../db';
import type { Exercise, NewRecord } from '../types';
import { createRepository } from './base';
import { normalizeNome } from '../normalize';

export const videoUrlSchema = z
  .string()
  .trim()
  .url('Link inválido')
  .refine((u) => u.startsWith('https://'), 'O link precisa começar com https://')
  .optional();

const base = createRepository<Exercise>(db.exercises);

export const exercisesRepository = {
  ...base,

  async create(data: NewRecord<Exercise>) {
    return base.create({ ...data, videoUrl: videoUrlSchema.parse(data.videoUrl) });
  },

  async update(id: string, changes: Partial<NewRecord<Exercise>>) {
    if ('videoUrl' in changes) changes = { ...changes, videoUrl: videoUrlSchema.parse(changes.videoUrl) };
    return base.update(id, changes);
  },

  /** Mesmo nome = mesmo exercício (ignora espaços extras, maiúsculas e acentos). */
  async findByName(nome: string): Promise<Exercise | undefined> {
    const alvo = normalizeNome(nome);
    return (await base.list()).find((e) => normalizeNome(e.nome) === alvo);
  },
};
