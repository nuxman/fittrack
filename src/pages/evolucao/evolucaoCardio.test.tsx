import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/db';
import { abrir } from '../../test/abrir';
import { cardioSessionsRepository as cardios } from '../../db/repositories/cardioSessions';
import { cardioPorModalidade, recordesCardio } from '../../cardio';
import type { CardioSession, ModalidadeCardio } from '../../db/types';

// O Recharts mede o contêiner com ResizeObserver, que o jsdom não tem.
class ResizeObserverFalso {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const QUARTA = new Date(2026, 0, 14, 10);

/** Cardio avulso em `data`, registrado às 8h desse dia. */
async function cardio(data: string, modalidade: ModalidadeCardio, extra: Partial<CardioSession> = {}) {
  vi.setSystemTime(new Date(`${data}T08:00`));
  const escada = modalidade === 'escada';
  const c = await cardios.registrarAvulso({
    modalidade, duracaoMin: 20, velocidadeKmh: escada ? null : 6, inclinacaoNivel: null, distanciaKm: escada ? null : 2, rpe: null, observacoes: '', data,
    ...extra,
  });
  vi.setSystemTime(QUARTA);
  return c;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(QUARTA);
  vi.stubGlobal('ResizeObserver', ResizeObserverFalso);
  await db.delete();
  await db.open();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('evolução do cardio: regras', () => {
  it('separa por modalidade (ordem da lista fixa) e ordena por data', async () => {
    await cardio('2026-01-12', 'esteira');
    await cardio('2026-01-05', 'escada', { andares: 30 });
    await cardio('2026-01-06', 'esteira');
    await cardio('2026-01-07', 'bicicleta');
    const g = cardioPorModalidade(await cardios.list());
    expect(g.map(([m, l]) => [m, l.map((c) => c.data)])).toEqual([
      ['esteira', ['2026-01-06', '2026-01-12']],
      ['bicicleta', ['2026-01-07']],
      ['escada', ['2026-01-05']],
    ]);
  });

  it('recordes: maior duração e distância; escada: duração e andares; empate fica com o primeiro', async () => {
    await cardio('2026-01-05', 'esteira', { duracaoMin: 30, distanciaKm: 3 });
    await cardio('2026-01-06', 'esteira', { duracaoMin: 30, distanciaKm: 2.5 });
    await cardio('2026-01-07', 'esteira', { duracaoMin: 25, distanciaKm: null });
    await cardio('2026-01-08', 'escada', { duracaoMin: 15, andares: 40 });
    await cardio('2026-01-09', 'escada', { duracaoMin: 20 });
    const g = new Map(cardioPorModalidade(await cardios.list()));
    const esteira = g.get('esteira');
    const escada = g.get('escada');
    expect(recordesCardio('esteira', esteira!)).toEqual([
      { rotulo: 'Maior duração', valor: 30, unidade: 'min', data: '2026-01-05' },
      { rotulo: 'Maior distância', valor: 3, unidade: 'km', data: '2026-01-05' },
    ]);
    expect(recordesCardio('escada', escada!)).toEqual([
      { rotulo: 'Maior duração', valor: 20, unidade: 'min', data: '2026-01-09' },
      { rotulo: 'Mais andares', valor: 40, unidade: 'andares', data: '2026-01-08' },
    ]);
    // Sem nenhum andar registrado: só o recorde de duração.
    expect(recordesCardio('escada', [escada![1]!]).map((r) => r.rotulo)).toEqual(['Maior duração']);
  });
});

describe('aba Evolução → Cardio', () => {
  const verCardio = async () => {
    const r = abrir('/evolucao');
    fireEvent.click(await screen.findByRole('button', { name: 'Cardio' }, { timeout: 5000 }));
    return r;
  };

  it('sem cardio: explica e oferece "Registrar cardio"; a escolha fica na URL', async () => {
    const { router } = await verCardio();
    expect(await screen.findByText(/duração, a distância e os recordes do seu cardio/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar cardio' })).toHaveAttribute('href', '/historico/cardio/novo');
    expect(router.state.location.search).toBe('?ver=cardio');
    expect(screen.getByRole('button', { name: 'Cardio' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Exercícios' }));
    expect(router.state.location.search).toBe('');
  });

  it('esteira: gráficos de duração, distância e velocidade; velocidade só das sessões com velocidade', async () => {
    await cardio('2026-01-05', 'esteira', { duracaoMin: 15, distanciaKm: 1.4, velocidadeKmh: 5.5, inclinacaoNivel: { valor: 7, rotulo: 'nível 7' } });
    await cardio('2026-01-08', 'esteira', { duracaoMin: 20, distanciaKm: 2, velocidadeKmh: null });
    await verCardio();
    const sec = await screen.findByRole('region', { name: 'Esteira' });
    expect(sec).toHaveTextContent('2 sessões');
    expect(within(sec).getByRole('figure', { name: 'Duração por sessão' })).toBeInTheDocument();
    expect(within(sec).getByRole('figure', { name: 'Distância por sessão' })).toBeInTheDocument();
    // Só uma sessão com velocidade: sem gráfico de velocidade.
    expect(within(sec).queryByRole('figure', { name: 'Velocidade média' })).not.toBeInTheDocument();
    const rec = within(sec).getAllByTestId('recorde-cardio');
    expect(rec[0]).toHaveTextContent('Maior duração: 20 min em 08/01');
    expect(rec[1]).toHaveTextContent('Maior distância: 2 km em 08/01');
    // Inclinação só na tabela (nível não é porcentagem).
    const linhas = within(within(sec).getByRole('table')).getAllByRole('row');
    expect(linhas[0]).toHaveTextContent('Inclinação');
    expect(linhas[1]).toHaveTextContent('08/0120 min2 km——');
    expect(linhas[2]).toHaveTextContent('05/0115 min1,4 km5,5 km/hnível 7');
  });

  it('escada: gráficos de duração e andares, sem distância e velocidade; recordes de duração e andares', async () => {
    await cardio('2026-01-05', 'escada', { duracaoMin: 15, andares: 40, inclinacaoNivel: { valor: 8, rotulo: 'nível 8' } });
    await cardio('2026-01-10', 'escada', { duracaoMin: 18, andares: 45 });
    await cardio('2026-01-12', 'esteira');
    await verCardio();
    const sec = await screen.findByRole('region', { name: 'Escada' });
    expect(within(sec).getByRole('figure', { name: 'Duração por sessão' })).toBeInTheDocument();
    expect(within(sec).getByRole('figure', { name: 'Andares por sessão' })).toBeInTheDocument();
    expect(within(sec).queryByRole('figure', { name: 'Distância por sessão' })).not.toBeInTheDocument();
    expect(within(sec).queryByRole('figure', { name: 'Velocidade média' })).not.toBeInTheDocument();
    expect(within(sec).getAllByTestId('recorde-cardio').map((r) => r.textContent)).toEqual([
      'Maior duração: 18 min em 10/01',
      'Mais andares: 45 andares em 10/01',
    ]);
    expect(within(within(sec).getByRole('table')).getAllByRole('row')[0]).toHaveTextContent('Nível');
    // Esteira com uma sessão só: recordes sem gráfico.
    const esteira = screen.getByRole('region', { name: 'Esteira' });
    expect(within(esteira).queryByRole('figure')).not.toBeInTheDocument();
    expect(esteira).toHaveTextContent('a partir da segunda sessão');
  });

  it('cardio ligado ao treino e avulso entram juntos; excluído não entra', async () => {
    const a = await cardio('2026-01-05', 'esteira');
    await cardio('2026-01-06', 'esteira');
    await cardios.create({ sessionId: 'treino-1', modalidade: 'esteira', duracaoMin: 15, velocidadeKmh: null, inclinacaoNivel: null, distanciaKm: null, rpe: null, observacoes: '', data: '2026-01-07' });
    await cardios.excluirAvulso(a.id);
    await verCardio();
    expect(await screen.findByRole('region', { name: 'Esteira' })).toHaveTextContent('2 sessões');
  });
});
