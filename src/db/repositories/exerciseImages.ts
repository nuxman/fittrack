import { db } from '../db';
import type { ExerciseImage, NewRecord } from '../types';
import { createRepository, now } from './base';

const base = createRepository<ExerciseImage>(db.exerciseImages);

const ativas = (exerciseId: string) =>
  db.exerciseImages.where('exerciseId').equals(exerciseId).filter((i) => i.deletedAt === null).toArray();

/** Soft delete esvaziando o blob, para liberar espaço. */
async function descartar(exerciseId: string) {
  const ts = now();
  for (const img of await ativas(exerciseId)) {
    await db.exerciseImages.put({ ...img, blob: new Blob([]), deletedAt: ts, updatedAt: ts });
  }
}

export const exerciseImagesRepository = {
  /** Imagens ativas com conteúdo, por exerciseId (miniaturas). */
  async mapaAtivas(): Promise<Map<string, Blob>> {
    const imgs = await db.exerciseImages.filter((i) => i.deletedAt === null && i.blob.size > 0).toArray();
    return new Map(imgs.map((i) => [i.exerciseId, i.blob]));
  },

  async getForExercise(exerciseId: string): Promise<ExerciseImage | undefined> {
    return (await ativas(exerciseId))[0];
  },

  /** No máximo uma imagem por exercício: a anterior é descartada. */
  setForExercise(exerciseId: string, img: Omit<NewRecord<ExerciseImage>, 'exerciseId'>): Promise<ExerciseImage> {
    return db.transaction('rw', db.exerciseImages, async () => {
      await descartar(exerciseId);
      return base.create({ ...img, exerciseId });
    });
  },

  removeForExercise(exerciseId: string): Promise<void> {
    return db.transaction('rw', db.exerciseImages, () => descartar(exerciseId));
  },
};
