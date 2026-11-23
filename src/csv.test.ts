import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { campo, csvMedidas, montarCsv } from './csv';
import { db } from './db/db';
import { backupRepository } from './db/repositories/backup';
import { workoutPlansRepository } from './db/repositories/workoutPlans';
import { workoutSessionsRepository as sessoes } from './db/repositories/workoutSessions';
import { exerciseSetsRepository as series } from './db/repositories/exerciseSets';
import { exercisesRepository } from './db/repositories/exercises';
import { bodyMeasurementsRepository as medidas } from './db/repositories/bodyMeasurements';

const BOM = '﻿';
const linhas = (csv: string) => csv.slice(1).split('\r\n').filter(Boolean);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 0, 14, 18, 30));
  await db.delete();
  await db.open();
});
afterEach(() => vi.useRealTimers());

describe('CSV', () => {
  it('escapa ";", aspas e quebras de linha; vírgula decimal; BOM e CRLF', () => {
    expect(campo('simples')).toBe('simples');
    expect(campo('a;b')).toBe('"a;b"');
    expect(campo('disse "oi"')).toBe('"disse ""oi"""');
    expect(campo('linha 1\nlinha 2')).toBe('"linha 1\nlinha 2"');
    expect(campo(82.5)).toBe('82,5');
    expect(campo(null)).toBe('');
    const csv = montarCsv(['a', 'b'], [[1.5, 'x;y']]);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv).toBe(`${BOM}a;b\r\n1,5;"x;y"\r\n`);
  });

  it('medidas: da mais antiga para a mais recente, vazio sem o dado, observação escapada', () => {
    const m = (data: string, pesoKg: number | null, cinturaCm: number | null, observacoes: string) =>
      ({ id: data, data, pesoKg, cinturaCm, observacoes, createdAt: `${data}T10:00:00Z`, updatedAt: '', deletedAt: null });
    expect(linhas(csvMedidas([m('2026-01-14', 84.2, null, 'após "jejum"; manhã'), m('2026-01-07', 85, 92.5, '')]))).toEqual([
      'data;peso (kg);cintura (cm);observações',
      '2026-01-07;85;92,5;',
      '2026-01-14;84,2;;"após ""jejum""; manhã"',
    ]);
  });

  it('séries: nomes do planSnapshot (mesmo depois de renomear), unidade, por lado, status; ativos e excluídos fora', async () => {
    const ficha = (await workoutPlansRepository.list()).find((p) => p.diaSemana === 4)!; // Ombros e core: tem Bird dog (por lado)
    const s = await sessoes.iniciar(ficha.id);
    const [dev, , , bird] = s.planSnapshot.itens.sort((a, b) => a.ordem - b.ordem);
    await series.registrar({ sessionId: s.id, exerciseId: dev!.exerciseId, carga: 22.5, reps: 10 });
    const errada = await series.registrar({ sessionId: s.id, exerciseId: dev!.exerciseId, carga: 25, reps: 8 });
    await series.registrar({ sessionId: s.id, exerciseId: bird!.exerciseId, carga: null, reps: 10 });
    await series.excluir(errada.id);
    await sessoes.finalizar(s.id, { rpe: 7, observacoes: '' });
    await exercisesRepository.update(dev!.exerciseId, { nome: 'Desenvolvimento renomeado' });
    // Treino em andamento não entra.
    const ativa = await sessoes.iniciar(ficha.id);
    await series.registrar({ sessionId: ativa.id, exerciseId: dev!.exerciseId, carga: 30, reps: 10 });

    expect(linhas(await backupRepository.csvSeries())).toEqual([
      'data;ficha;exercício;série;carga;unidade;reps;por lado;lado;status do treino',
      '2026-01-14 18:30;Ombros e core;Desenvolvimento máquina;1;22,5;kg;10;não;;concluído',
      '2026-01-14 18:30;Ombros e core;Bird dog;1;;peso corporal;10;sim;;concluído',
    ]);
  });

  it('medidas pelo repositório: excluídas ficam fora', async () => {
    await medidas.registrar({ data: '2026-01-10', pesoKg: 85, cinturaCm: null, observacoes: '' });
    const x = await medidas.registrar({ data: '2026-01-12', pesoKg: 84, cinturaCm: null, observacoes: '' });
    await medidas.excluir(x.id);
    expect(linhas(await backupRepository.csvMedidas())).toEqual(['data;peso (kg);cintura (cm);observações', '2026-01-10;85;;']);
  });
});
