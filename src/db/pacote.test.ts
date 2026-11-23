import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { exportarPacote, importarPacote, previaPacote, validarPacote } from './repositories/pacote';
import { backupRepository, validarBackup } from './repositories/backup';
import { exercisesRepository } from './repositories/exercises';
import { exerciseImagesRepository } from './repositories/exerciseImages';
import { equipmentRepository } from './repositories/equipment';
import { workoutPlansRepository } from './repositories/workoutPlans';
import { workoutSessionsRepository as sessoes } from './repositories/workoutSessions';
import { bodyMeasurementsRepository as medidas } from './repositories/bodyMeasurements';
import { restDaysRepository } from './repositories/restDays';

const img = (bytes: number[]) => ({ blob: new Blob([new Uint8Array(bytes)], { type: 'image/webp' }), mimeType: 'image/webp', largura: 800, altura: 600 });
const ex = async (nome: string) => (await exercisesRepository.list()).find((e) => e.nome === nome)!;
const bytes = async (exerciseId: string) => [...new Uint8Array(await (await exerciseImagesRepository.getForExercise(exerciseId))!.blob.arrayBuffer())];
const novoExercicio = (nome: string) => exercisesRepository.create({ nome, tipo: 'carga', unidadeCarga: 'kg', grupoPrincipal: 'peito', gruposSecundarios: [], porLado: false });

/** Monta o pacote no aparelho "de origem" e recria um banco limpo (o "outro aparelho", só com o seed). */
async function levar(preparar: () => Promise<void>, opcoes?: { fichas?: boolean }) {
  await preparar();
  const json = await exportarPacote(opcoes);
  await db.delete();
  await db.open();
  return json;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 0, 14, 10));
  await db.delete();
  await db.open();
});
afterEach(() => vi.useRealTimers());

describe('pacote de exercícios', () => {
  it('só exercícios ativos, imagens e aparelhos ligados; fichas só se marcado; nunca treinos, medidas, descanso ou configurações', async () => {
    const supino = await ex('Supino máquina');
    await exerciseImagesRepository.setForExercise(supino.id, img([9, 8, 7]));
    const a = await equipmentRepository.create({ nome: 'Polia', observacoes: '' });
    await equipmentRepository.create({ nome: 'Sem uso', observacoes: '' });
    await exercisesRepository.update(supino.id, { equipmentId: a.id });
    const excluido = await novoExercicio('Excluído');
    await exercisesRepository.remove(excluido.id);
    const s = await sessoes.iniciar((await workoutPlansRepository.list())[0]!.id);
    await sessoes.finalizar(s.id, { rpe: 6, observacoes: '' });
    await medidas.registrar({ data: '2026-01-14', pesoKg: 80, cinturaCm: null, observacoes: '' });
    await restDaysRepository.alternar('2026-01-13');

    const sem = JSON.parse(await exportarPacote());
    expect(Object.keys(sem).sort()).toEqual(['app', 'appVersion', 'equipment', 'exerciseImages', 'exercises', 'exportadoEm', 'tipo', 'workoutPlans']);
    expect(sem.exercises).toHaveLength(21);
    expect(sem.exercises.some((e: { nome: string }) => e.nome === 'Excluído')).toBe(false);
    expect(sem.exerciseImages).toHaveLength(1);
    expect(sem.equipment.map((e: { nome: string }) => e.nome)).toEqual(['Polia']);
    expect(sem.workoutPlans).toEqual([]);
    expect(JSON.parse(await exportarPacote({ fichas: true })).workoutPlans).toHaveLength(5);
  });

  it('juntar pelo nome: cria, ganha foto, mantém a foto existente, restaura excluído; nada é apagado', async () => {
    const json = await levar(async () => {
      await exerciseImagesRepository.setForExercise((await ex('Supino máquina')).id, img([1, 1]));
      await exerciseImagesRepository.setForExercise((await ex('Leg press')).id, img([2, 2]));
      const e = await novoExercicio('Crucifixo  com HALTER');
      await exerciseImagesRepository.setForExercise(e.id, img([3, 3]));
      await novoExercicio('Prancha lateral');
      const a = await equipmentRepository.create({ nome: 'Banco reto', observacoes: 'perto do espelho' });
      await exercisesRepository.update(e.id, { equipmentId: a.id });
    });
    // Neste aparelho: Leg press já tem foto; "Crucifixo com halter" foi excluído; a ficha local continua.
    const leg = await ex('Leg press');
    await exerciseImagesRepository.setForExercise(leg.id, img([5, 5]));
    const excluido = await novoExercicio('Crucifixo com halter');
    await exercisesRepository.remove(excluido.id);
    const fichasAntes = await workoutPlansRepository.list();

    const pacote = validarPacote(json);
    expect(await previaPacote(pacote)).toMatchObject({ novos: 1, restaurados: 1, ganhamFoto: 2, jaTemFoto: 1, fichas: 0, conflitos: [] });
    await importarPacote(pacote);

    expect(await bytes((await ex('Supino máquina')).id)).toEqual([1, 1]);
    expect(await bytes(leg.id)).toEqual([5, 5]);
    const restaurado = await ex('Crucifixo com halter');
    expect(restaurado.id).toBe(excluido.id);
    expect(await bytes(restaurado.id)).toEqual([3, 3]);
    expect((await exercisesRepository.list()).filter((e) => e.nome === 'Prancha lateral')).toHaveLength(1);
    expect(await workoutPlansRepository.list()).toEqual(fichasAntes);
    // Restaurado mantém o próprio cadastro; o aparelho do pacote só vai para exercício criado.
    expect(restaurado.equipmentId).toBeUndefined();
    expect(await equipmentRepository.list()).toHaveLength(1);

    // Importar de novo não duplica nada.
    await importarPacote(validarPacote(json));
    expect(await exercisesRepository.list()).toHaveLength(23);
    expect(await equipmentRepository.list()).toHaveLength(1);
  });

  it('aparelho do exercício criado: usa o deste aparelho com o mesmo nome, senão cria', async () => {
    const json = await levar(async () => {
      const a = await equipmentRepository.create({ nome: 'Polia alta', observacoes: '' });
      const e = await novoExercicio('Face pull');
      await exercisesRepository.update(e.id, { equipmentId: a.id });
    });
    const local = await equipmentRepository.create({ nome: 'polia  ALTA', observacoes: 'minha' });
    await importarPacote(validarPacote(json));
    expect((await ex('Face pull')).equipmentId).toBe(local.id);
    expect(await equipmentRepository.list()).toHaveLength(1);
  });

  it('fichas: dia livre cria; dia e local ocupados pulam ou substituem conforme a escolha', async () => {
    const json = await levar(async () => {
      const casa = await workoutPlansRepository.create({ nome: 'Casa segunda', diaSemana: 1, local: 'casa', itens: [{ exerciseId: (await ex('Bird dog')).id, series: 2, repsMin: 10, repsMax: 10, descansoSeg: 60, ordem: 0 }] });
      expect(casa.local).toBe('casa');
      const seg = (await workoutPlansRepository.list()).find((p) => p.diaSemana === 1 && p.local === 'academia')!;
      await workoutPlansRepository.update(seg.id, { nome: 'Peito do pacote' });
    }, { fichas: true });
    const pacote = validarPacote(json);
    const p = await previaPacote(pacote);
    expect(p.fichas).toBe(6);
    expect(p.conflitos.map((c) => c.rotulo)).toEqual(['Segunda (Academia)', 'Terça (Academia)', 'Quarta (Academia)', 'Quinta (Academia)', 'Sexta (Academia)']);
    const peito = p.conflitos.find((c) => c.ficha.nome === 'Peito do pacote')!;
    await importarPacote(pacote, new Set([peito.ficha.id]));

    const fichas = await workoutPlansRepository.list();
    expect(fichas).toHaveLength(6);
    expect(fichas.find((f) => f.diaSemana === 1 && f.local === 'academia')!.nome).toBe('Peito do pacote');
    expect(fichas.find((f) => f.diaSemana === 2)!.nome).toBe('Pernas A e abdômen');
    const casa = fichas.find((f) => f.local === 'casa')!;
    // Itens apontam para os exercícios deste aparelho.
    expect(casa.itens[0]!.exerciseId).toBe((await ex('Bird dog')).id);
  });

  it('validação: "javascript:" recusado; backup completo e pacote se recusam mutuamente', async () => {
    const json = await exportarPacote();
    const b = JSON.parse(json);
    b.exercises[0].videoUrl = 'javascript:alert(1)';
    expect(() => validarPacote(JSON.stringify(b))).toThrow(/Exercícios, registro 1 \(videoUrl\)/);
    const completo = await backupRepository.exportar();
    expect(() => validarPacote(completo)).toThrow('Este arquivo é um backup completo');
    expect(() => validarBackup(json)).toThrow('Este arquivo é um pacote de exercícios');
    expect(() => validarPacote('{}')).toThrow('não é um pacote de exercícios');
  });

  it('falha no meio: nada é gravado (transação)', async () => {
    const json = await levar(async () => {
      await novoExercicio('Novo A');
      await novoExercicio('Novo B');
    });
    const pacote = validarPacote(json);
    const antes = await db.exercises.count();
    // Imagem para o último exercício criado: a gravação dela falha depois de os dois exercícios já terem sido adicionados.
    const ultimo = pacote.exercises.find((e) => e.nome === 'Novo B')!;
    pacote.exerciseImages = [{ id: 'x', exerciseId: ultimo.id, blob: new Blob(['x']), mimeType: 'image/webp', largura: 1, altura: 1, createdAt: '', updatedAt: '', deletedAt: null }];
    const espiao = vi.spyOn(db.exerciseImages, 'add').mockRejectedValueOnce(new Error('disco cheio'));
    await expect(importarPacote(pacote)).rejects.toThrow('disco cheio');
    espiao.mockRestore();
    expect(await db.exercises.count()).toBe(antes);
  });
});
