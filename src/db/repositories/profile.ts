import { z } from 'zod';
import { db } from '../db';
import { SEXOS, type Profile } from '../types';
import { createRepository, now } from './base';
import { chaveDia } from '../../semana';

const base = createRepository<Profile>(db.profile);

export type DadosPerfil = Pick<Profile, 'nome' | 'nascimento' | 'alturaCm' | 'sexo' | 'objetivo'>;
export type FotoPerfil = NonNullable<Profile['foto']>;

/** Foto do perfil: no máximo 512 px no maior lado. */
export const MAX_FOTO_PERFIL = 512;
export const LIMITES_ALTURA = [50, 250] as const;

const texto = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' ? v.trim() || undefined : v), z.string().max(max, `No máximo ${max} caracteres`).optional());

/** Regras dos campos (também usadas na importação do backup). */
export const perfilSchema = z.object({
  nome: texto(60),
  nascimento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de nascimento inválida')
    .refine((d) => d >= '1900-01-01' && d <= chaveDia(new Date()), 'Data de nascimento inválida')
    .optional(),
  alturaCm: z
    .number()
    .min(LIMITES_ALTURA[0], `Altura (cm): de ${LIMITES_ALTURA[0]} a ${LIMITES_ALTURA[1]}`)
    .max(LIMITES_ALTURA[1], `Altura (cm): de ${LIMITES_ALTURA[0]} a ${LIMITES_ALTURA[1]}`)
    .optional(),
  sexo: z.enum(SEXOS).optional(),
  objetivo: texto(500),
});

const fotoSchema = z.object({
  mimeType: z.enum(['image/webp', 'image/jpeg']),
  largura: z.number().int().min(1).max(MAX_FOTO_PERFIL),
  altura: z.number().int().min(1).max(MAX_FOTO_PERFIL),
});

function validar(dados: DadosPerfil): DadosPerfil {
  const r = perfilSchema.safeParse(dados);
  if (!r.success) throw new Error(r.error.issues[0]!.message);
  return r.data;
}

/** Campos ausentes somem do registro (limpar um campo apaga o valor antigo). */
const semVazios = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export const profileRepository = {
  /** O perfil deste aparelho (undefined enquanto não foi salvo). */
  get: async (): Promise<Profile | undefined> => (await base.list())[0],

  /**
   * Grava os campos e, se `foto` vier, troca a foto (null remove; undefined mantém).
   * Foto já redimensionada (resizeImage com MAX_FOTO_PERFIL): o original nunca é salvo.
   */
  async salvar(dados: DadosPerfil, foto?: FotoPerfil | null): Promise<Profile> {
    const v = validar(dados);
    if (foto) fotoSchema.parse(foto);
    return db.transaction('rw', db.profile, async () => {
      const atual = await profileRepository.get();
      const fotoFinal = foto === undefined ? atual?.foto : foto ?? undefined;
      if (!atual) return base.create(semVazios({ ...v, foto: fotoFinal }));
      // Base = só id e datas: os campos vêm todos de `v` (o que foi limpo some).
      const { id, createdAt, deletedAt } = atual;
      const next = semVazios({ id, createdAt, deletedAt, ...v, foto: fotoFinal, updatedAt: now() }) as Profile;
      await db.profile.put(next);
      return next;
    });
  },
};
