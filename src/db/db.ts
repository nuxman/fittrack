import Dexie, { type Table } from 'dexie';
import type {
  BodyMeasurement, BodyPhoto, CardioSession, Equipment, Exercise, ExerciseImage,
  ExerciseSet, RestDay, UserSettings, WorkoutPlan, WorkoutSession,
} from './types';

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

  constructor() {
    super('fittrack');
    this.version(1).stores({
      equipment: 'id, nome',
      exercises: 'id, nome, equipmentId',
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
  }
}

export const db = new FitTrackDB();
