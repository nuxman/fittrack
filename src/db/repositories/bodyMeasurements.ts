import { z } from 'zod';
import { db } from '../db';
import type { BodyMeasurement } from '../types';
import { createRepository, now } from './base';
import { chaveDia } from '../../semana';
import { LIMITES } from '../../medidas';
import { bodyPhotosRepository } from './bodyPhotos';

const base = createRepository<BodyMeasurement>(db.bodyMeasurements);

export interface ExclusaoMedida {
  id: string;
  fotos: string[];
}

/** Fotos adicionadas (blobs redimensionados) e removidas (ids) no editor, gravadas ao salvar a medição. */
export interface MudancaFotos {
  novas: Blob[];
  removidas: string[];
}

export type DadosMedida = Pick<BodyMeasurement, 'data' | 'pesoKg' | 'cinturaCm' | 'observacoes'>;

const faixa = ([min, max]: readonly [number, number], rotulo: string) =>
  z.number().min(min, `${rotulo}: de ${min} a ${max}`).max(max, `${rotulo}: de ${min} a ${max}`).nullable();

const medidaSchema = z
  .object({
    data: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data')
      .refine((d) => d <= chaveDia(new Date()), 'A data não pode ser no futuro'),
    pesoKg: faixa(LIMITES.peso, 'Peso (kg)'),
    cinturaCm: faixa(LIMITES.cintura, 'Cintura (cm)'),
    observacoes: z.string().trim(),
  })
  .refine((m) => m.pesoKg !== null || m.cinturaCm !== null, 'Informe o peso ou a cintura');

function validar(dados: DadosMedida): DadosMedida {
  const r = medidaSchema.safeParse(dados);
  if (!r.success) throw new Error(r.error.issues[0]!.message);
  return r.data;
}

export const bodyMeasurementsRepository = {
  ...base,
  /** Grava a medição (nova se `id` vazio) e, na mesma transação, as fotos novas (já redimensionadas) e as removidas. */
  async salvar(id: string | null, dados: DadosMedida, fotos: MudancaFotos = { novas: [], removidas: [] }): Promise<BodyMeasurement> {
    const v = validar(dados);
    return db.transaction('rw', db.bodyMeasurements, db.bodyPhotos, async () => {
      const m = id ? await base.update(id, v) : await base.create(v);
      for (const blob of fotos.novas) await bodyPhotosRepository.adicionar(m.id, blob);
      for (const f of fotos.removidas) await bodyPhotosRepository.remover(f);
      return m;
    });
  },
  registrar: (dados: DadosMedida) => bodyMeasurementsRepository.salvar(null, dados),
  editar: (id: string, dados: DadosMedida) => bodyMeasurementsRepository.salvar(id, dados),
  /**
   * Exclui (soft delete) a medição e as fotos dela, numa transação. As fotos mantêm o blob até passar o prazo do
   * "Desfazer" (bodyPhotosRepository.esvaziarExcluidas). Devolve o que `restaurar` precisa.
   */
  excluir(id: string): Promise<ExclusaoMedida> {
    return db.transaction('rw', db.bodyMeasurements, db.bodyPhotos, async () => {
      if (!(await base.get(id))) throw new Error('Medida não encontrada');
      const ts = now();
      await db.bodyMeasurements.update(id, { deletedAt: ts, updatedAt: ts });
      return { id, fotos: await bodyPhotosRepository.excluirDaMedicao(id, ts) };
    });
  },
  /** Desfaz `excluir`: a medição e as fotos daquela exclusão. */
  restaurar(e: ExclusaoMedida): Promise<void> {
    return db.transaction('rw', db.bodyMeasurements, db.bodyPhotos, async () => {
      await db.bodyMeasurements.update(e.id, { deletedAt: null, updatedAt: now() });
      await bodyPhotosRepository.restaurar(e.fotos);
    });
  },
};
