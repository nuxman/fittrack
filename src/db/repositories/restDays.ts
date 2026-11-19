import { db } from '../db';
import type { RestDay } from '../types';
import { ativo, createRepository } from './base';

const base = createRepository<RestDay>(db.restDays);

export const restDaysRepository = {
  ...base,
  doDia: (data: string) => db.restDays.where('data').equals(data).filter(ativo).first(),
  /** Marca o dia como descanso; se já estiver marcado, desmarca (soft delete). Devolve se ficou marcado. */
  alternar(data: string, observacoes = ''): Promise<boolean> {
    return db.transaction('rw', db.restDays, async () => {
      const atual = await restDaysRepository.doDia(data);
      if (atual) {
        await base.remove(atual.id);
        return false;
      }
      await base.create({ data, observacoes: observacoes.trim() });
      return true;
    });
  },
};
