import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { abrir } from '../test/abrir';
import { equipmentRepository as aparelhos, AparelhoEmUsoError } from '../db/repositories/equipment';
import { exercisesRepository } from '../db/repositories/exercises';
import { restDaysRepository } from '../db/repositories/restDays';
import { workoutPlansRepository } from '../db/repositories/workoutPlans';
import { workoutSessionsRepository as sessoes } from '../db/repositories/workoutSessions';
import { cardioSessionsRepository } from '../db/repositories/cardioSessions';
import { sugestao } from '../semana';

// Quarta-feira, 7 de janeiro de 2026, 10h (semana de 5 a 11).
const QUARTA = new Date(2026, 0, 7, 10);
const exercicio = async (nome: string) => (await exercisesRepository.list()).find((e) => e.nome === nome)!;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(QUARTA);
  await db.delete();
  await db.open();
});
afterEach(() => vi.useRealTimers());

describe('aparelhos', () => {
  it('exclusão bloqueada enquanto um exercício usa o aparelho; mostra quais', async () => {
    const a = await aparelhos.create({ nome: 'Leg press 45°', observacoes: '' });
    const leg = await exercicio('Leg press');
    await exercisesRepository.update(leg.id, { equipmentId: a.id });
    await expect(aparelhos.remove(a.id)).rejects.toThrow(AparelhoEmUsoError);
    await expect(aparelhos.remove(a.id)).rejects.toThrow('Usado em: Leg press');

    abrir(`/aparelhos/${a.id}`);
    fireEvent.click(await screen.findByRole('button', { name: /Excluir aparelho/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Excluir aparelho' }));
    expect(await screen.findByRole('dialog', { name: 'Aparelho em uso' })).toHaveTextContent('Leg press');
    expect(await aparelhos.get(a.id)).toBeDefined();

    // Tirar o aparelho do exercício libera a exclusão.
    await exercisesRepository.update(leg.id, { equipmentId: undefined });
    await aparelhos.remove(a.id);
    expect(await aparelhos.list()).toHaveLength(0);
  });

  it('criar pela tela, escolher no editor de exercício e ver no detalhe', async () => {
    const { router } = abrir('/configuracoes');
    fireEvent.click(await screen.findByRole('link', { name: /Aparelhos/ }));
    fireEvent.click(await screen.findByRole('link', { name: /Novo aparelho/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o nome do aparelho');
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: '  Polia   alta ' } });
    fireEvent.change(screen.getByLabelText('Observações'), { target: { value: 'Estação dupla' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByTestId('item-aparelho')).toHaveTextContent('Polia alta');

    const corda = await exercicio('Tríceps corda');
    await act(() => router.navigate(`/exercicios/${corda.id}`));
    fireEvent.change(await screen.findByLabelText('Aparelho (opcional)'), { target: { value: (await aparelhos.list())[0]!.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(async () => expect((await exercicio('Tríceps corda')).equipmentId).toBeDefined());

    await act(() => router.navigate(`/exercicio/${corda.id}`));
    expect(await screen.findByTestId('aparelho')).toHaveTextContent('Aparelho: Polia alta · Estação dupla');
  });
});

describe('dia de descanso', () => {
  it('"Marcar hoje como descanso" grava o RestDay, mostra o ícone na faixa e tocar de novo desmarca', async () => {
    abrir('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar hoje como descanso' }));
    expect(await screen.findByLabelText(/^Quarta 7, descanso, hoje/)).toBeInTheDocument();
    const obs = screen.getByLabelText('Observação do descanso (opcional)');
    fireEvent.change(obs, { target: { value: 'Dor muscular' } });
    fireEvent.blur(obs);
    await waitFor(async () => expect((await restDaysRepository.doDia('2026-01-07'))?.observacoes).toBe('Dor muscular'));

    fireEvent.click(screen.getByRole('button', { name: 'Desmarcar descanso' }));
    expect(await screen.findByRole('button', { name: 'Marcar hoje como descanso' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Quarta 7, hoje/)).toBeInTheDocument();
    expect(await restDaysRepository.doDia('2026-01-07')).toBeUndefined();
  });

  it('não aparece com cardio hoje nem com treino concluído hoje', async () => {
    await cardioSessionsRepository.create({
      modalidade: 'esteira', duracaoMin: 15, velocidadeKmh: null, inclinacaoNivel: null, distanciaKm: null, rpe: null, observacoes: '', data: '2026-01-07',
    });
    abrir('/');
    expect(await screen.findByTestId('min-cardio')).toHaveTextContent('15');
    expect(screen.queryByRole('button', { name: 'Marcar hoje como descanso' })).not.toBeInTheDocument();
  });

  it('RestDay não mexe nas pendências', async () => {
    const planos = await workoutPlansRepository.list();
    const antes = sugestao(planos, await sessoes.list(), 'academia', QUARTA);
    await restDaysRepository.alternar('2026-01-05');
    await restDaysRepository.alternar('2026-01-06');
    await restDaysRepository.alternar('2026-01-07');
    expect(sugestao(planos, await sessoes.list(), 'academia', QUARTA)).toEqual(antes);
    expect(antes).toMatchObject({ tipo: 'pendente', plano: { diaSemana: 1 } });
  });
});
