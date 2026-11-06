import { db } from '../db';
import type { BodyPhoto } from '../types';
import { createRepository } from './base';

export const bodyPhotosRepository = createRepository<BodyPhoto>(db.bodyPhotos);
