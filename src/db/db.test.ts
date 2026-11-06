import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { equipmentRepository } from './repositories/equipment';
import { exercisesRepository } from './repositories/exercises';
import { settingsRepository } from './repositories/settings';
import { workoutPlansRepository } from './repositories/workoutPlans';
import { seedIfEmpty } from './seed';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('repositório (CRUD + soft delete)', () => {
  it('cria com id, createdAt, updatedAt e deletedAt null', async () => {
    const e = await equipmentRepository.create({ nome: 'Leg press 45°', observacoes: '' });
    expect(e.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(e.createdAt).toBe(e.updatedAt);
    expect(e.deletedAt).toBeNull();
    expect(await equipmentRepository.get(e.id)).toEqual(e);
  });

  it('atualiza mudando updatedAt e preservando createdAt', async () => {
    const e = await equipmentRepository.create({ nome: 'A', observacoes: '' });
    await new Promise((r) => setTimeout(r, 2));
    const u = await equipmentRepository.update(e.id, { nome: 'B' });
    expect(u.nome).toBe('B');
    expect(u.createdAt).toBe(e.createdAt);
    expect(u.updatedAt > e.updatedAt).toBe(true);
    expect((await equipmentRepository.get(e.id))?.nome).toBe('B');
  });

  it('soft delete esconde da listagem mas mantém no banco', async () => {
    const a = await equipmentRepository.create({ nome: 'A', observacoes: '' });
    const b = await equipmentRepository.create({ nome: 'B', observacoes: '' });
    await equipmentRepository.remove(a.id);

    expect((await equipmentRepository.list()).map((x) => x.id)).toEqual([b.id]);
    expect(await equipmentRepository.get(a.id)).toBeUndefined();
    const raw = await db.equipment.get(a.id);
    expect(raw?.deletedAt).not.toBeNull();
    await expect(equipmentRepository.update(a.id, { nome: 'X' })).rejects.toThrow();
  });

  it('valida videoUrl: só https://', async () => {
    const base = { nome: 'Teste', tipo: 'carga' as const, unidadeCarga: 'kg' as const, gruposMusculares: [], porLado: false };
    await expect(exercisesRepository.create({ ...base, videoUrl: 'http://x.com' })).rejects.toThrow();
    await expect(exercisesRepository.create({ ...base, videoUrl: 'javascript:alert(1)' })).rejects.toThrow();
    const ok = await exercisesRepository.create({ ...base, videoUrl: 'https://qualquer.dominio/v' });
    expect(ok.videoUrl).toBe('https://qualquer.dominio/v');
    await expect(exercisesRepository.update(ok.id, { videoUrl: 'ftp://x' })).rejects.toThrow();
  });

  it('settings é registro único com padrões', async () => {
    const s1 = await settingsRepository.get();
    const s2 = await settingsRepository.get();
    expect(s1.id).toBe(s2.id);
    expect(s1.cardioPadrao.inclinacaoNivel).toEqual({ valor: 7, rotulo: 'nível 7' });
    expect((await settingsRepository.update({ descansoPadraoSeg: 60 })).descansoPadraoSeg).toBe(60);
  });
});

describe('seed', () => {
  it('carrega a ficha de segunda a sexta', async () => {
    expect(await seedIfEmpty()).toBe(true);
    const planos = (await workoutPlansRepository.list()).sort((a, b) => a.diaSemana - b.diaSemana);
    expect(planos.map((p) => p.diaSemana)).toEqual([1, 2, 3, 4, 5]);
    expect(planos.every((p) => p.itens.length === 5)).toBe(true);
    expect(planos[0]!.nome).toBe('Peito e tríceps');
  });

  it('exercícios repetidos entre dias são o mesmo Exercise', async () => {
    await seedIfEmpty();
    const exercicios = await exercisesRepository.list();
    expect(exercicios).toHaveLength(21); // 25 itens − 4 repetidos (flexora, leg press, supino máquina, remada c/ apoio)
    const remada = exercicios.filter((e) => e.nome === 'Remada com apoio no peito');
    expect(remada).toHaveLength(1);
    const planos = await workoutPlansRepository.list();
    const usos = planos.flatMap((p) => p.itens).filter((i) => i.exerciseId === remada[0]!.id);
    expect(usos).toHaveLength(2);
    expect(exercicios.every((e) => e.videoUrl === undefined)).toBe(true);
  });

  it('peso corporal e por lado em Bird dog / Dead bug', async () => {
    await seedIfEmpty();
    const bird = await exercisesRepository.findByName('bird dog');
    expect(bird).toMatchObject({ tipo: 'peso_corporal', porLado: true });
  });

  it('não roda duas vezes', async () => {
    await seedIfEmpty();
    expect(await seedIfEmpty()).toBe(false);
    expect(await workoutPlansRepository.list()).toHaveLength(5);
  });
});
