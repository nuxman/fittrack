import Dexie from 'dexie';
import { db } from '../db';
import { BANCO_DEMO, marcarDemo, pagina } from '../../modo';

export const demoRepository = {
  /** O banco aberto nesta abertura do app é o de demonstração. */
  ativo: () => db.name === BANCO_DEMO,

  /**
   * Entra no modo sempre com dados novos: apaga o banco de demonstração (nunca o real, que está aberto e não é
   * tocado) e recarrega; o populate o recria com datas atuais.
   */
  async entrar(): Promise<void> {
    if (db.name === BANCO_DEMO) await db.delete();
    else await Dexie.delete(BANCO_DEMO);
    marcarDemo();
  },

  /** Apaga o banco de demonstração; na próxima abertura o populate o recria. Recusa o banco real. */
  async recomecar(): Promise<void> {
    if (db.name !== BANCO_DEMO) throw new Error('Só o banco de demonstração pode ser recomeçado');
    await db.delete();
    pagina.recarregar();
  },
};
