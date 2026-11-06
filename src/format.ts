import type { Exercise, WorkoutPlanItem } from './db/types';

/** "3×10–12", "2×10 por lado", "3×30 s" (tipo 'tempo': reps são segundos). */
export function formatarPrescricao(
  item: Pick<WorkoutPlanItem, 'series' | 'repsMin' | 'repsMax'>,
  ex: Pick<Exercise, 'tipo' | 'porLado'> | undefined,
): string {
  const reps = item.repsMin === item.repsMax ? `${item.repsMin}` : `${item.repsMin}–${item.repsMax}`;
  return `${item.series}×${reps}${ex?.tipo === 'tempo' ? ' s' : ''}${ex?.porLado ? ' por lado' : ''}`;
}
