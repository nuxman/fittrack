import type { Table } from 'dexie';
import type { BaseRecord, NewRecord } from '../types';

const now = () => new Date().toISOString();

export function createRepository<T extends BaseRecord>(table: Table<T, string>) {
  return {
    async list(): Promise<T[]> {
      return (await table.toArray()).filter((r) => r.deletedAt === null);
    },

    async get(id: string): Promise<T | undefined> {
      const r = await table.get(id);
      return r && r.deletedAt === null ? r : undefined;
    },

    async create(data: NewRecord<T>): Promise<T> {
      const ts = now();
      const record = { ...data, id: crypto.randomUUID(), createdAt: ts, updatedAt: ts, deletedAt: null } as T;
      await table.add(record);
      return record;
    },

    async update(id: string, changes: Partial<NewRecord<T>>): Promise<T> {
      const current = await table.get(id);
      if (!current || current.deletedAt !== null) throw new Error(`Registro ${id} não encontrado`);
      const next = { ...current, ...changes, id, updatedAt: now() } as T;
      await table.put(next);
      return next;
    },

    /** Soft delete: marca deletedAt, o registro continua no banco. */
    async remove(id: string): Promise<void> {
      const current = await table.get(id);
      if (!current || current.deletedAt !== null) return;
      const ts = now();
      await table.put({ ...current, deletedAt: ts, updatedAt: ts });
    },
  };
}
