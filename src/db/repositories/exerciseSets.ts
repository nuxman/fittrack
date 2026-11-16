import { db } from '../db';
import type { ExerciseSet } from '../types';
import { ativo, createRepository, now } from './base';
import { validarSerie } from '../../sessao';

const base = createRepository<ExerciseSet>(db.exerciseSets);

/** Desempate por numeroSerie: duas séries no mesmo milissegundo não trocam de ordem. */
const porConclusao = (a: ExerciseSet, b: ExerciseSet) => a.concluidaEm.localeCompare(b.concluidaEm) || a.numeroSerie - b.numeroSerie;

export const exerciseSetsRepository = {
  get: base.get,

  /** Séries ativas da sessão, em ordem de conclusão. */
  async listarDaSessao(sessionId: string): Promise<ExerciseSet[]> {
    return (await db.exerciseSets.where('sessionId').equals(sessionId).filter(ativo).toArray()).sort(porConclusao);
  },

  /** Quantidade de séries ativas por sessão (duração estimada). */
  async contagemPorSessao(): Promise<Map<string, number>> {
    const m = new Map<string, number>();
    await db.exerciseSets.filter(ativo).each((s) => void m.set(s.sessionId, (m.get(s.sessionId) ?? 0) + 1));
    return m;
  },

  /** Séries ativas agrupadas por sessão, em ordem de conclusão (lista do Histórico). */
  async porSessao(): Promise<Map<string, ExerciseSet[]>> {
    const m = new Map<string, ExerciseSet[]>();
    for (const s of (await db.exerciseSets.filter(ativo).toArray()).sort(porConclusao)) m.set(s.sessionId, [...(m.get(s.sessionId) ?? []), s]);
    return m;
  },

  /** Corrige carga e reps de uma série já gravada, validada pelo tipo e unidade do planSnapshot da sessão. */
  editar(id: string, carga: number | null, reps: number): Promise<ExerciseSet> {
    return db.transaction('rw', db.exerciseSets, db.workoutSessions, async () => {
      const set = await base.get(id);
      if (!set) throw new Error('Série não encontrada');
      const item = (await db.workoutSessions.get(set.sessionId))?.planSnapshot.itens.find((i) => i.exerciseId === set.exerciseId);
      if (!item) throw new Error('Exercício fora deste treino');
      const msg = validarSerie(item, carga, reps);
      if (msg) throw new Error(msg);
      return base.update(id, { carga, reps });
    });
  },

  /** Soft delete de uma série e renumeração (1, 2, 3…) das restantes do mesmo exercício na sessão. */
  excluir(id: string): Promise<void> {
    return db.transaction('rw', db.exerciseSets, async () => {
      const set = await base.get(id);
      if (!set) return;
      await base.remove(id);
      const restantes = (await exerciseSetsRepository.listarDaSessao(set.sessionId)).filter((s) => s.exerciseId === set.exerciseId);
      await Promise.all(
        restantes.map((s, k) => (s.numeroSerie === k + 1 ? undefined : db.exerciseSets.put({ ...s, numeroSerie: k + 1, updatedAt: now() }))),
      );
    });
  },

  /** Série mais recente do exercício em qualquer sessão (carga sugerida = última registrada). */
  async ultimaDoExercicio(exerciseId: string): Promise<ExerciseSet | undefined> {
    return (await db.exerciseSets.where('exerciseId').equals(exerciseId).filter(ativo).toArray()).sort(porConclusao).at(-1);
  },

  /** Grava a próxima série do exercício na sessão (numeroSerie = feitas + 1), na mesma transação. */
  registrar(dados: Pick<ExerciseSet, 'sessionId' | 'exerciseId' | 'carga' | 'reps'>): Promise<ExerciseSet> {
    return db.transaction('rw', db.exerciseSets, async () => {
      const feitas = await db.exerciseSets
        .where('sessionId').equals(dados.sessionId)
        .filter((s) => ativo(s) && s.exerciseId === dados.exerciseId)
        .count();
      return base.create({ ...dados, numeroSerie: feitas + 1, lado: null, concluidaEm: new Date().toISOString() });
    });
  },

  /** Soft delete da série mais recente do exercício na sessão. */
  async desfazerUltima(sessionId: string, exerciseId: string): Promise<ExerciseSet | undefined> {
    const ultima = (await exerciseSetsRepository.listarDaSessao(sessionId)).filter((s) => s.exerciseId === exerciseId).at(-1);
    if (ultima) await base.remove(ultima.id);
    return ultima;
  },
};
