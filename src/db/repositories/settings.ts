import { db } from '../db';
import type { NewRecord, UserSettings } from '../types';
import { createRepository } from './base';

const base = createRepository<UserSettings>(db.settings);

export const DEFAULT_SETTINGS: NewRecord<UserSettings> = {
  descansoPadraoSeg: 90,
  cardioPadrao: { modalidade: 'esteira', duracaoMin: 15, inclinacaoNivel: { valor: 7, rotulo: 'nível 7' } },
  interface: { tema: 'escuro', vibrar: true },
};

/** Configurações são um registro único. */
export const settingsRepository = {
  async get(): Promise<UserSettings> {
    return (await base.list())[0] ?? base.create(DEFAULT_SETTINGS);
  },
  async update(changes: Partial<NewRecord<UserSettings>>): Promise<UserSettings> {
    return base.update((await settingsRepository.get()).id, changes);
  },
};
