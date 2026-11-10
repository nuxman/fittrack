import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, FitTrackDB } from './db';
import { normalizeNome } from './normalize';
import { buildSeed, linkDeBusca } from './seed';
import { equipmentRepository } from './repositories/equipment';
import { exercisesRepository } from './repositories/exercises';
import { settingsRepository } from './repositories/settings';
import { workoutPlansRepository } from './repositories/workoutPlans';

beforeEach(async () => {
  await db.delete();
  await db.open(); // dispara o populate (ficha inicial)
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

  it('itens excluídos não aparecem em list() nem get(), mas continuam no banco', async () => {
    const a = await equipmentRepository.create({ nome: 'A', observacoes: '' });
    const b = await equipmentRepository.create({ nome: 'B', observacoes: '' });
    await equipmentRepository.remove(a.id);

    expect((await equipmentRepository.list()).map((x) => x.id)).toEqual([b.id]);
    expect(await equipmentRepository.get(a.id)).toBeUndefined();
    const raw = await db.equipment.get(a.id);
    expect(raw?.deletedAt).toEqual(expect.any(String));
    expect(await db.equipment.count()).toBe(2);
    await expect(equipmentRepository.update(a.id, { nome: 'X' })).rejects.toThrow();
  });

  it('exercício excluído some da listagem e do findByName', async () => {
    const remada = (await exercisesRepository.findByName('Remada baixa'))!;
    const quarta = (await workoutPlansRepository.list()).find((p) => p.diaSemana === 3)!;
    await workoutPlansRepository.update(quarta.id, { itens: quarta.itens.filter((i) => i.exerciseId !== remada.id) });
    await exercisesRepository.remove(remada.id);
    expect((await exercisesRepository.list()).some((e) => e.id === remada.id)).toBe(false);
    expect(await exercisesRepository.findByName('Remada baixa')).toBeUndefined();
  });

  it('valida videoUrl: só https://', async () => {
    const base = {
      nome: 'Teste', tipo: 'carga' as const, unidadeCarga: 'kg' as const,
      grupoPrincipal: 'peito' as const, gruposSecundarios: [], porLado: false,
    };
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
    expect(await db.settings.count()).toBe(1);
    expect(s1.cardioPadrao.inclinacaoNivel).toEqual({ valor: 7, rotulo: 'nível 7' });
    expect((await settingsRepository.update({ descansoPadraoSeg: 60 })).descansoPadraoSeg).toBe(60);
  });
});

describe('findByName', () => {
  it('normaliza espaços, maiúsculas e acentos', () => {
    expect(normalizeNome('  Remada   COM apóio no PEITO ')).toBe('remada com apoio no peito');
    expect(normalizeNome('Elevação lateral')).toBe(normalizeNome('elevacao LATERAL'));
  });

  it('encontra o mesmo exercício por variações do nome', async () => {
    const alvo = (await exercisesRepository.findByName('Remada com apoio no peito'))!;
    for (const variante of ['  remada com apoio no peito  ', 'REMADA COM APOIO NO PEITO', 'Remada  com apóio no peito']) {
      expect((await exercisesRepository.findByName(variante))?.id).toBe(alvo.id);
    }
    expect((await exercisesRepository.findByName('elevacao lateral'))?.nome).toBe('Elevação lateral');
    expect(await exercisesRepository.findByName('Remada')).toBeUndefined();
  });
});

describe('seed (populate)', () => {
  it('carrega a ficha de segunda a sexta', async () => {
    const planos = (await workoutPlansRepository.list()).sort((a, b) => a.diaSemana - b.diaSemana);
    expect(planos.map((p) => p.diaSemana)).toEqual([1, 2, 3, 4, 5]);
    expect(planos.every((p) => p.itens.length === 5)).toBe(true);
    expect(planos[0]!.nome).toBe('Peito e tríceps');
  });

  it('exercícios repetidos entre dias são o mesmo Exercise', async () => {
    const exercicios = await exercisesRepository.list();
    expect(exercicios).toHaveLength(21); // 25 itens − 4 repetidos (flexora, leg press, supino máquina, remada c/ apoio)
    const remada = exercicios.filter((e) => e.nome === 'Remada com apoio no peito');
    expect(remada).toHaveLength(1);
    const usos = (await workoutPlansRepository.list()).flatMap((p) => p.itens).filter((i) => i.exerciseId === remada[0]!.id);
    expect(usos).toHaveLength(2);
    expect(exercicios.every((e) => e.grupoPrincipal.length > 0)).toBe(true);
  });

  it('peso corporal e por lado em Bird dog / Dead bug', async () => {
    expect(await exercisesRepository.findByName('bird dog')).toMatchObject({ tipo: 'peso_corporal', porLado: true, grupoPrincipal: 'core' });
  });

  it('não repopula ao reabrir, mesmo após o usuário excluir tudo', async () => {
    for (const p of await workoutPlansRepository.list()) await workoutPlansRepository.remove(p.id);
    db.close();
    await db.open();
    expect(await workoutPlansRepository.list()).toHaveLength(0);
  });

  it('duas aberturas em paralelo não duplicam a ficha', async () => {
    const nome = `fittrack-paralelo-${crypto.randomUUID()}`;
    const a = new FitTrackDB(nome);
    const b = new FitTrackDB(nome);
    await Promise.all([a.open(), b.open()]);
    expect(await a.workoutPlans.count()).toBe(5);
    expect(await b.exercises.count()).toBe(21);
    expect(await b.settings.count()).toBe(1);
    a.close();
    b.close();
    await Dexie.delete(nome);
  });
});


describe('migração v2: links de busca no YouTube', () => {
  const V1 = {
    equipment: 'id, nome', exercises: 'id, nome, grupoPrincipal, equipmentId', exerciseImages: 'id, exerciseId',
    workoutPlans: 'id, diaSemana', workoutSessions: 'id, planId, status, iniciadaEm', exerciseSets: 'id, sessionId, exerciseId, concluidaEm',
    cardioSessions: 'id, data', bodyMeasurements: 'id, data', bodyPhotos: 'id, measurementId', restDays: 'id, data', settings: 'id',
  };

  it('banco novo já vem com os links', async () => {
    const supino = (await exercisesRepository.findByName('Supino máquina'))!;
    expect(supino.videoUrl).toBe('https://www.youtube.com/results?search_query=como%20fazer%20Supino%20m%C3%A1quina');
    expect((await exercisesRepository.list()).every((e) => e.videoUrl === linkDeBusca(e.nome))).toBe(true);
  });

  it('banco v1 recebe os links; link existente e exercício fora do seed não mudam', async () => {
    const nome = `fittrack-v1-${crypto.randomUUID()}`;
    const antigo = new Dexie(nome);
    antigo.version(1).stores(V1);
    const seed = buildSeed();
    const semLink = seed.exercises.map((e) => {
      const copia = { ...e };
      delete copia.videoUrl;
      return copia;
    });
    const leg = semLink.find((e) => e.nome === 'Leg press')!;
    const proprio = { ...semLink.find((e) => e.nome === 'Rosca martelo')!, videoUrl: 'https://exemplo.com/rosca' };
    const extra = { ...leg, id: crypto.randomUUID(), nome: 'Pullover' };
    await antigo.table('exercises').bulkAdd([...semLink.filter((e) => e !== leg && e.nome !== 'Rosca martelo'), leg, proprio, extra]);
    antigo.close();

    const novo = new FitTrackDB(nome);
    await novo.open();
    expect(novo.verno).toBe(2);
    const porNome = new Map((await novo.exercises.toArray()).map((e) => [e.nome, e]));
    expect(porNome.get('Leg press')!.videoUrl).toBe(linkDeBusca('Leg press'));
    expect(porNome.get('Rosca martelo')!.videoUrl).toBe('https://exemplo.com/rosca');
    expect(porNome.get('Pullover')!.videoUrl).toBeUndefined();
    expect([...porNome.values()].filter((e) => e.videoUrl === undefined)).toHaveLength(1);
    // Migração não dispara o populate: nenhuma ficha criada.
    expect(await novo.workoutPlans.count()).toBe(0);
    novo.close();
    await Dexie.delete(nome);
  });
});
