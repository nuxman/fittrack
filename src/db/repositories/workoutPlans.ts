import { db } from '../db';
import type { WorkoutPlan } from '../types';
import { createRepository } from './base';

export const workoutPlansRepository = createRepository<WorkoutPlan>(db.workoutPlans);
