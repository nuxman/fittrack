import { z } from 'zod';
import { db } from '../db';
import type { BodyMeasurement } from '../types';
import { createRepository, now } from './base';
import { chaveDia } from '../../semana';
import { LIMITES } from '../../medidas';

const base = createRepository<BodyMeasurement>(db.bodyMeasurements);

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
  async registrar(dados: DadosMedida): Promise<BodyMeasurement> {
    return base.create(validar(dados));
  },
  async editar(id: string, dados: DadosMedida): Promise<BodyMeasurement> {
    return base.update(id, validar(dados));
  },
  /** Desfaz `remove` (soft delete). */
  restaurar: (id: string) => db.bodyMeasurements.update(id, { deletedAt: null, updatedAt: now() }).then(() => undefined),
};
