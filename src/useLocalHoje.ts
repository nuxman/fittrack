import { settingsRepository } from './db/repositories/settings';
import type { LocalTreino } from './db/types';
import { chaveDia, localEscolhido } from './semana';
import type { Painel } from './painel';

/** Local do dia (Início e aba Treinar): guardado em UserSettings com a data de hoje; outro dia volta para academia. */
export function useLocalHoje(painel: Painel | undefined, recarregar: () => void) {
  const local: LocalTreino = painel ? localEscolhido(painel.settings, new Date()) : 'academia';
  const mudar = async (l: LocalTreino) => {
    // Lê do banco: funciona mesmo se o toque vier antes de o painel carregar.
    const atual = await settingsRepository.get();
    await settingsRepository.update({ interface: { ...atual.interface, localHoje: { local: l, data: chaveDia(new Date()) } } });
    recarregar();
  };
  return [local, mudar] as const;
}
