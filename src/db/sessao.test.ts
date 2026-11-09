import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { workoutPlansRepository } from './repositories/workoutPlans';
import { SessaoAtivaError, workoutSessionsRepository as sessoes } from './repositories/workoutSessions';
import { exerciseSetsRepository as series } from './repositories/exerciseSets';

const segunda = async () => (await workoutPlansRepository.list()).find((p) => p.diaSemana === 1)!;

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('repositório de sessão', () => {
  it('só uma sessão ativa por vez; snapshot guarda porLado', async () => {
    const s = await sessoes.iniciar((await segunda()).id);
    await expect(sessoes.iniciar((await segunda()).id)).rejects.toBeInstanceOf(SessaoAtivaError);
    expect(s.planSnapshot.itens.every((i) => i.porLado === false)).toBe(true);
    expect((await sessoes.ativa())!.id).toBe(s.id);
  });

  it('pausar congela o tempo e zera o descanso em curso', async () => {
    const s = await sessoes.iniciar((await segunda()).id);
    await sessoes.setDescanso(s.id, Date.now() + 90_000);
    const p = await sessoes.pausar(s.id);
    expect(p).toMatchObject({ status: 'pausada', restTimerEndsAt: null, ativaDesde: null });
    expect(p.pausadaEm).toBeTypeOf('number');
    // Pausada: descanso não pode ser ligado.
    expect((await sessoes.setDescanso(s.id, Date.now() + 60_000)).restTimerEndsAt).toBeNull();
    expect((await sessoes.retomar(s.id))).toMatchObject({ status: 'em_andamento', pausadaEm: null });
  });

  it('registrar numera as séries por exercício; desfazer faz soft delete da última', async () => {
    const s = await sessoes.iniciar((await segunda()).id);
    const [a, b] = s.planSnapshot.itens;
    await series.registrar({ sessionId: s.id, exerciseId: a!.exerciseId, carga: 40, reps: 10 });
    await series.registrar({ sessionId: s.id, exerciseId: b!.exerciseId, carga: 20, reps: 12 });
    const x = await series.registrar({ sessionId: s.id, exerciseId: a!.exerciseId, carga: 42.5, reps: 9 });
    expect(x.numeroSerie).toBe(2);

    const desfeita = await series.desfazerUltima(s.id, a!.exerciseId);
    expect(desfeita!.id).toBe(x.id);
    expect((await db.exerciseSets.get(x.id))!.deletedAt).not.toBeNull();
    expect((await series.listarDaSessao(s.id)).length).toBe(2);
    expect((await series.ultimaDoExercicio(a!.exerciseId))!.carga).toBe(40);
  });

  it('sessão abandonada mantém as séries e libera para iniciar outra', async () => {
    const s = await sessoes.iniciar((await segunda()).id);
    const ex = s.planSnapshot.itens[0]!.exerciseId;
    await series.registrar({ sessionId: s.id, exerciseId: ex, carga: 40, reps: 10 });
    await series.registrar({ sessionId: s.id, exerciseId: ex, carga: 40, reps: 10 });
    const ab = await sessoes.abandonar(s.id);
    expect(ab).toMatchObject({ status: 'abandonada', restTimerEndsAt: null });
    expect(ab.finalizadaEm).not.toBeNull();
    expect((await series.listarDaSessao(s.id)).length).toBe(2);
    expect(await sessoes.ativa()).toBeUndefined();
    await expect(sessoes.finalizar(s.id, { rpe: 5, observacoes: '' })).rejects.toThrow('encerrada');
  });

  it('finalizar valida o RPE e pode terminar no horário da última série', async () => {
    const s = await sessoes.iniciar((await segunda()).id);
    await expect(sessoes.finalizar(s.id, { rpe: 11, observacoes: '' })).rejects.toThrow('RPE');
    const fim = s.ativaDesde! + 20 * 60_000;
    const f = await sessoes.finalizar(s.id, { rpe: 8, observacoes: '  ok ' }, fim);
    expect(f).toMatchObject({ status: 'concluida', rpe: 8, observacoes: 'ok', duracaoAtivaSeg: 1200, finalizadaEm: new Date(fim).toISOString() });
  });
});
