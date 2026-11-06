import { db } from './db';
import { exercisesRepository } from './repositories/exercises';
import { settingsRepository } from './repositories/settings';
import { workoutPlansRepository } from './repositories/workoutPlans';
import type { NewRecord, Exercise, WorkoutPlanItem } from './types';

type Ex = Pick<Exercise, 'nome' | 'gruposMusculares'> & Partial<Pick<Exercise, 'tipo' | 'porLado'>>;
type Linha = [ex: Ex, series: number, repsMin: number, repsMax: number];

const corpo = { tipo: 'peso_corporal', porLado: true } as const;

const FICHA: { nome: string; diaSemana: number; itens: Linha[] }[] = [
  { nome: 'Peito e tríceps', diaSemana: 1, itens: [
    [{ nome: 'Supino máquina', gruposMusculares: ['peito', 'tríceps'] }, 3, 10, 12],
    [{ nome: 'Supino inclinado articulado', gruposMusculares: ['peito', 'ombros'] }, 3, 10, 12],
    [{ nome: 'Crucifixo máquina', gruposMusculares: ['peito'] }, 2, 12, 15],
    [{ nome: 'Tríceps polia barra reta', gruposMusculares: ['tríceps'] }, 3, 10, 15],
    [{ nome: 'Tríceps corda', gruposMusculares: ['tríceps'] }, 2, 12, 15],
  ] },
  { nome: 'Pernas A e abdômen', diaSemana: 2, itens: [
    [{ nome: 'Leg press', gruposMusculares: ['quadríceps', 'glúteos'] }, 3, 10, 12],
    [{ nome: 'Cadeira extensora', gruposMusculares: ['quadríceps'] }, 3, 12, 15],
    [{ nome: 'Cadeira flexora', gruposMusculares: ['posterior de coxa'] }, 3, 10, 15],
    [{ nome: 'Panturrilha máquina', gruposMusculares: ['panturrilha'] }, 3, 12, 15],
    [{ nome: 'Abdominal máquina', gruposMusculares: ['abdômen'] }, 2, 12, 15],
  ] },
  { nome: 'Costas e bíceps', diaSemana: 3, itens: [
    [{ nome: 'Puxada frontal', gruposMusculares: ['costas', 'bíceps'] }, 3, 10, 12],
    [{ nome: 'Remada baixa', gruposMusculares: ['costas'] }, 3, 10, 12],
    [{ nome: 'Remada com apoio no peito', gruposMusculares: ['costas'] }, 2, 12, 12],
    [{ nome: 'Rosca martelo', gruposMusculares: ['bíceps', 'antebraço'] }, 3, 10, 12],
    [{ nome: 'Rosca barra W', gruposMusculares: ['bíceps'] }, 2, 12, 12],
  ] },
  { nome: 'Ombros e core', diaSemana: 4, itens: [
    [{ nome: 'Desenvolvimento máquina', gruposMusculares: ['ombros', 'tríceps'] }, 3, 10, 12],
    [{ nome: 'Elevação lateral', gruposMusculares: ['ombros'] }, 3, 12, 15],
    [{ nome: 'Crucifixo inverso', gruposMusculares: ['ombros', 'costas'] }, 3, 12, 15],
    [{ nome: 'Bird dog', gruposMusculares: ['core'], ...corpo }, 2, 10, 10],
    [{ nome: 'Dead bug', gruposMusculares: ['core'], ...corpo }, 2, 10, 10],
  ] },
  { nome: 'Pernas B e corpo inteiro', diaSemana: 5, itens: [
    [{ nome: 'Cadeira flexora', gruposMusculares: ['posterior de coxa'] }, 3, 10, 12],
    [{ nome: 'Leg press', gruposMusculares: ['quadríceps', 'glúteos'] }, 3, 12, 12],
    [{ nome: 'Cadeira abdutora', gruposMusculares: ['glúteos'] }, 2, 12, 15],
    [{ nome: 'Supino máquina', gruposMusculares: ['peito', 'tríceps'] }, 2, 12, 12],
    [{ nome: 'Remada com apoio no peito', gruposMusculares: ['costas'] }, 2, 12, 12],
  ] },
];

/** Carrega a ficha inicial apenas em banco vazio (nunca recria o que o usuário apagou). */
export async function seedIfEmpty(): Promise<boolean> {
  return db.transaction('rw', db.exercises, db.workoutPlans, db.settings, async () => {
    if ((await db.exercises.count()) > 0 || (await db.workoutPlans.count()) > 0) return false;

    const { descansoPadraoSeg } = await settingsRepository.get();

    for (const dia of FICHA) {
      const itens: WorkoutPlanItem[] = [];
      for (const [ex, series, repsMin, repsMax] of dia.itens) {
        const existente = await exercisesRepository.findByName(ex.nome);
        const novo: NewRecord<Exercise> = {
          tipo: 'carga', unidadeCarga: 'kg', porLado: false, ...ex,
        };
        const exercise = existente ?? (await exercisesRepository.create(novo));
        itens.push({ exerciseId: exercise.id, series, repsMin, repsMax, descansoSeg: descansoPadraoSeg, ordem: itens.length });
      }
      await workoutPlansRepository.create({ nome: dia.nome, diaSemana: dia.diaSemana, itens });
    }
    return true;
  });
}
