import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { abrir } from '../test/abrir';
import { workoutPlansRepository } from '../db/repositories/workoutPlans';
import { workoutSessionsRepository as sessoes } from '../db/repositories/workoutSessions';
import { exerciseSetsRepository as series } from '../db/repositories/exerciseSets';
import { exercisesRepository } from '../db/repositories/exercises';

const doDia = async (d: number) => (await workoutPlansRepository.list()).find((p) => p.diaSemana === d)!;

/** Treino de segunda concluído em `em`, com séries de 10 reps do primeiro exercício (Supino máquina, kg). */
async function treinar(em: Date, cargas: number[], { abandonar = false } = {}) {
  vi.setSystemTime(em);
  const s = await sessoes.iniciar((await doDia(1)).id);
  for (const carga of cargas) await series.registrar({ sessionId: s.id, exerciseId: s.planSnapshot.itens[0]!.exerciseId, carga, reps: 10 });
  vi.setSystemTime(new Date(em.getTime() + 30 * 60_000));
  if (abandonar) await sessoes.abandonar(s.id);
  else await sessoes.finalizar(s.id, { rpe: 7, observacoes: '' });
  return s;
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

describe('comparação no detalhe do Histórico', () => {
  it('mostra o treino concluído anterior da mesma ficha, por exercício e no volume (abandonado não conta)', async () => {
    await treinar(new Date(2026, 0, 5, 10), [40, 40]);
    await treinar(new Date(2026, 0, 9, 10), [99], { abandonar: true });
    const atual = await treinar(new Date(2026, 0, 12, 10), [42.5, 40]);
    abrir(`/historico/${atual.id}`);
    expect(await screen.findByTestId('comparacao-treino')).toHaveTextContent('Comparado a 05/01: volume +25 kg');
    const [supino] = screen.getAllByTestId('comparacao-exercicio');
    expect(supino).toHaveTextContent('Em 05/01: 40 kg × 10 · volume 800 kg → carga +2,5 kg · volume +25 kg');
  });

  it('primeiro treino da ficha: avisa que não há anterior', async () => {
    const s = await treinar(new Date(2026, 0, 5, 10), [40]);
    abrir(`/historico/${s.id}`);
    expect(await screen.findByTestId('comparacao-treino')).toHaveTextContent('sem treino anterior para comparar');
    expect(screen.queryByTestId('comparacao-exercicio')).not.toBeInTheDocument();
  });
});

describe('mini gráfico "Evolução de carga"', () => {
  it('detalhe do exercício: recolhido, carrega só ao abrir e liga à Evolução', async () => {
    await treinar(new Date(2026, 0, 5, 10), [40]);
    await treinar(new Date(2026, 0, 12, 10), [45]);
    const ex = (await exercisesRepository.findByName('Supino máquina'))!;
    abrir(`/exercicio/${ex.id}`);
    const resumo = await screen.findByText('Evolução de carga');
    expect(resumo.closest('details')).not.toHaveAttribute('open');
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();

    resumo.closest('details')!.open = true;
    fireEvent(resumo.closest('details')!, new Event('toggle'));
    expect(await screen.findByRole('figure', { name: 'Carga máxima por treino' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver evolução completa' })).toHaveAttribute('href', `/evolucao/${ex.id}`);
  });

  it('execução: seção recolhida; com um treino só, explica em vez do gráfico', async () => {
    await treinar(new Date(2026, 0, 5, 10), [40]);
    vi.setSystemTime(new Date(2026, 0, 12, 10));
    const s = await sessoes.iniciar((await doDia(1)).id);
    abrir(`/sessao/${s.planSnapshot.itens[0]!.exerciseId}`);
    const resumo = await screen.findByText('Evolução de carga');
    const det = resumo.closest('details')!;
    expect(det).not.toHaveAttribute('open');
    det.open = true;
    fireEvent(det, new Event('toggle'));
    expect(await screen.findByTestId('mini-grafico-vazio', undefined, { timeout: 5000 })).toHaveTextContent('a partir do segundo treino');
  });
});
