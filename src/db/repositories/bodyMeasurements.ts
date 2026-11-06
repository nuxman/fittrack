import { db } from '../db';
import type { BodyMeasurement } from '../types';
import { createRepository } from './base';

export const bodyMeasurementsRepository = createRepository<BodyMeasurement>(db.bodyMeasurements);
