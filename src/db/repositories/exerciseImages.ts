import { db } from '../db';
import type { ExerciseImage } from '../types';
import { createRepository } from './base';

export const exerciseImagesRepository = createRepository<ExerciseImage>(db.exerciseImages);
