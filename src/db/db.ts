import Dexie, { type Table } from 'dexie';
import type {
  BodyMeasurement, BodyPhoto, CardioSession, Equipment, Exercise, ExerciseImage,
  ExerciseSet, RestDay, UserSettings, WorkoutPlan, WorkoutSession,
} from './types';
import { buildSeed, LINKS_DO_SEED } from './seed';
import { normalizeNome } from './normalize';
import { gerarDemo } from './demo';
import { BANCO_DEMO, BANCO_REAL, nomeDoBanco } from '../modo';

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

  constructor(name = BANCO_REAL) {
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
    // v2: links de busca no YouTube para os exercícios da ficha inicial que ainda não têm link.
    // Banco novo não passa por aqui (o populate já cria com link).
    this.version(2).stores({}).upgrade((tx) =>
      tx.table<Exercise, string>('exercises').toCollection().modify((e) => {
        const link = LINKS_DO_SEED.get(normalizeNome(e.nome));
        if (link && !e.videoUrl) e.videoUrl = link;
      }),
    );
    // Roda só na criação do banco, dentro da transação de upgrade: atômico,
    // aberturas concorrentes (outras abas/instâncias) não duplicam a ficha.
    this.on('populate', async (tx) => {
      const seed = buildSeed();
      await tx.table('exercises').bulkAdd(seed.exercises);
      await tx.table('workoutPlans').bulkAdd(seed.workoutPlans);
      await tx.table('settings').add(seed.settings);
      // Banco de demonstração: também ~4 semanas de treinos fictícios (o banco real nunca passa por aqui).
      if (this.name === BANCO_DEMO) {
        const demo = gerarDemo(seed.exercises, seed.workoutPlans);
        await tx.table('workoutSessions').bulkAdd(demo.sessions);
        await tx.table('exerciseSets').bulkAdd(demo.sets);
        await tx.table('cardioSessions').bulkAdd(demo.cardio);
        await tx.table('bodyMeasurements').bulkAdd(demo.medidas);
        await tx.table('equipment').bulkAdd(demo.aparelhos);
        for (const [exerciseId, equipmentId] of demo.ligacoes) await tx.table('exercises').update(exerciseId, { equipmentId });
        // Meta de peso de exemplo (Configurações), para o bloco de peso do Início mostrar "faltam X kg".
        await tx.table('settings').update(seed.settings.id, { metaPesoKg: 80, metaDirecao: 'perder' });
      }
    });
  }
}

/** Erro de banco fechado de propósito (ex.: recomeçar a demonstração, que recarrega a página em seguida). */
export const bancoFechado = (e: unknown) => e instanceof Dexie.DatabaseClosedError;

/** Banco desta abertura do app: o real ou o de demonstração (ver modo.ts). */
export const db = new FitTrackDB(nomeDoBanco());
