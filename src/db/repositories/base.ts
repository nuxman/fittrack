import type { Table } from 'dexie';
import type { BaseRecord, NewRecord } from '../types';

const now = () => new Date().toISOString();

/** Adiciona id e timestamps a um registro novo. */
export function stamp<T extends BaseRecord>(data: NewRecord<T>): T {
  const ts = now();
  return { ...data, id: crypto.randomUUID(), createdAt: ts, updatedAt: ts, deletedAt: null } as T;
}

const ativo = (r: BaseRecord | undefined) => r !== undefined && r.deletedAt === null;

export function createRepository<T extends BaseRecord>(table: Table<T, string>) {
  return {
    /** Filtra deletedAt em memória: IndexedDB não indexa null, então não há índice em deletedAt. */
    async list(): Promise<T[]> {
      return table.filter(ativo).toArray();
    },

    async get(id: string): Promise<T | undefined> {
      const r = await table.get(id);
      return ativo(r) ? r : undefined;
    },

    async create(data: NewRecord<T>): Promise<T> {
      const record = stamp<T>(data);
      await table.add(record);
      return record;
    },

    async update(id: string, changes: Partial<NewRecord<T>>): Promise<T> {
      const current = await table.get(id);
      if (!current || !ativo(current)) throw new Error(`Registro ${id} não encontrado`);
      const next = { ...current, ...changes, id, updatedAt: now() } as T;
      await table.put(next);
      return next;
    },

    /** Soft delete: marca deletedAt, o registro continua no banco. */
    async remove(id: string): Promise<void> {
      const current = await table.get(id);
      if (!current || !ativo(current)) return;
      const ts = now();
      await table.put({ ...current, deletedAt: ts, updatedAt: ts });
    },
  };
}
