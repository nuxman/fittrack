import { db } from '../db';
import type { ExerciseSet } from '../types';
import { createRepository } from './base';

export const exerciseSetsRepository = createRepository<ExerciseSet>(db.exerciseSets);
