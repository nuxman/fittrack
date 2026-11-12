import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import type { Exercise, WorkoutPlan } from './types';
import {
  DiaOcupadoError, FichaInvalidaError, moverItem, ordenarItens, workoutPlansRepository,
} from './repositories/workoutPlans';
import { ExercicioEmUsoError, exercisesRepository, NomeDuplicadoError } from './repositories/exercises';
import { exerciseImagesRepository } from './repositories/exerciseImages';
import { workoutSessionsRepository } from './repositories/workoutSessions';

const novoEx = (nome: string, extra: Partial<Exercise> = {}) =>
  exercisesRepository.create({
    nome, tipo: 'carga', unidadeCarga: 'kg', grupoPrincipal: 'peito', gruposSecundarios: [], porLado: false, ...extra,
  });

const doDia = async (d: number) => (await workoutPlansRepository.list()).find((p) => p.diaSemana === d)!;
const item = (exerciseId: string, extra = {}) => ({ exerciseId, series: 3, repsMin: 10, repsMax: 12, descansoSeg: 90, ordem: 0, ...extra });

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('fichas: dia da semana único', () => {
  it('criar ficha em dia ocupado falha; em dia livre funciona', async () => {
    const ex = await novoEx('Flexão');
    await expect(workoutPlansRepository.create({ nome: 'Extra', diaSemana: 1, itens: [] })).rejects.toBeInstanceOf(DiaOcupadoError);
    const sab = await workoutPlansRepository.create({ nome: 'Sábado leve', diaSemana: 6, itens: [item(ex.id)] });
    expect(sab.diaSemana).toBe(6);
  });

  it('mover para dia ocupado exige confirmação e troca as duas fichas', async () => {
    const seg = await doDia(1);
    const qua = await doDia(3);
    await expect(workoutPlansRepository.update(seg.id, { diaSemana: 3 })).rejects.toBeInstanceOf(DiaOcupadoError);
    expect((await doDia(1)).id).toBe(seg.id); // nada mudou

    await workoutPlansRepository.update(seg.id, { diaSemana: 3 }, { trocarDia: true });
    expect((await doDia(3)).id).toBe(seg.id);
    expect((await doDia(1)).id).toBe(qua.id);
    const dias = (await workoutPlansRepository.list()).map((p) => p.diaSemana).sort();
    expect(new Set(dias).size).toBe(dias.length);
  });

  it('mover para dia livre não precisa de troca; excluir libera o dia', async () => {
    const sex = await doDia(5);
    await workoutPlansRepository.update(sex.id, { diaSemana: 6 });
    expect((await doDia(6)).id).toBe(sex.id);
    await workoutPlansRepository.remove(sex.id);
    const ex = await novoEx('Prancha', { tipo: 'peso_corporal' });
    await expect(workoutPlansRepository.create({ nome: 'Nova', diaSemana: 6, itens: [item(ex.id)] })).resolves.toBeTruthy();
  });
});

describe('fichas: local do treino', () => {
  it('fichas existentes leem como academia; casa pode usar o mesmo dia', async () => {
    const seg = await doDia(1);
    expect(seg.local).toBe('academia'); // seed grava o local; registro antigo sem local também é academia
    const ex = await novoEx('Flexão');
    const casa = await workoutPlansRepository.create({ nome: 'Casa A', diaSemana: 1, local: 'casa', itens: [item(ex.id)] });
    expect(casa.local).toBe('casa');
    await expect(workoutPlansRepository.create({ nome: 'Casa B', diaSemana: 1, local: 'casa', itens: [] })).rejects.toBeInstanceOf(DiaOcupadoError);
  });

  it('registro antigo sem local conta como academia na unicidade do dia', async () => {
    const seg = await doDia(1);
    await db.workoutPlans.update(seg.id, { local: undefined });
    await expect(workoutPlansRepository.create({ nome: 'Extra', diaSemana: 1, local: 'academia', itens: [] })).rejects.toBeInstanceOf(DiaOcupadoError);
  });

  it('mudar o local para um dia ocupado nesse local troca dia e local das duas fichas', async () => {
    const ex = await novoEx('Flexão');
    const casa = await workoutPlansRepository.create({ nome: 'Casa', diaSemana: 3, local: 'casa', itens: [item(ex.id)] });
    const seg = await doDia(1);
    await expect(workoutPlansRepository.update(seg.id, { diaSemana: 3, local: 'casa' })).rejects.toBeInstanceOf(DiaOcupadoError);
    await workoutPlansRepository.update(seg.id, { diaSemana: 3, local: 'casa' }, { trocarDia: true });
    expect(await workoutPlansRepository.get(seg.id)).toMatchObject({ diaSemana: 3, local: 'casa' });
    expect(await workoutPlansRepository.get(casa.id)).toMatchObject({ diaSemana: 1, local: 'academia' });
  });
});

describe('fichas: itens', () => {
  it('moverItem sobe, desce e ignora os extremos', () => {
    expect(moverItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moverItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    const xs = ['a', 'b'];
    expect(moverItem(xs, 0, -1)).toBe(xs);
    expect(moverItem(xs, 1, 1)).toBe(xs);
  });

  it('salvar renumera ordem pela posição; remover item funciona', async () => {
    const seg = await doDia(1);
    const itens = moverItem(ordenarItens(seg.itens), 0, 1);
    const salvo = await workoutPlansRepository.update(seg.id, { itens: itens.slice(0, 4) });
    expect(salvo.itens.map((i) => i.ordem)).toEqual([0, 1, 2, 3]);
    expect(salvo.itens[0]!.exerciseId).toBe(seg.itens[1]!.exerciseId);
    expect(salvo.itens[1]!.exerciseId).toBe(seg.itens[0]!.exerciseId);
  });

  it('valida limites: séries, reps, min ≤ max, descanso, nome', async () => {
    const seg = await doDia(1);
    const id0 = seg.itens[0]!.exerciseId;
    const casos = [
      { series: 0 }, { series: 11 }, { repsMin: 0 }, { repsMax: 101 }, { repsMin: 12, repsMax: 10 },
      { descansoSeg: -1 }, { descansoSeg: 601 }, { series: 2.5 },
    ];
    for (const c of casos) {
      await expect(workoutPlansRepository.update(seg.id, { itens: [item(id0, c)] }), JSON.stringify(c)).rejects.toBeInstanceOf(FichaInvalidaError);
    }
    await expect(workoutPlansRepository.update(seg.id, { nome: '   ' })).rejects.toBeInstanceOf(FichaInvalidaError);
    await expect(workoutPlansRepository.update(seg.id, { itens: [item(id0, { series: 10, repsMin: 1, repsMax: 100, descansoSeg: 600 })] })).resolves.toBeTruthy();
  });

  it("tipo 'tempo': reps são segundos de 1 a 600", async () => {
    const prancha = await novoEx('Prancha', { tipo: 'tempo', grupoPrincipal: 'core' });
    const seg = await doDia(1);
    await expect(workoutPlansRepository.update(seg.id, { itens: [item(prancha.id, { repsMin: 30, repsMax: 600 })] })).resolves.toBeTruthy();
    await expect(workoutPlansRepository.update(seg.id, { itens: [item(prancha.id, { repsMin: 30, repsMax: 601 })] })).rejects.toBeInstanceOf(FichaInvalidaError);
    const supino = seg.itens[0]!.exerciseId;
    await expect(workoutPlansRepository.update(seg.id, { itens: [item(supino, { repsMin: 30, repsMax: 150 })] })).rejects.toBeInstanceOf(FichaInvalidaError);
  });
});

describe('exercícios', () => {
  it('nome duplicado (normalizado) é rejeitado; renomear para o próprio nome é permitido', async () => {
    await expect(novoEx('  SUPINO   maquina ')).rejects.toBeInstanceOf(NomeDuplicadoError);
    const supino = (await exercisesRepository.findByName('Supino máquina'))!;
    await expect(exercisesRepository.update(supino.id, { nome: 'supino MÁQUINA' })).resolves.toMatchObject({ nome: 'supino MÁQUINA' });
    await expect(exercisesRepository.update(supino.id, { nome: 'Leg press' })).rejects.toBeInstanceOf(NomeDuplicadoError);
  });

  it('salva link e anotações; limpar remove o valor; link inválido falha', async () => {
    const ex = await novoEx('Crossover');
    const u = await exercisesRepository.update(ex.id, { videoUrl: 'https://exemplo.com/v', anotacoes: 'Banco na posição 4' });
    expect(u).toMatchObject({ videoUrl: 'https://exemplo.com/v', anotacoes: 'Banco na posição 4' });
    const limpo = await exercisesRepository.update(ex.id, { videoUrl: '', anotacoes: '  ' });
    expect(limpo.videoUrl).toBeUndefined();
    expect(limpo.anotacoes).toBeUndefined();
    await expect(exercisesRepository.update(ex.id, { videoUrl: 'http://exemplo.com' })).rejects.toThrow('https://');
  });

  it('grupo principal fora da lista é rejeitado; secundário igual ao principal é descartado', async () => {
    await expect(novoEx('X', { grupoPrincipal: 'pescoço' as never })).rejects.toThrow();
    const ex = await novoEx('Y', { grupoPrincipal: 'costas', gruposSecundarios: ['costas', 'bíceps', 'bíceps'] });
    expect(ex.gruposSecundarios).toEqual(['bíceps']);
  });

  it('exclusão bloqueada enquanto o exercício está em ficha', async () => {
    const remada = (await exercisesRepository.findByName('Remada com apoio no peito'))!;
    const err = await exercisesRepository.remove(remada.id).catch((e) => e);
    expect(err).toBeInstanceOf(ExercicioEmUsoError);
    expect((err as ExercicioEmUsoError).fichas.map((f) => f.nome).sort()).toEqual(['Costas e bíceps', 'Pernas B e corpo inteiro']);
    expect(await exercisesRepository.get(remada.id)).toBeDefined();
  });

  it('criar com nome de um excluído oferece restauração em vez de duplicar', async () => {
    const ex = await novoEx('Pullover');
    await exercisesRepository.remove(ex.id);
    const err = await novoEx('pullóver').catch((e) => e);
    expect(err).toBeInstanceOf(NomeDuplicadoError);
    expect(err).toMatchObject({ excluido: true, existente: { id: ex.id } });
    expect((await exercisesRepository.findDeletedByName(' PULLOVER '))?.id).toBe(ex.id);

    const r = await exercisesRepository.restore(ex.id);
    expect(r.deletedAt).toBeNull();
    expect((await exercisesRepository.findByName('Pullover'))?.id).toBe(ex.id);
    expect(await db.exercises.filter((e) => e.nome.toLowerCase().startsWith('pull')).count()).toBe(1);
  });
});

describe('imagem do exercício', () => {
  const img = (n: number) => ({ blob: new Blob([new Uint8Array(n)], { type: 'image/webp' }), mimeType: 'image/webp', largura: 800, altura: 600 });

  it('no máximo uma ativa; a anterior vira soft delete com blob vazio', async () => {
    const ex = (await exercisesRepository.findByName('Leg press'))!;
    const a = await exerciseImagesRepository.setForExercise(ex.id, img(1000));
    const b = await exerciseImagesRepository.setForExercise(ex.id, img(2000));
    expect((await exerciseImagesRepository.getForExercise(ex.id))?.id).toBe(b.id);

    const todas = await db.exerciseImages.where('exerciseId').equals(ex.id).toArray();
    expect(todas.filter((i) => i.deletedAt === null)).toHaveLength(1);
    const antiga = todas.find((i) => i.id === a.id)!;
    expect(antiga.deletedAt).not.toBeNull();
    expect(antiga.blob.size).toBe(0);
  });

  it('remover deixa o exercício sem foto e esvazia o blob', async () => {
    const ex = (await exercisesRepository.findByName('Leg press'))!;
    const a = await exerciseImagesRepository.setForExercise(ex.id, img(500));
    await exerciseImagesRepository.removeForExercise(ex.id);
    expect(await exerciseImagesRepository.getForExercise(ex.id)).toBeUndefined();
    expect((await db.exerciseImages.get(a.id))!.blob.size).toBe(0);
  });
});

describe('sessões antigas não mudam ao editar a ficha', () => {
  it('editar ficha, renomear e excluir exercício não alteram planSnapshot', async () => {
    const seg = await doDia(1);
    const snapshot = await workoutSessionsRepository.snapshotDaFicha(seg.id);
    expect(snapshot.itens[0]).toMatchObject({ nome: 'Supino máquina', tipo: 'carga', unidadeCarga: 'kg', grupoPrincipal: 'peito' });

    const sessao = await workoutSessionsRepository.iniciar(seg.id);
    await workoutSessionsRepository.finalizar(sessao.id, { rpe: 7, observacoes: '' });
    const antes = structuredClone((await db.workoutSessions.get(sessao.id))!);

    // Edita a ficha: nome, dia, ordem, séries, remove itens.
    const itens = moverItem(ordenarItens(seg.itens), 0, 1).map((i) => ({ ...i, series: 2 }));
    await workoutPlansRepository.update(seg.id, { nome: 'Peito novo', diaSemana: 6, itens: itens.slice(1) });

    // Renomeia e muda o tipo de um exercício, depois tira de todas as fichas e exclui outro.
    const crucifixo = snapshot.itens[2]!.exerciseId;
    await exercisesRepository.update(crucifixo, { nome: 'Voador', grupoPrincipal: 'ombros', unidadeCarga: 'placa' });
    const supino = snapshot.itens[0]!.exerciseId;
    for (const p of await workoutPlansRepository.list()) {
      await workoutPlansRepository.update(p.id, { itens: p.itens.filter((i) => i.exerciseId !== supino) });
    }
    await exercisesRepository.remove(supino);

    const depois = (await db.workoutSessions.get(sessao.id))!;
    expect(depois).toEqual(antes);
    expect(depois.planSnapshot.nome).toBe('Peito e tríceps');
    expect(depois.planSnapshot.itens[0]!.nome).toBe('Supino máquina');
    expect(depois.planSnapshot.itens[2]).toMatchObject({ nome: 'Crucifixo máquina', grupoPrincipal: 'peito', unidadeCarga: 'kg' });
  });

  it('snapshot é cópia profunda (mutar a ficha em memória não afeta)', async () => {
    const seg: WorkoutPlan = await doDia(1);
    const snap = await workoutSessionsRepository.snapshotDaFicha(seg.id);
    seg.itens[0]!.series = 99;
    expect(snap.itens[0]!.series).toBe(3);
  });
});
