import { db } from '../db';
import type { CardioSession } from '../types';
import { createRepository } from './base';

export const cardioSessionsRepository = createRepository<CardioSession>(db.cardioSessions);
