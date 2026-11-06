import { db } from '../db';
import type { Equipment } from '../types';
import { createRepository } from './base';

export const equipmentRepository = createRepository<Equipment>(db.equipment);
