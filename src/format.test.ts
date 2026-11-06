import { expect, it } from 'vitest';
import { formatarPrescricao } from './format';

it('formata séries/reps com "por lado" e segundos', () => {
  const carga = { tipo: 'carga', porLado: false } as const;
  expect(formatarPrescricao({ series: 3, repsMin: 10, repsMax: 12 }, carga)).toBe('3×10–12');
  expect(formatarPrescricao({ series: 2, repsMin: 12, repsMax: 12 }, carga)).toBe('2×12');
  expect(formatarPrescricao({ series: 2, repsMin: 10, repsMax: 10 }, { tipo: 'peso_corporal', porLado: true })).toBe('2×10 por lado');
  expect(formatarPrescricao({ series: 3, repsMin: 30, repsMax: 45 }, { tipo: 'tempo', porLado: false })).toBe('3×30–45 s');
  expect(formatarPrescricao({ series: 2, repsMin: 20, repsMax: 20 }, { tipo: 'tempo', porLado: true })).toBe('2×20 s por lado');
});
