import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes, ROUTER_FUTURE } from '../../App';
import { db } from '../../db/db';
import { workoutPlansRepository } from '../../db/repositories/workoutPlans';
import { workoutSessionsRepository as sessoes } from '../../db/repositories/workoutSessions';
import { exerciseSetsRepository as series } from '../../db/repositories/exerciseSets';

const doDia = async (d: number) => (await workoutPlansRepository.list()).find((p) => p.diaSemana === d)!;
const abrir = (rota = '/') => render(<MemoryRouter initialEntries={[rota]} future={ROUTER_FUTURE}><AppRoutes /></MemoryRouter>);
const titulo = (nome: string) => screen.findByRole('heading', { level: 2, name: nome });

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('iniciar e retomar', () => {
  it('"Iniciar" na aba Treinar abre a visão geral da sessão', async () => {
    abrir('/treinar');
    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar Peito e tríceps' }));
    expect(await screen.findAllByTestId('item-sessao')).toHaveLength(5);
    expect(screen.getByTestId('progresso')).toHaveTextContent('0 de 5 exercícios concluídos');
    expect(screen.getAllByTestId('item-sessao')[0]).toHaveTextContent('3× 10 a 12 | sem registro');
  });

  it('aba Treinar: "Iniciar" primário em cada card, "Nova ficha" secundário no fim', async () => {
    abrir('/treinar');
    expect(await screen.findAllByRole('button', { name: /^Iniciar / })).toHaveLength(5);
    for (const b of screen.getAllByRole('button', { name: /^Iniciar / })) expect(b).toHaveClass('btn-primary');
    expect(screen.getByRole('link', { name: 'Nova ficha' })).toHaveClass('btn-secondary');
  });

  it('fechar o app no meio e reabrir retoma no exercício e na série certos', async () => {
    const s = await sessoes.iniciar((await doDia(1)).id);
    const ex = s.planSnapshot.itens[0]!.exerciseId;
    await series.registrar({ sessionId: s.id, exerciseId: ex, carga: 40, reps: 10 });
    abrir('/');
    expect(await titulo('Supino máquina')).toBeInTheDocument();
    expect(screen.getByLabelText('Série 1 concluída')).toBeInTheDocument();
    expect(screen.getByLabelText('Série 2')).toBeInTheDocument();
    // Campos vêm com a última carga e reps registradas.
    expect(screen.getByLabelText('Carga (kg)')).toHaveValue('40');
    expect(screen.getByLabelText('Repetições')).toHaveValue('10');
  });

  it('reabrir com o primeiro exercício completo abre o segundo', async () => {
    const s = await sessoes.iniciar((await doDia(1)).id);
    const ex = s.planSnapshot.itens[0]!.exerciseId;
    for (let k = 0; k < 3; k++) await series.registrar({ sessionId: s.id, exerciseId: ex, carga: 40, reps: 10 });
    abrir('/');
    expect(await titulo('Supino inclinado articulado')).toBeInTheDocument();
  });

  it('sessão esquecida (> 3 h) pergunta e pode finalizar no horário da última série', async () => {
    const s = await sessoes.iniciar((await doDia(1)).id);
    const ex = s.planSnapshot.itens[0]!.exerciseId;
    await series.registrar({ sessionId: s.id, exerciseId: ex, carga: 40, reps: 10 });
    const ultima = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(ultima + 4 * 3_600_000);
    try {
      abrir('/');
      const dlg = await screen.findByRole('dialog');
      expect(dlg).toHaveTextContent('mais de 3 horas');
      expect(within(dlg).getAllByRole('button').map((b) => b.textContent)).toEqual([
        'Finalizar no horário da última série', 'Retomar', 'Abandonar',
      ]);
      // Esc não fecha: a escolha é obrigatória.
      fireEvent(dlg, new Event('cancel', { cancelable: true }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      fireEvent.click(within(dlg).getByRole('button', { name: 'Finalizar no horário da última série' }));
      fireEvent.click(await screen.findByRole('button', { name: '7' }));
      fireEvent.click(screen.getByRole('button', { name: 'Finalizar treino' }));
      await waitFor(async () => expect((await sessoes.get(s.id))!.status).toBe('concluida'));
      const f = (await sessoes.get(s.id))!;
      expect(Date.parse(f.finalizadaEm!)).toBeLessThan(ultima + 1000);
      expect(f.duracaoAtivaSeg).toBeLessThan(5);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe('tela de execução', () => {
  it('toque duplo em "Concluir série" grava uma única série', async () => {
    const s = await sessoes.iniciar((await doDia(1)).id);
    const ex = s.planSnapshot.itens[0]!.exerciseId;
    abrir(`/sessao/${ex}`);
    await titulo('Supino máquina');
    fireEvent.change(screen.getByLabelText('Carga (kg)'), { target: { value: '22,5' } });
    const botao = screen.getByRole('button', { name: 'Concluir série' });
    fireEvent.click(botao);
    fireEvent.click(botao);
    expect(await screen.findByLabelText('Série 1 concluída')).toBeInTheDocument();
    const gravadas = await series.listarDaSessao(s.id);
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0]).toMatchObject({ carga: 22.5, reps: 10, numeroSerie: 1, lado: null });
    // Concluir a série inicia o descanso planejado do item.
    expect((await sessoes.get(s.id))!.restTimerEndsAt).toBeGreaterThan(Date.now());
  });

  it('desfazer última série remove a série (soft delete)', async () => {
    const s = await sessoes.iniciar((await doDia(1)).id);
    const ex = s.planSnapshot.itens[0]!.exerciseId;
    await series.registrar({ sessionId: s.id, exerciseId: ex, carga: 40, reps: 10 });
    abrir(`/sessao/${ex}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer última série' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Desfazer' }));
    await waitFor(async () => expect(await series.listarDaSessao(s.id)).toHaveLength(0));
  });

  it('exercício porLado usa o rótulo "Reps por lado" e não pede carga', async () => {
    const s = await sessoes.iniciar((await doDia(4)).id);
    const bird = s.planSnapshot.itens.find((i) => i.nome === 'Bird dog')!;
    abrir(`/sessao/${bird.exerciseId}`);
    await titulo('Bird dog');
    expect(screen.getByLabelText('Reps por lado')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Carga/)).not.toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('dor no peito');
  });

  it('pular na visão geral marca "Pulado" e conta no exercício atual', async () => {
    await sessoes.iniciar((await doDia(1)).id);
    abrir('/sessao');
    const [primeiro] = await screen.findAllByTestId('item-sessao');
    fireEvent.click(within(primeiro!).getByRole('button', { name: 'Pular' }));
    await waitFor(() => expect(screen.getAllByTestId('item-sessao')[0]).toHaveTextContent('Pulado'));
    expect(screen.getByText('Durante o treino')).toBeInTheDocument();
  });
});

describe('Wake Lock', () => {
  type Trava = { released: boolean; release: ReturnType<typeof vi.fn> };
  let travas: Trava[];
  const request = vi.fn(async () => {
    const t: Trava = { released: false, release: vi.fn(async () => void (t.released = true)) };
    travas.push(t);
    return t;
  });

  beforeEach(() => {
    travas = [];
    request.mockClear();
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  });
  afterEach(() => {
    delete (navigator as { wakeLock?: unknown }).wakeLock;
  });

  it('pedido ao iniciar, de novo no visibilitychange, liberado ao pausar e ao finalizar', async () => {
    await sessoes.iniciar((await doDia(1)).id);
    abrir('/sessao');
    expect(await screen.findByText('Tela sempre ligada: ativa')).toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(1);

    // O navegador solta a trava quando o app fica oculto; ao voltar, pede de novo.
    travas[0]!.released = true;
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    await waitFor(() => expect(travas[1]!.release).toHaveBeenCalled());
    expect(await screen.findByText('Tela sempre ligada: desligada')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retomar' }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(3));

    fireEvent.click(screen.getByRole('button', { name: 'Finalizar treino' }));
    fireEvent.click(await screen.findByRole('button', { name: '8' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar treino' }));
    await waitFor(() => expect(travas[2]!.release).toHaveBeenCalled());
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('sem suporte mostra "indisponível"', async () => {
    delete (navigator as { wakeLock?: unknown }).wakeLock;
    await sessoes.iniciar((await doDia(1)).id);
    abrir('/sessao');
    expect(await screen.findByText('Tela sempre ligada: indisponível')).toBeInTheDocument();
  });
});
