import { db } from '../db';
import type { BodyPhoto } from '../types';
import { ativo, createRepository, now } from './base';
import { DESFAZER_MS } from '../../medidas';

const base = createRepository<BodyPhoto>(db.bodyPhotos);

/** Fotos corporais: várias por medição, só neste aparelho (não entram no backup). */
export const bodyPhotosRepository = {
  /** Fotos ativas de uma medição, na ordem em que foram adicionadas. */
  async daMedicao(measurementId: string): Promise<BodyPhoto[]> {
    const l = await db.bodyPhotos.where('measurementId').equals(measurementId).filter(ativo).toArray();
    return l.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  /** Fotos ativas de todas as medições, por measurementId (lista e comparação), na ordem em que foram adicionadas. */
  async porMedicao(): Promise<Map<string, BodyPhoto[]>> {
    const l = await db.bodyPhotos.filter((f) => ativo(f) && f.blob.size > 0).toArray();
    const m = new Map<string, BodyPhoto[]>();
    for (const f of l.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) m.set(f.measurementId, [...(m.get(f.measurementId) ?? []), f]);
    return m;
  },

  /** Recebe a foto já redimensionada (resizeImage): o original nunca é salvo. */
  adicionar: (measurementId: string, blob: Blob) => base.create({ measurementId, blob }),

  /** Remover uma foto: soft delete com o blob esvaziado (libera espaço na hora). */
  async remover(id: string): Promise<void> {
    const f = await base.get(id);
    if (!f) return;
    const ts = now();
    await db.bodyPhotos.put({ ...f, blob: new Blob([]), deletedAt: ts, updatedAt: ts });
  },

  /**
   * Excluir a medição exclui as fotos (soft delete) sem esvaziar o blob, para o "Desfazer" poder restaurá-las;
   * `esvaziarExcluidas` libera o espaço depois do prazo. Devolve os ids marcados.
   */
  async excluirDaMedicao(measurementId: string, ts = now()): Promise<string[]> {
    const ids = await db.bodyPhotos.where('measurementId').equals(measurementId).filter(ativo).primaryKeys();
    await db.bodyPhotos.where('id').anyOf(ids).modify({ deletedAt: ts, updatedAt: ts });
    return ids;
  },

  /** Desfaz `excluirDaMedicao`: só as fotos daquela exclusão (fotos removidas antes continuam removidas). */
  restaurar: (ids: string[]) => db.bodyPhotos.where('id').anyOf(ids).modify({ deletedAt: null, updatedAt: now() }).then(() => undefined),

  /**
   * Esvazia o blob das fotos excluídas há mais que o prazo do "Desfazer" (8 s). Roda ao fim do aviso e ao abrir o app
   * (cobre fechar o app durante o aviso). Devolve quantas foram esvaziadas.
   */
  async esvaziarExcluidas(agora = Date.now()): Promise<number> {
    const limite = new Date(agora - DESFAZER_MS).toISOString();
    return db.bodyPhotos.filter((f) => f.deletedAt !== null && f.deletedAt <= limite && f.blob.size > 0).modify((f) => {
      f.blob = new Blob([]);
    });
  },
};
