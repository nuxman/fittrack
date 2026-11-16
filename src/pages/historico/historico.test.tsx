import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/db';
import { abrir } from '../../test/abrir';
import { workoutPlansRepository } from '../../db/repositories/workoutPlans';
import { workoutSessionsRepository as sessoes } from '../../db/repositories/workoutSessions';
import { exerciseSetsRepository as series } from '../../db/repositories/exerciseSets';
import { cardioSessionsRepository as cardios } from '../../db/repositories/cardioSessions';
import { carregarPainel } from '../../painel';
import { avisoGrupoSeguido, contadorSemana, duracaoEstimadaSeg, concluidasNaSemana } from '../../semana';
import { volumeKg } from '../../sessao';

// Quarta-feira, 7 de janeiro de 2026, 10h (semana de 5 a 11).
const QUARTA = new Date(2026, 0, 7, 10);
const doDia = async (d: number) => (await workoutPlansRepository.list()).find((p) => p.diaSemana === d)!;

/** Treino da ficha do dia, com duas séries no primeiro exercício, concluído em `em` (30 min). */
async function treino(diaSemana: number, em: Date, cargas = [40, 42.5], rpe = 6) {
  vi.setSystemTime(em);
  const s = await sessoes.iniciar((await doDia(diaSemana)).id);
  const ex = s.planSnapshot.itens[0]!.exerciseId;
  for (const [k, carga] of cargas.entries()) {
    vi.setSystemTime(new Date(em.getTime() + (k + 1) * 60_000));
    await series.registrar({ sessionId: s.id, exerciseId: ex, carga, reps: 10 });
  }
  vi.setSystemTime(new Date(em.getTime() + 30 * 60_000));
  await sessoes.finalizar(s.id, { rpe, observacoes: '' });
  vi.setSystemTime(QUARTA);
  return { s, ex };
}

const cardioDe = (sessionId: string) =>
  cardios.create({ sessionId, modalidade: 'esteira', duracaoMin: 15, velocidadeKmh: null, inclinacaoNivel: null, distanciaKm: null, rpe: null, observacoes: '', data: '2026-01-06' });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(QUARTA);
  await db.delete();
  await db.open();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('excluir treino (repositório)', () => {
  it('marca a sessão, as séries e o cardio; tudo que lê o painel deixa de contar; desfazer restaura', async () => {
    const seg = await treino(1, new Date(2026, 0, 5, 10), [40, 40]);
    const ter = await treino(1, new Date(2026, 0, 6, 10), [50, 50]); // mesma ficha, mesmo exercício
    await cardioDe(ter.s.id);
    const plano = await doDia(1);

    let p = await carregarPainel();
    expect(contadorSemana(p.planos, p.sessoes, QUARTA).feitos).toBe(1);
    expect(p.ultima!.sessao.id).toBe(ter.s.id);
    expect((await series.ultimaDoExercicio(ter.ex))!.carga).toBe(50);
    expect(p.cardio).toHaveLength(1);

    const exclusao = await sessoes.excluir(ter.s.id);
    p = await carregarPainel();
    expect(p.sessoes.map((s) => s.id)).toEqual([seg.s.id]);
    expect(p.ultima!.sessao.id).toBe(seg.s.id);
    expect((await series.ultimaDoExercicio(ter.ex))!.carga).toBe(40);
    expect(p.cardio).toHaveLength(0);
    expect(p.seriesPorSessao.get(ter.s.id)).toBeUndefined();
    expect(concluidasNaSemana(p.sessoes, QUARTA).reduce((t, s) => t + s.duracaoAtivaSeg, 0)).toBe(30 * 60);
    expect(duracaoEstimadaSeg(plano, p.sessoes, p.seriesPorSessao)).toBe(duracaoEstimadaSeg(plano, [], new Map()));

    await sessoes.restaurar(exclusao);
    p = await carregarPainel();
    expect(p.ultima!.sessao.id).toBe(ter.s.id);
    expect(p.cardio).toHaveLength(1);
    expect((await series.ultimaDoExercicio(ter.ex))!.carga).toBe(50);
  });

  it('o contador da semana volta a mostrar a ficha como pendente', async () => {
    const { s } = await treino(1, new Date(2026, 0, 5, 10));
    await sessoes.excluir(s.id);
    const p = await carregarPainel();
    expect(contadorSemana(p.planos, p.sessoes, QUARTA).feitos).toBe(0);
  });

  it('desfazer não ressuscita série desfeita antes; recusa treino ativo e cardio em curso', async () => {
    const { s, ex } = await treino(1, new Date(2026, 0, 5, 10), [40, 45]);
    const [a] = await series.listarDaSessao(s.id);
    await series.excluir(a!.id);
    await sessoes.restaurar(await sessoes.excluir(s.id));
    expect((await series.listarDaSessao(s.id)).map((x) => x.carga)).toEqual([45]);
    expect((await series.ultimaDoExercicio(ex))!.numeroSerie).toBe(1);

    const ativa = await sessoes.iniciar((await doDia(3)).id);
    await expect(sessoes.excluir(ativa.id)).rejects.toThrow('andamento');
    await sessoes.finalizar(ativa.id, { rpe: 5, observacoes: '' });
    await sessoes.iniciarCardio(ativa.id);
    await expect(sessoes.excluir(ativa.id)).rejects.toThrow('cardio');
  });
});

describe('correções no Histórico (repositório)', () => {
  it('excluir uma série renumera as restantes e muda volume e última carga', async () => {
    const { s, ex } = await treino(1, new Date(2026, 0, 5, 10), [40, 50, 45]);
    const itens = s.planSnapshot.itens;
    const antes = await series.listarDaSessao(s.id);
    expect(volumeKg(antes, itens)).toBe(1350);
    await series.excluir(antes[2]!.id); // a última (45 kg)
    await series.excluir(antes[0]!.id); // a primeira (40 kg)
    const depois = await series.listarDaSessao(s.id);
    expect(depois.map((x) => [x.numeroSerie, x.carga])).toEqual([[1, 50]]);
    expect(volumeKg(depois, itens)).toBe(500);
    expect((await series.ultimaDoExercicio(ex))!.carga).toBe(50);
  });

  it('editar série valida pelo tipo e unidade do snapshot e muda o volume', async () => {
    const { s } = await treino(1, new Date(2026, 0, 5, 10), [40]);
    const [x] = await series.listarDaSessao(s.id);
    await expect(series.editar(x!.id, null, 10)).rejects.toThrow('Carga');
    await expect(series.editar(x!.id, 40, 0)).rejects.toThrow('Repetições');
    await series.editar(x!.id, 60, 8);
    expect(volumeKg(await series.listarDaSessao(s.id), s.planSnapshot.itens)).toBe(480);
  });

  it('corrigir o RPE de ontem liga e desliga o aviso de dias seguidos', async () => {
    const { s } = await treino(1, new Date(2026, 0, 6, 10), [40], 6); // ontem (terça), ficha de segunda: peito
    const grupos = s.planSnapshot.itens.map((i) => i.grupoPrincipal);
    const aviso = async () => avisoGrupoSeguido(grupos, await sessoes.list(), QUARTA);
    expect(await aviso()).toBeNull();
    await sessoes.editarAvaliacao(s.id, { rpe: 9, observacoes: ' pesado ' });
    expect(await aviso()).toMatchObject({ rpe: 9 });
    expect((await sessoes.get(s.id))!.observacoes).toBe('pesado');
    await expect(sessoes.editarAvaliacao(s.id, { rpe: 11, observacoes: '' })).rejects.toThrow('RPE');
    await expect(sessoes.editarAvaliacao(s.id, { rpe: null, observacoes: '' })).rejects.toThrow('RPE');
  });
});

describe('tela do Histórico', () => {
  it('agrupa por semana (mais recente primeiro), mostra volume, cardio e abandonado', async () => {
    await treino(1, new Date(2025, 11, 29, 10), [40]); // semana anterior
    const ter = await treino(2, new Date(2026, 0, 6, 10), [100]); // Leg press: 100 × 10
    await cardioDe(ter.s.id);
    const ab = await sessoes.iniciar((await doDia(3)).id);
    await sessoes.abandonar(ab.id);

    abrir('/historico');
    const semanas = await screen.findAllByRole('region', { name: /^Semana de/ });
    expect(semanas.map((s) => s.getAttribute('aria-label'))).toEqual(['Semana de 05/01 a 11/01', 'Semana de 29/12 a 04/01']);
    const cards = within(semanas[0]!).getAllByTestId('card-historico');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('Costas e bíceps');
    expect(cards[0]).toHaveTextContent('abandonado');
    expect(cards[0]).toHaveTextContent('—');
    expect(cards[1]).toHaveTextContent('1.000 kg');
    expect(cards[1]).toHaveTextContent('RPE 6');
    expect(cards[1]).toHaveTextContent('+ Esteira 15 min');
  });

  it('editar e excluir série pelo detalhe', async () => {
    const { s } = await treino(1, new Date(2026, 0, 5, 10), [40, 42.5]);
    abrir(`/historico/${s.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar série 2: 42,5 kg × 10' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar Carga (kg)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.getByTestId('resumo-treino')).toHaveTextContent('830 kg de volume'));

    fireEvent.click(await screen.findByRole('button', { name: 'Editar série 1: 40 kg × 10' }));
    fireEvent.click(screen.getByRole('button', { name: /Excluir série/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Excluir série' }));
    expect(await screen.findByRole('button', { name: 'Editar série 1: 43 kg × 10' })).toBeInTheDocument();
    expect(screen.getByTestId('resumo-treino')).toHaveTextContent('430 kg de volume');
  });

  it('editar o RPE pelo detalhe', async () => {
    const { s } = await treino(1, new Date(2026, 0, 5, 10));
    abrir(`/historico/${s.id}`);
    fireEvent.click(await screen.findByRole('button', { name: /Editar RPE/ }));
    fireEvent.click(screen.getByRole('button', { name: '8' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByTestId('rpe-treino')).toHaveTextContent('RPE: 8');
    expect((await sessoes.get(s.id))!.rpe).toBe(8);
  });

  it('excluir com cardio: avisa, volta para a lista e "Desfazer" restaura tudo', async () => {
    const { s } = await treino(1, new Date(2026, 0, 5, 10));
    await cardioDe(s.id);
    const { router } = abrir(`/historico/${s.id}`);
    fireEvent.click(await screen.findByRole('button', { name: /Excluir treino/ }));
    const dlg = await screen.findByRole('dialog');
    expect(dlg).toHaveTextContent('cardio feito depois dele');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Excluir treino' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Treino excluído');
    expect(router.state.location.pathname).toBe('/historico');
    expect(screen.queryByTestId('card-historico')).not.toBeInTheDocument();
    expect(await cardios.list()).toHaveLength(0);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Desfazer' })));
    expect(await screen.findByTestId('card-historico')).toHaveTextContent('+ Esteira 15 min');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(await series.listarDaSessao(s.id)).toHaveLength(2);
  });

  it('"Desfazer" some depois de 8 s', async () => {
    const { s } = await treino(1, new Date(2026, 0, 5, 10));
    const exclusao = await sessoes.excluir(s.id);
    const { router } = abrir('/historico');
    await act(() => router.navigate('/historico', { state: { ...exclusao, em: Date.now() - 7990 } }));
    expect(await screen.findByRole('status')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });
});
