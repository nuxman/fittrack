import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { abrir } from '../test/abrir';
import { workoutPlansRepository } from '../db/repositories/workoutPlans';
import { workoutSessionsRepository as sessoes } from '../db/repositories/workoutSessions';
import { exerciseSetsRepository as series } from '../db/repositories/exerciseSets';

const doDia = async (d: number) => (await workoutPlansRepository.list()).find((p) => p.diaSemana === d)!;

/** Treino de segunda concluído em `em`, com séries de 10 reps do primeiro exercício (Supino máquina, kg). */
async function treinar(em: Date, cargas: number[]) {
  vi.setSystemTime(em);
  const s = await sessoes.iniciar((await doDia(1)).id);
  for (const carga of cargas) await series.registrar({ sessionId: s.id, exerciseId: s.planSnapshot.itens[0]!.exerciseId, carga, reps: 10 });
  vi.setSystemTime(new Date(em.getTime() + 30 * 60_000));
  await sessoes.finalizar(s.id, { rpe: 7, observacoes: '' });
}

// O Recharts mede o contêiner com ResizeObserver, que o jsdom não tem.
class ResizeObserverFalso {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.stubGlobal('ResizeObserver', ResizeObserverFalso);
  await db.delete();
  await db.open();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('aba Evolução', () => {
  it('sem treinos: explica o que vai aparecer', async () => {
    abrir('/evolucao');
    expect(await screen.findByText(/evolução de carga, volume e recordes/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para Treinar' })).toBeInTheDocument();
  });

  it('lista os exercícios com séries e abre recordes, gráficos e tabela', async () => {
    await treinar(new Date(2026, 0, 5, 10), [40, 45]);
    await treinar(new Date(2026, 0, 12, 10), [42, 42]);
    abrir('/evolucao');
    const itens = await screen.findAllByTestId('item-evolucao');
    expect(itens).toHaveLength(1);
    expect(itens[0]).toHaveTextContent('Supino máquina');
    expect(itens[0]).toHaveTextContent('2 treinos · último em 12/01');

    fireEvent.click(itens[0]!);
    // Primeira carga sob demanda do Recharts no jsdom pode passar de 1 s.
    expect(await screen.findByRole('heading', { level: 1, name: 'Supino máquina' }, { timeout: 5000 })).toBeInTheDocument();
    const rec = screen.getAllByTestId('recorde');
    expect(rec[0]).toHaveTextContent('Maior carga: 45 kg × 10 em 05/01');
    expect(rec[1]).toHaveTextContent('Maior volume: 850 kg em 05/01');
    expect(screen.getByRole('figure', { name: 'Carga máxima por treino' })).toBeInTheDocument();
    expect(screen.getByRole('figure', { name: 'Volume por treino' })).toBeInTheDocument();

    const linhas = within(screen.getByRole('table')).getAllByRole('row');
    expect(linhas[1]).toHaveTextContent('12/0142 kg840 kg');
    expect(linhas[2]).toHaveTextContent('05/0145 kg850 kg');
  });

  it('com um treino só: recordes sem gráfico', async () => {
    await treinar(new Date(2026, 0, 5, 10), [40]);
    abrir('/evolucao');
    fireEvent.click((await screen.findAllByTestId('item-evolucao'))[0]!);
    expect(await screen.findByText(/a partir do segundo treino/, undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
  });
});
