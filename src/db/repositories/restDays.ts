import { db } from '../db';
import type { RestDay } from '../types';
import { createRepository } from './base';

export const restDaysRepository = createRepository<RestDay>(db.restDays);
