import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrir } from '../test/abrir';
import { db } from '../db/db';
import { workoutPlansRepository } from '../db/repositories/workoutPlans';
import { workoutSessionsRepository as sessoes } from '../db/repositories/workoutSessions';
import { cardioSessionsRepository as cardios } from '../db/repositories/cardioSessions';
import { settingsRepository } from '../db/repositories/settings';
import { cardioEsquecido, minutosEntre, validarCardio } from '../cardio';

/** AudioContext simulado: guarda o início de cada bipe (segundos a partir de currentTime = 0). */
let bipes: { inicio: number; parado: boolean }[] = [];
const ctx = {
  state: 'running' as AudioContextState,
  currentTime: 0,
  destination: {},
  resume: async () => {},
  createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (d: unknown) => d }),
  createDynamicsCompressor: () => ({ threshold: { value: 0 }, ratio: { value: 0 }, connect: (d: unknown) => d }),
  createOscillator() {
    const b = { inicio: NaN, parado: false };
    bipes.push(b);
    return {
      type: 'square',
      frequency: { value: 0 },
      connect: (g: unknown) => g,
      disconnect() {},
      start: (t: number) => void (b.inicio = t),
      stop: (t: number) => void (t === 0 && (b.parado = true)),
    };
  },
};
vi.stubGlobal('AudioContext', function AudioContext() { return ctx; });

const doDia = async (d: number) => (await workoutPlansRepository.list()).find((p) => p.diaSemana === d)!;

/** Treino concluído com o cardio aberto ("Sim"). */
async function treinoComCardio() {
  const s = await sessoes.iniciar((await doDia(1)).id);
  await sessoes.finalizar(s.id, { rpe: 7, observacoes: '' });
  await sessoes.iniciarCardio(s.id);
  return s;
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  bipes = [];
});
afterEach(() => vi.restoreAllMocks());

describe('regras do cardio', () => {
  it('valida e lê o número da inclinação ("nível 7" ≠ 7%)', () => {
    expect(validarCardio({ modalidade: 'esteira', duracaoMin: '15', inclinacao: 'nível 7', velocidade: '5,5', distancia: '', fc: '' })).toEqual({
      modalidade: 'esteira', duracaoMin: 15, velocidadeKmh: 5.5, inclinacaoNivel: { valor: 7, rotulo: 'nível 7' }, distanciaKm: null,
    });
    expect(() => validarCardio({ modalidade: 'esteira', duracaoMin: '0', inclinacao: '', velocidade: '', distancia: '', fc: '' })).toThrow('Duração');
    expect(() => validarCardio({ modalidade: 'esteira', duracaoMin: '15', inclinacao: 'alta', velocidade: '', distancia: '', fc: '' })).toThrow('Inclinação');
  });

  it('esquecido: fim (ou início, se parado) há mais de 3 h', () => {
    const h = 3_600_000;
    expect(cardioEsquecido({ desde: 0, iniciouEm: 0, fimEm: 15 * 60_000 }, 15 * 60_000 + 3 * h - 1)).toBe(false);
    expect(cardioEsquecido({ desde: 0, iniciouEm: 0, fimEm: 15 * 60_000 }, 15 * 60_000 + 3 * h + 1)).toBe(true);
    expect(cardioEsquecido({ desde: 0, iniciouEm: null, fimEm: null }, 3 * h + 1)).toBe(true);
    expect(minutosEntre(0, 7 * 60_000 + 20_000)).toBe(7);
  });
});

describe('cardio pós-treino', () => {
  it('"Hoje não" volta ao Início sem gravar cardio', async () => {
    const s = await sessoes.iniciar((await doDia(1)).id);
    const { router } = abrir('/sessao/finalizar');
    fireEvent.click(await screen.findByRole('button', { name: '7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar treino' }));
    const dlg = await screen.findByRole('dialog');
    expect(dlg).toHaveTextContent('Fazer cardio agora?');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Hoje não' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await cardios.list()).toEqual([]);
    expect((await sessoes.get(s.id))!.cardio).toBeUndefined();
  });

  it('"Sim" abre o cardio com o padrão; concluir grava com sessionId e aparece no Início', async () => {
    const s = await sessoes.iniciar((await doDia(1)).id);
    const { router } = abrir('/sessao/finalizar');
    fireEvent.click(await screen.findByRole('button', { name: '7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar treino' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sim' }));
    await screen.findByTestId('tela-cardio');
    expect(router.state.location.pathname).toBe(`/cardio/${s.id}`);
    expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Esteira' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Duração (min)')).toHaveValue('15');
    expect(screen.getByLabelText('Inclinação')).toHaveValue('nível 7');

    fireEvent.change(screen.getByLabelText('Velocidade (km/h)'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    expect(screen.getByTestId('descricao-rpe')).toHaveTextContent('Moderado');
    fireEvent.change(screen.getByRole('textbox', { name: 'Observações' }), { target: { value: ' leve ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Concluir cardio' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    const [c] = await cardios.list();
    expect(c).toMatchObject({
      sessionId: s.id, modalidade: 'esteira', duracaoMin: 15, velocidadeKmh: 6, inclinacaoNivel: { valor: 7, rotulo: 'nível 7' }, rpe: 5, observacoes: 'leve',
    });
    expect((await sessoes.get(s.id))!.cardio).toBeUndefined();
    expect(await screen.findByTestId('min-cardio')).toHaveTextContent('15');
  });

  it('cronômetro: horário final no banco, bipes agendados, recarregar retoma', async () => {
    const s = await treinoComCardio();
    const { unmount } = abrir(`/cardio/${s.id}`);
    fireEvent.change(await screen.findByLabelText('Duração (min)'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /Iniciar cronômetro/ }));
    expect(await screen.findByRole('region', { name: 'Cronômetro do cardio' })).toBeInTheDocument();
    const fim = (await sessoes.get(s.id))!.cardio!.fimEm!;
    expect(fim - Date.now()).toBeGreaterThan(55_000);
    // Mesmo alerta do descanso: aviso duplo aos 10 s, 3-2-1 e o final.
    expect(bipes.filter((b) => !b.parado).map((b) => Math.round(b.inicio))).toEqual([50, 50, 57, 58, 59, 60]);
    expect(screen.getByRole('button', { name: 'Parar' })).toBeInTheDocument();
    unmount();
    expect(bipes.filter((b) => !b.parado)).toEqual([]);

    abrir(`/cardio/${s.id}`);
    expect(await screen.findByRole('region', { name: 'Cronômetro do cardio' })).toBeInTheDocument();
    expect(screen.getByTestId('descanso')).toHaveTextContent(/^(1:00|0:59|0:58)$/);
  });

  it('no zero: "Tempo concluído", "Concluir cardio" destacado e sem contagem negativa', async () => {
    const s = await treinoComCardio();
    const t = Date.now();
    await sessoes.setCardio(s.id, { iniciouEm: t - 15 * 60_000, fimEm: t + 1500 });
    abrir(`/cardio/${s.id}`);
    expect(await screen.findByRole('region', { name: 'Cronômetro do cardio' })).toBeInTheDocument();
    expect(await screen.findByRole('status', {}, { timeout: 4000 })).toHaveTextContent('Tempo concluído');
    expect(screen.queryByRole('region', { name: 'Cronômetro do cardio' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Concluir cardio' })).toHaveAttribute('data-destaque', 'true');
    // O horário final continua salvo (não vira "parado") e a duração planejada vale.
    expect((await sessoes.get(s.id))!.cardio!.fimEm).toBe(t + 1500);
    fireEvent.click(screen.getByRole('button', { name: 'Concluir cardio' }));
    await waitFor(async () => expect((await cardios.list())[0]?.duracaoMin).toBe(15));
  });

  it('som desligado: nenhum bipe', async () => {
    const s = await treinoComCardio();
    const st = await settingsRepository.get();
    await settingsRepository.update({ interface: { ...st.interface, somDescanso: false } });
    abrir(`/cardio/${s.id}`);
    fireEvent.click(await screen.findByRole('button', { name: /Iniciar cronômetro/ }));
    await screen.findByRole('region', { name: 'Cronômetro do cardio' });
    expect(bipes).toEqual([]);
  });

  it('Parar antes do fim ajusta a duração para os minutos feitos', async () => {
    const s = await treinoComCardio();
    const t0 = Date.now();
    await sessoes.setCardio(s.id, { iniciouEm: t0 - 7 * 60_000 - 10_000, fimEm: t0 + 8 * 60_000 });
    abrir(`/cardio/${s.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Parar' }));
    await waitFor(() => expect(screen.getByLabelText('Duração (min)')).toHaveValue('7'));
    expect((await sessoes.get(s.id))!.cardio!.fimEm).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Concluir cardio' }));
    await waitFor(async () => expect((await cardios.list())[0]!.duracaoMin).toBe(7));
  });

  it('"Cancelar cardio" pede confirmação e não grava nada', async () => {
    const s = await treinoComCardio();
    const { router } = abrir(`/cardio/${s.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar cardio' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar cardio' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await cardios.list()).toEqual([]);
    expect((await sessoes.get(s.id))!.cardio).toBeUndefined();
    expect((await sessoes.get(s.id))!.status).toBe('concluida');
  });

  it('reabrir o app com cardio em curso volta para a tela de cardio', async () => {
    const s = await treinoComCardio();
    const { router } = abrir('/');
    await screen.findByTestId('tela-cardio');
    expect(router.state.location.pathname).toBe(`/cardio/${s.id}`);
  });
});

describe('cardio esquecido (> 3 h)', () => {
  const esquecer = async () => {
    const s = await treinoComCardio();
    const t = Date.now();
    await sessoes.setCardio(s.id, { iniciouEm: t - 15 * 60_000, fimEm: t });
    vi.spyOn(Date, 'now').mockReturnValue(t + 4 * 3_600_000);
    const app = abrir('/');
    const dlg = await screen.findByRole('dialog');
    expect(dlg).toHaveTextContent('mais de 3 horas');
    expect(within(dlg).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Concluir com a duração planejada', 'Concluir com outra duração', 'Cancelar cardio',
    ]);
    return { s, dlg, ...app };
  };

  it('concluir com a duração planejada', async () => {
    const { s, dlg } = await esquecer();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Concluir com a duração planejada' }));
    await waitFor(async () => expect(await cardios.list()).toHaveLength(1));
    expect((await cardios.list())[0]).toMatchObject({ sessionId: s.id, duracaoMin: 15, rpe: null });
    expect((await sessoes.get(s.id))!.cardio).toBeUndefined();
  });

  it('concluir com outra duração abre o campo', async () => {
    const { s, dlg, router } = await esquecer();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Concluir com outra duração' }));
    await screen.findByTestId('tela-cardio');
    expect(router.state.location.pathname).toBe(`/cardio/${s.id}`);
    const campo = screen.getByLabelText('Duração (min)');
    await waitFor(() => expect(campo).toHaveFocus());
    expect(campo).toBeEnabled();
    fireEvent.change(campo, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Concluir cardio' }));
    await waitFor(async () => expect((await cardios.list())[0]?.duracaoMin).toBe(12));
  });

  it('cancelar cardio', async () => {
    const { s, dlg } = await esquecer();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancelar cardio' }));
    await waitFor(async () => expect((await sessoes.get(s.id))!.cardio).toBeUndefined());
    expect(await cardios.list()).toEqual([]);
  });
});
