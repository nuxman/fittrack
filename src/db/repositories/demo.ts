import { db } from '../db';
import { BANCO_DEMO, pagina } from '../../modo';

export const demoRepository = {
  /** O banco aberto nesta abertura do app é o de demonstração (não o que o localStorage diz agora: outra aba pode ter mudado). */
  ativo: () => db.name === BANCO_DEMO,

  /** Apaga o banco de demonstração; na próxima abertura o populate o recria. Recusa o banco real. */
  async recomecar(): Promise<void> {
    if (db.name !== BANCO_DEMO) throw new Error('Só o banco de demonstração pode ser recomeçado');
    await db.delete();
    pagina.recarregar();
  },
};
