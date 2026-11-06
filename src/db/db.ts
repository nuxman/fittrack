import Dexie, { type Table } from 'dexie';
import type {
  BodyMeasurement, BodyPhoto, CardioSession, Equipment, Exercise, ExerciseImage,
  ExerciseSet, RestDay, UserSettings, WorkoutPlan, WorkoutSession,
} from './types';
import { buildSeed } from './seed';

export class FitTrackDB extends Dexie {
  equipment!: Table<Equipment, string>;
  exercises!: Table<Exercise, string>;
  exerciseImages!: Table<ExerciseImage, string>;
  workoutPlans!: Table<WorkoutPlan, string>;
  workoutSessions!: Table<WorkoutSession, string>;
  exerciseSets!: Table<ExerciseSet, string>;
  cardioSessions!: Table<CardioSession, string>;
  bodyMeasurements!: Table<BodyMeasurement, string>;
  bodyPhotos!: Table<BodyPhoto, string>;
  restDays!: Table<RestDay, string>;
  settings!: Table<UserSettings, string>;

  constructor(name = 'fittrack') {
    super(name);
    // deletedAt não é indexado: IndexedDB ignora null em índices; o filtro é feito em base.ts.
    this.version(1).stores({
      equipment: 'id, nome',
      exercises: 'id, nome, grupoPrincipal, equipmentId',
      exerciseImages: 'id, exerciseId',
      workoutPlans: 'id, diaSemana',
      workoutSessions: 'id, planId, status, iniciadaEm',
      exerciseSets: 'id, sessionId, exerciseId, concluidaEm',
      cardioSessions: 'id, data',
      bodyMeasurements: 'id, data',
      bodyPhotos: 'id, measurementId',
      restDays: 'id, data',
      settings: 'id',
    });
    // Roda só na criação do banco, dentro da transação de upgrade: atômico,
    // aberturas concorrentes (outras abas/instâncias) não duplicam a ficha.
    this.on('populate', async (tx) => {
      const seed = buildSeed();
      await tx.table('exercises').bulkAdd(seed.exercises);
      await tx.table('workoutPlans').bulkAdd(seed.workoutPlans);
      await tx.table('settings').add(seed.settings);
    });
  }
}

export const db = new FitTrackDB();
