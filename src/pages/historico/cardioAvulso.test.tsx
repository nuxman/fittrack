import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/db';
import { abrir } from '../../test/abrir';
import { workoutPlansRepository } from '../../db/repositories/workoutPlans';
import { workoutSessionsRepository as sessoes } from '../../db/repositories/workoutSessions';
import { exerciseSetsRepository as series } from '../../db/repositories/exerciseSets';
import { cardioSessionsRepository as cardios } from '../../db/repositories/cardioSessions';
import { carregarPainel } from '../../painel';
import { contadorSemana, pendentes } from '../../semana';

// Quarta-feira, 7 de janeiro de 2026, 10h (semana de 5 a 11).
const QUARTA = new Date(2026, 0, 7, 10);
const doDia = async (d: number) => (await workoutPlansRepository.list()).find((p) => p.diaSemana === d)!;
const avulso = (data: string, duracaoMin = 30) =>
  cardios.registrarAvulso({ modalidade: 'caminhada', duracaoMin, velocidadeKmh: null, inclinacaoNivel: null, distanciaKm: 2.5, rpe: 4, observacoes: '', data });

/** Treino de segunda concluído agora, com uma série. */
async function treinoDeSegunda() {
  const s = await sessoes.iniciar((await doDia(1)).id);
  await series.registrar({ sessionId: s.id, exerciseId: s.planSnapshot.itens[0]!.exerciseId, carga: 40, reps: 10 });
  await sessoes.finalizar(s.id, { rpe: 6, observacoes: '' });
  return s;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(QUARTA);
  await db.delete();
  await db.open();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('cardio avulso: regras', () => {
  it('conta nos minutos e no check da faixa, mas não no "X de Y" nem nas pendências', async () => {
    await avulso('2026-01-06', 40); // terça, dia com ficha de academia
    const p = await carregarPainel();
    expect(contadorSemana(p.planos, p.sessoes, QUARTA)).toEqual({ feitos: 0, planejados: 5 });
    expect(pendentes(p.planos, p.sessoes, 'academia', QUARTA).map((x) => x.diaSemana)).toEqual([1, 2]);

    abrir('/');
    expect(await screen.findByTestId('min-cardio')).toHaveTextContent('40');
    expect(screen.getByLabelText(/^Terça 6, treino feito/)).toBeInTheDocument();
    expect(screen.getByTestId('contador-semana')).toHaveTextContent('0 de 5 treinos esta semana');
    expect((await screen.findAllByTestId('card-ficha'))[0]).toHaveTextContent('Pendente de segunda');
  });

  it('cardio avulso hoje não vira "Treino de hoje concluído"', async () => {
    await avulso('2026-01-07');
    abrir('/');
    expect((await screen.findAllByTestId('card-ficha'))[0]).toHaveTextContent('Pendente de segunda');
    expect(screen.queryByTestId('concluido-hoje')).not.toBeInTheDocument();
  });

  it('valida duração, data futura e RPE', async () => {
    await expect(avulso('2026-01-07', 0)).rejects.toThrow('Duração (min): de 1 a 300');
    await expect(avulso('2026-01-08')).rejects.toThrow('A data não pode ser no futuro');
    await expect(
      cardios.registrarAvulso({ modalidade: 'esteira', duracaoMin: 10, velocidadeKmh: null, inclinacaoNivel: null, distanciaKm: null, rpe: 11, observacoes: '', data: '2026-01-07' }),
    ).rejects.toThrow('RPE deve ser de 0 a 10');
  });

  it('cardio ligado a treino não é excluído sozinho; a edição mantém a data do treino', async () => {
    const s = await treinoDeSegunda();
    const c = await cardios.create({ sessionId: s.id, modalidade: 'esteira', duracaoMin: 15, velocidadeKmh: null, inclinacaoNivel: null, distanciaKm: null, rpe: null, observacoes: '', data: '2026-01-07' });
    await expect(cardios.excluirAvulso(c.id)).rejects.toThrow('junto com o treino');
    const dados = { modalidade: 'esteira' as const, duracaoMin: 20, velocidadeKmh: null, inclinacaoNivel: null, distanciaKm: null, rpe: 5, observacoes: '' };
    expect(await cardios.editar(c.id, { ...dados, fcMedia: 120, data: '2026-01-05' })).toMatchObject({ duracaoMin: 20, data: '2026-01-07', fcMedia: 120, sessionId: s.id });
    expect(await cardios.editar(c.id, dados)).not.toHaveProperty('fcMedia');
  });
});

describe('cardio avulso: telas', () => {
  it('"Registrar cardio" na aba Treinar: valores do cardio padrão, grava e aparece no Histórico', async () => {
    const { router } = abrir('/treinar');
    fireEvent.click(await screen.findByRole('link', { name: 'Registrar cardio' }));
    expect(await screen.findByRole('heading', { name: 'Registrar cardio' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Esteira' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Duração (min)')).toHaveValue('15');
    expect(screen.getByLabelText('Inclinação')).toHaveValue('nível 7');
    expect(screen.getByLabelText('Data')).toHaveValue('2026-01-07');
    expect(screen.queryByRole('button', { name: /Iniciar cronômetro/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Bicicleta' }));
    fireEvent.change(screen.getByLabelText('Duração (min)'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Distância (km)'), { target: { value: '8,5' } });
    fireEvent.click(screen.getByRole('button', { name: '6' }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar cardio' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/treinar'));
    const [c] = await cardios.list();
    expect(c).toMatchObject({ modalidade: 'bicicleta', duracaoMin: 25, distanciaKm: 8.5, rpe: 6, data: '2026-01-07' });
    expect(c).not.toHaveProperty('sessionId');

    await act(() => router.navigate('/historico'));
    expect(await screen.findByTestId('card-cardio')).toHaveTextContent('Bicicleta');
    expect(screen.getByTestId('card-cardio')).toHaveTextContent('25 min · 8,5 km');
  });

  it('escada avulsa: grava e edita sem velocidade e distância; card "Escada · 20 min · 45 andares"', async () => {
    const { router } = abrir('/historico/cardio/novo');
    fireEvent.change(await screen.findByLabelText('Distância (km)'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Escada' }));
    fireEvent.change(screen.getByLabelText('Duração (min)'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Nível'), { target: { value: 'nível 8' } });
    fireEvent.change(screen.getByLabelText('Andares'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar cardio' }));
    await vi.waitFor(async () => expect(await cardios.list()).toHaveLength(1));
    const [c] = await cardios.list();
    expect(c).toMatchObject({ modalidade: 'escada', duracaoMin: 20, andares: 45, velocidadeKmh: null, distanciaKm: null });

    await act(() => router.navigate('/historico'));
    expect(await screen.findByTestId('card-cardio')).toHaveTextContent('Escada');
    expect(screen.getByTestId('card-cardio')).toHaveTextContent('20 min · 45 andares');

    // Editar: os campos de escada vêm preenchidos; apagar os andares tira do registro e do card.
    fireEvent.click(screen.getByTestId('card-cardio'));
    const andares = await screen.findByLabelText('Andares');
    expect(andares).toHaveValue('45');
    expect(screen.queryByLabelText('Velocidade (km/h)')).not.toBeInTheDocument();
    fireEvent.change(andares, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await vi.waitFor(async () => expect(await cardios.get(c!.id)).not.toHaveProperty('andares'));
    expect(await screen.findByTestId('card-cardio')).toHaveTextContent(/20 min$/);

    // Trocar a escada por esteira na edição: andares não são gravados.
    await cardios.editar(c!.id, { modalidade: 'escada', duracaoMin: 20, velocidadeKmh: null, inclinacaoNivel: null, distanciaKm: null, andares: 30, rpe: null, observacoes: '' });
    fireEvent.click(screen.getByTestId('card-cardio'));
    fireEvent.click(await screen.findByRole('button', { name: 'Esteira' }));
    expect(screen.queryByLabelText('Andares')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Distância (km)'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await vi.waitFor(async () => expect(await cardios.get(c!.id)).toMatchObject({ modalidade: 'esteira', distanciaKm: 2 }));
    expect(await cardios.get(c!.id)).not.toHaveProperty('andares');
  });

  it('elíptico avulso: grava com velocidade, nível e distância; card "Elíptico · 20 min · 3,1 km"; edita e troca de modalidade', async () => {
    const { router } = abrir('/historico/cardio/novo');
    // Vindo da escada, os andares são limpos ao escolher o elíptico.
    fireEvent.click(await screen.findByRole('button', { name: 'Escada' }));
    fireEvent.change(screen.getByLabelText('Andares'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Elíptico' }));
    expect(screen.queryByLabelText('Andares')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Elíptico' })).toHaveAttribute('aria-pressed', 'true');
    const nivel = screen.getByLabelText('Nível');
    expect(nivel).toHaveAttribute('placeholder', 'ex.: "nível 10"');
    fireEvent.change(screen.getByLabelText('Duração (min)'), { target: { value: '20' } });
    fireEvent.change(nivel, { target: { value: 'nível 10' } });
    fireEvent.change(screen.getByLabelText('Velocidade (km/h)'), { target: { value: '9,3' } });
    fireEvent.change(screen.getByLabelText('Distância (km)'), { target: { value: '3,1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar cardio' }));
    await vi.waitFor(async () => expect(await cardios.list()).toHaveLength(1));
    const [c] = await cardios.list();
    expect(c).toMatchObject({ modalidade: 'eliptico', duracaoMin: 20, velocidadeKmh: 9.3, distanciaKm: 3.1, inclinacaoNivel: { valor: 10, rotulo: 'nível 10' } });
    expect(c).not.toHaveProperty('andares');

    await act(() => router.navigate('/historico'));
    expect(await screen.findByTestId('card-cardio')).toHaveTextContent('Elíptico');
    expect(screen.getByTestId('card-cardio')).toHaveTextContent('20 min · 3,1 km');

    // Editar: campos preenchidos; mudar a distância muda o card.
    fireEvent.click(screen.getByTestId('card-cardio'));
    expect(await screen.findByLabelText('Velocidade (km/h)')).toHaveValue('9,3');
    expect(screen.getByLabelText('Nível')).toHaveValue('nível 10');
    fireEvent.change(screen.getByLabelText('Distância (km)'), { target: { value: '3,4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await vi.waitFor(async () => expect(await cardios.get(c!.id)).toMatchObject({ distanciaKm: 3.4 }));
    expect(await screen.findByTestId('card-cardio')).toHaveTextContent('20 min · 3,4 km');

    // Trocar para escada: velocidade e distância não são gravadas.
    fireEvent.click(screen.getByTestId('card-cardio'));
    fireEvent.click(await screen.findByRole('button', { name: 'Escada' }));
    expect(screen.queryByLabelText('Distância (km)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await vi.waitFor(async () => expect(await cardios.get(c!.id)).toMatchObject({ modalidade: 'escada', velocidadeKmh: null, distanciaKm: null }));
  });

  it('o banco recusa escada com distância e andares fora da escada', async () => {
    const base = { duracaoMin: 20, velocidadeKmh: null, inclinacaoNivel: null, rpe: null, observacoes: '', data: '2026-01-07' };
    await expect(cardios.registrarAvulso({ ...base, modalidade: 'escada', distanciaKm: 1 })).rejects.toThrow('Escada não tem');
    await expect(cardios.registrarAvulso({ ...base, modalidade: 'esteira', distanciaKm: null, andares: 10 })).rejects.toThrow('andares só na escada');
    await expect(cardios.registrarAvulso({ ...base, modalidade: 'eliptico', distanciaKm: null, andares: 10 })).rejects.toThrow('andares só na escada');
  });

  it('erro de validação aparece na tela, sem gravar', async () => {
    abrir('/historico/cardio/novo');
    fireEvent.change(await screen.findByLabelText('Duração (min)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar cardio' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe a duração');
    expect(await cardios.list()).toHaveLength(0);
  });

  it('editar a duração muda os minutos da semana; excluir e desfazer refletem no Início', async () => {
    const c = await avulso('2026-01-06', 30);
    const { router } = abrir('/historico');
    fireEvent.click(await screen.findByTestId('card-cardio'));
    const dur = await screen.findByLabelText('Duração (min)');
    expect(dur).toHaveValue('30');
    fireEvent.change(dur, { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/historico'));
    expect((await cardios.get(c.id))!.duracaoMin).toBe(45);

    fireEvent.click(await screen.findByTestId('card-cardio'));
    fireEvent.click(await screen.findByRole('button', { name: /Excluir cardio/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Excluir cardio' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Cardio excluído');
    expect(screen.queryByTestId('card-cardio')).not.toBeInTheDocument();
    expect(await cardios.list()).toHaveLength(0);
    expect((await carregarPainel()).cardio).toHaveLength(0);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Desfazer' })));
    expect(await screen.findByTestId('card-cardio')).toBeInTheDocument();
    await act(() => router.navigate('/'));
    expect(await screen.findByTestId('min-cardio')).toHaveTextContent('45');
    expect(screen.getByLabelText(/^Terça 6, treino feito/)).toBeInTheDocument();
  });

  it('cardio ligado ao treino é editável pelo detalhe do treino, sem data nem "Excluir"', async () => {
    const s = await treinoDeSegunda();
    const c = await cardios.create({
      sessionId: s.id, modalidade: 'esteira', duracaoMin: 15, velocidadeKmh: 5.5, inclinacaoNivel: { valor: 7, rotulo: 'nível 7' },
      distanciaKm: null, rpe: null, observacoes: '', data: '2026-01-07',
    });
    abrir(`/historico/${s.id}`);
    fireEvent.click(await screen.findByRole('link', { name: 'Editar cardio: + Esteira 15 min' }));
    expect(await screen.findByLabelText('Velocidade (km/h)')).toHaveValue('5,5');
    expect(screen.queryByLabelText('Data')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Excluir cardio/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Duração (min)'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('link', { name: 'Editar cardio: + Esteira 20 min' })).toBeInTheDocument();
    expect((await cardios.get(c.id))!.duracaoMin).toBe(20);
  });
});
