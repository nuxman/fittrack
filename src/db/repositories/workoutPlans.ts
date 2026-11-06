import { db } from '../db';
import type { Exercise, NewRecord, WorkoutPlan, WorkoutPlanItem } from '../types';
import { createRepository } from './base';
import { DIAS } from '../../dias';

type DadosFicha = Pick<WorkoutPlan, 'nome' | 'diaSemana' | 'itens'>;
type Faixa = readonly [min: number, max: number];

export const LIMITES = {
  series: [1, 10],
  reps: [1, 100],
  tempoSeg: [1, 600],
  descansoSeg: [0, 600],
} as const satisfies Record<string, Faixa>;

const fora = (v: number, [min, max]: Faixa) => !Number.isInteger(v) || v < min || v > max;

/** Faixa de repsMin/repsMax: para tipo 'tempo' são segundos. */
export const faixaReps = (tipo: Exercise['tipo']) => (tipo === 'tempo' ? LIMITES.tempoSeg : LIMITES.reps);

/** Lista de erros legíveis (vazia = ficha válida). */
export function validarFicha(
  f: DadosFicha,
  exercicio: (id: string) => Pick<Exercise, 'nome' | 'tipo'> | undefined,
): string[] {
  const erros: string[] = [];
  if (!f.nome.trim()) erros.push('Informe o nome da ficha');
  if (fora(f.diaSemana, [0, 6])) erros.push('Dia da semana inválido');
  f.itens.forEach((it, i) => {
    const ex = exercicio(it.exerciseId);
    if (!ex) {
      erros.push(`Item ${i + 1}: exercício não encontrado`);
      return;
    }
    const reps = faixaReps(ex.tipo);
    const un = ex.tipo === 'tempo' ? 'segundos' : 'repetições';
    if (fora(it.series, LIMITES.series)) erros.push(`${ex.nome}: séries entre 1 e 10`);
    if (fora(it.repsMin, reps) || fora(it.repsMax, reps)) erros.push(`${ex.nome}: ${un} entre ${reps[0]} e ${reps[1]}`);
    else if (it.repsMin > it.repsMax) erros.push(`${ex.nome}: mínimo maior que o máximo`);
    if (fora(it.descansoSeg, LIMITES.descansoSeg)) erros.push(`${ex.nome}: descanso entre 0 e 600 s`);
  });
  return erros;
}

/** Troca o item com o vizinho; fora dos limites devolve a mesma lista. */
export function moverItem<T>(itens: T[], i: number, delta: -1 | 1): T[] {
  const j = i + delta;
  if (i < 0 || j < 0 || i >= itens.length || j >= itens.length) return itens;
  const r = [...itens];
  [r[i], r[j]] = [r[j]!, r[i]!];
  return r;
}

export const ordenarItens = (itens: WorkoutPlanItem[]) => [...itens].sort((a, b) => a.ordem - b.ordem);

/** A posição no array define a ordem. */
const renumerar = (itens: WorkoutPlanItem[]) => itens.map((it, ordem) => ({ ...it, ordem }));

export class FichaInvalidaError extends Error {
  constructor(readonly erros: string[]) {
    super(erros.join('\n'));
  }
}

export class DiaOcupadoError extends Error {
  constructor(readonly ocupante: WorkoutPlan) {
    super(`${DIAS[ocupante.diaSemana]} já tem a ficha "${ocupante.nome}"`);
  }
}

const base = createRepository<WorkoutPlan>(db.workoutPlans);

async function validar(f: DadosFicha) {
  const ativos = new Map((await db.exercises.filter((e) => e.deletedAt === null).toArray()).map((e) => [e.id, e]));
  const erros = validarFicha(f, (id) => ativos.get(id));
  if (erros.length) throw new FichaInvalidaError(erros);
}

async function ocupanteDoDia(dia: number, ignorarId?: string) {
  return (await base.list()).find((p) => p.diaSemana === dia && p.id !== ignorarId);
}

export const workoutPlansRepository = {
  list: base.list,
  get: base.get,
  remove: base.remove,
  ocupanteDoDia,

  async create(data: NewRecord<WorkoutPlan>): Promise<WorkoutPlan> {
    return db.transaction('rw', db.workoutPlans, db.exercises, async () => {
      await validar(data);
      const ocupante = await ocupanteDoDia(data.diaSemana);
      if (ocupante) throw new DiaOcupadoError(ocupante);
      return base.create({ ...data, nome: data.nome.trim(), itens: renumerar(data.itens) });
    });
  },

  /** Dia ocupado: exige trocarDia=true, e então as duas fichas trocam de dia na mesma transação. */
  async update(id: string, changes: Partial<DadosFicha>, { trocarDia = false } = {}): Promise<WorkoutPlan> {
    return db.transaction('rw', db.workoutPlans, db.exercises, async () => {
      const atual = await base.get(id);
      if (!atual) throw new Error('Ficha não encontrada');
      const next = { ...atual, ...changes };
      await validar(next);
      const ocupante = await ocupanteDoDia(next.diaSemana, id);
      if (ocupante) {
        if (!trocarDia) throw new DiaOcupadoError(ocupante);
        await base.update(ocupante.id, { diaSemana: atual.diaSemana });
      }
      return base.update(id, { nome: next.nome.trim(), diaSemana: next.diaSemana, itens: renumerar(next.itens) });
    });
  },
};
