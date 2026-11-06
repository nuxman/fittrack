import { db } from '../db';
import type { NewRecord, UserSettings } from '../types';
import { createRepository } from './base';
import { DEFAULT_SETTINGS } from '../seed';

const base = createRepository<UserSettings>(db.settings);

/** Configurações são um registro único (criado no populate). */
export const settingsRepository = {
  async get(): Promise<UserSettings> {
    return (await base.list())[0] ?? base.create(DEFAULT_SETTINGS);
  },
  async update(changes: Partial<NewRecord<UserSettings>>): Promise<UserSettings> {
    return base.update((await settingsRepository.get()).id, changes);
  },
};
