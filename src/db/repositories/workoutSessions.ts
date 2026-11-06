import { db } from '../db';
import type { WorkoutSession } from '../types';
import { createRepository } from './base';

export const workoutSessionsRepository = createRepository<WorkoutSession>(db.workoutSessions);
