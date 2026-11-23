import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, SCHEMA_VERSAO } from './db';
import { backupRepository, BackupInvalidoError, validarBackup } from './repositories/backup';
import { exercisesRepository } from './repositories/exercises';
import { exerciseImagesRepository } from './repositories/exerciseImages';
import { equipmentRepository } from './repositories/equipment';
import { workoutPlansRepository } from './repositories/workoutPlans';
import { workoutSessionsRepository as sessoes } from './repositories/workoutSessions';
import { exerciseSetsRepository as series } from './repositories/exerciseSets';
import { cardioSessionsRepository } from './repositories/cardioSessions';
import { bodyMeasurementsRepository as medidas } from './repositories/bodyMeasurements';
import { bodyPhotosRepository as fotos } from './repositories/bodyPhotos';
import { restDaysRepository } from './repositories/restDays';
import { settingsRepository } from './repositories/settings';
import { diasSemBackup, lembrarBackup, textoUltimoBackup } from '../backup';

const HOJE = new Date(2026, 0, 14, 10);
const TABELAS = ['equipment', 'exercises', 'exerciseImages', 'workoutPlans', 'workoutSessions', 'exerciseSets', 'cardioSessions', 'bodyMeasurements', 'restDays', 'settings'] as const;

/** Conteúdo de todas as tabelas, com os blobs das imagens como bytes (comparável com toEqual). */
async function fotografar() {
  const r: Record<string, unknown[]> = {};
  for (const t of TABELAS) {
    const l = await db.table(t).toArray();
    r[t] = await Promise.all(l.map(async (x) => (x.blob ? { ...x, blob: [...new Uint8Array(await (x.blob as Blob).arrayBuffer())], tipo: (x.blob as Blob).type } : x)));
    r[t]!.sort((a, b) => String((a as { id: string }).id).localeCompare((b as { id: string }).id));
  }
  return r;
}

/** Banco com um pouco de tudo: imagem, aparelho, treino com séries, cardio, medida com foto, descanso, exercício excluído. */
async function popular() {
  const ex = (await exercisesRepository.list())[0]!;
  await exerciseImagesRepository.setForExercise(ex.id, { blob: new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'image/webp' }), mimeType: 'image/webp', largura: 800, altura: 600 });
  const a = await equipmentRepository.create({ nome: 'Polia', observacoes: 'dupla' });
  await exercisesRepository.update(ex.id, { equipmentId: a.id });
  const ficha = (await workoutPlansRepository.list())[0]!;
  const s = await sessoes.iniciar(ficha.id);
  await series.registrar({ sessionId: s.id, exerciseId: s.planSnapshot.itens[0]!.exerciseId, carga: 40, reps: 10 });
  await sessoes.finalizar(s.id, { rpe: 7, observacoes: 'ok' });
  await cardioSessionsRepository.registrarAvulso({ modalidade: 'esteira', duracaoMin: 15, velocidadeKmh: 6, inclinacaoNivel: { valor: 7, rotulo: 'nível 7' }, distanciaKm: 1.5, rpe: 5, observacoes: '', data: '2026-01-13' });
  const m = await medidas.registrar({ data: '2026-01-14', pesoKg: 84, cinturaCm: 90, observacoes: '' });
  await fotos.adicionar(m.id, new Blob([new Uint8Array(10)], { type: 'image/webp' }));
  await restDaysRepository.alternar('2026-01-12');
  const extra = await exercisesRepository.create({ nome: 'Exercício excluído', tipo: 'carga', unidadeCarga: 'kg', grupoPrincipal: 'peito', gruposSecundarios: [], porLado: false });
  await exercisesRepository.remove(extra.id);
  await settingsRepository.update({ metaPesoKg: 80, metaDirecao: 'perder' });
  return { m };
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(HOJE);
  await db.delete();
  await db.open();
});
afterEach(() => vi.useRealTimers());

describe('backup JSON', () => {
  it('exportar, apagar o banco, importar: todas as tabelas idênticas (incluindo imagens e excluídos)', async () => {
    await popular();
    const antes = await fotografar();
    const json = await backupRepository.exportar();
    expect(JSON.parse(json)).toMatchObject({ app: 'fittrack', schemaVersion: SCHEMA_VERSAO });
    // Fotos corporais não entram no backup.
    expect(JSON.parse(json).tabelas.bodyPhotos).toBeUndefined();

    await db.delete();
    await db.open();
    await backupRepository.importar(validarBackup(json));
    expect(await fotografar()).toEqual(antes);
  });

  it('pré-visualização com os totais e as fotos corporais que serão apagadas', async () => {
    await popular();
    const b = validarBackup(await backupRepository.exportar());
    const p = await backupRepository.previa(b);
    expect(p.totais).toEqual({ fichas: 5, exercicios: 21, imagens: 1, treinos: 1, series: 1, cardios: 1, medidas: 1, descansos: 1 });
    expect(p.fotosApagadas).toBe(0);

    // Medição que não está no backup: a foto dela será apagada.
    const outra = await medidas.registrar({ data: '2026-01-10', pesoKg: 85, cinturaCm: null, observacoes: '' });
    const f = await fotos.adicionar(outra.id, new Blob([new Uint8Array(5)]));
    expect((await backupRepository.previa(b)).fotosApagadas).toBe(1);
    await backupRepository.importar(b);
    expect(await db.bodyPhotos.get(f.id)).toBeUndefined();
    expect(await fotos.porMedicao()).toHaveProperty('size', 1);
  });

  it('não restaura o local do dia nem a data do último backup deste aparelho', async () => {
    await settingsRepository.update({ ultimoBackupEm: '2026-01-01T00:00:00.000Z' });
    const json = await backupRepository.exportar();
    await backupRepository.marcarExportado();
    const atual = await settingsRepository.get();
    await settingsRepository.update({ interface: { ...atual.interface, localHoje: { local: 'casa', data: '2026-01-14' } } });
    await backupRepository.importar(validarBackup(json));
    expect(await settingsRepository.get()).toMatchObject({ ultimoBackupEm: HOJE.toISOString(), interface: { localHoje: { local: 'casa' } } });
  });

  it('inválido ou de versão mais nova: recusado, nada é alterado', async () => {
    const json = await backupRepository.exportar();
    const antes = await fotografar();
    expect(() => validarBackup('não é json')).toThrow('JSON inválido');
    expect(() => validarBackup('{"app":"outro"}')).toThrow('não é um backup do FitTrack');
    const novo = JSON.parse(json);
    novo.schemaVersion = SCHEMA_VERSAO + 1;
    expect(() => validarBackup(JSON.stringify(novo))).toThrow('versão mais nova do app');
    expect(await fotografar()).toEqual(antes);
  });

  it('cada registro passa pelas regras do app: videoUrl "javascript:..." e valores fora dos limites são recusados', async () => {
    const json = await backupRepository.exportar();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON bruto do backup, alterado à mão no teste
    const mudar = (f: (b: any) => void) => {
      const b = JSON.parse(json);
      f(b);
      return () => validarBackup(JSON.stringify(b));
    };
    expect(mudar((b) => { b.tabelas.exercises[0]!.videoUrl = 'javascript:alert(1)'; })).toThrow(BackupInvalidoError);
    expect(mudar((b) => { b.tabelas.exercises[0]!.videoUrl = 'javascript:alert(1)'; })).toThrow(/Exercícios, registro 1 \(videoUrl\)/);
    expect(mudar((b) => { b.tabelas.exercises[0]!.grupoPrincipal = 'pescoço'; })).toThrow(/Exercícios, registro 1/);
    expect(mudar((b) => { (b.tabelas.workoutPlans[0]!.itens as { series: number }[])[0]!.series = 50; })).toThrow(/Fichas, registro 1/);
    expect(mudar((b) => { b.tabelas.settings[0]!.descansoPadraoSeg = -5; })).toThrow(/Configurações/);
    expect(mudar((b) => { b.tabelas.exercises[0]!.id = ''; })).toThrow(/Exercícios, registro 1 \(id\)/);
  });

  it('backup de schema antigo recebe os links do seed (sem sobrescrever link cadastrado)', async () => {
    const b = JSON.parse(await backupRepository.exportar());
    b.schemaVersion = 1;
    const leg = b.tabelas.exercises.find((e: { nome: string }) => e.nome === 'Leg press');
    delete leg.videoUrl;
    const v = validarBackup(JSON.stringify(b));
    expect(v.tabelas.exercises.find((e) => e.nome === 'Leg press')!.videoUrl).toContain('youtube.com/results');
  });
});

describe('lembrete de backup', () => {
  it('texto do último backup e lembrete com 14 dias ou mais, só com treino registrado', () => {
    expect(textoUltimoBackup(undefined, HOJE)).toBe('Nenhum backup feito');
    expect(textoUltimoBackup(new Date(2026, 0, 14, 8).toISOString(), HOJE)).toBe('Último backup: hoje');
    expect(textoUltimoBackup(new Date(2026, 0, 13, 9).toISOString(), HOJE)).toBe('Último backup: há 1 dia');
    expect(diasSemBackup(new Date(2026, 0, 1, 10).toISOString(), HOJE)).toBe(13);
    expect(lembrarBackup(new Date(2026, 0, 1, 10).toISOString(), true, HOJE)).toBe(false);
    expect(lembrarBackup(new Date(2025, 11, 31, 10).toISOString(), true, HOJE)).toBe(true);
    expect(lembrarBackup(undefined, true, HOJE)).toBe(true);
    expect(lembrarBackup(undefined, false, HOJE)).toBe(false);
  });
});
