import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrir } from '../../test/abrir';
import { db } from '../../db/db';
import { workoutPlansRepository } from '../../db/repositories/workoutPlans';
import { workoutSessionsRepository as sessoes } from '../../db/repositories/workoutSessions';
import { exerciseSetsRepository as series } from '../../db/repositories/exerciseSets';
import { settingsRepository } from '../../db/repositories/settings';
import { exercisesRepository } from '../../db/repositories/exercises';

const doDia = async (d: number) => (await workoutPlansRepository.list()).find((p) => p.diaSemana === d)!;
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
    expect(screen.getByTestId('progresso')).toHaveTextContent('0 de 5');
    expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).not.toBeInTheDocument();
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

describe('navegação', () => {
  it('voltar (POP) entre visão geral e execução', async () => {
    await sessoes.iniciar((await doDia(1)).id);
    const { router } = abrir('/treinar');
    // A retomada automática leva à execução do exercício atual.
    expect(await titulo('Supino máquina')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: /Visão geral/ }));
    expect(await screen.findAllByTestId('item-sessao')).toHaveLength(5);
    fireEvent.click(within(screen.getAllByTestId('item-sessao')[1]!).getByRole('link', { name: /^(?!Editar).*Supino inclinado articulado/ }));
    expect(await titulo('Supino inclinado articulado')).toBeInTheDocument();

    await act(() => router.navigate(-1));
    expect(router.state.historyAction).toBe('POP');
    expect(router.state.location.pathname).toBe('/sessao');
    expect(await screen.findAllByTestId('item-sessao')).toHaveLength(5);
    await act(() => router.navigate(-1));
    expect(await titulo('Supino máquina')).toBeInTheDocument();
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

  it('sem descanso: só a linha "Descanso: 90 s · Alterar"; Alterar muda só o snapshot', async () => {
    const s = await sessoes.iniciar((await doDia(1)).id);
    const ex = s.planSnapshot.itens[0]!.exerciseId;
    abrir(`/sessao/${ex}`);
    await titulo('Supino máquina');
    expect(screen.queryByRole('region', { name: 'Cronômetro de descanso' })).not.toBeInTheDocument();
    expect(screen.getByTestId('linha-descanso')).toHaveTextContent('Descanso: 90 s · Alterar');
    fireEvent.click(screen.getByRole('button', { name: 'Alterar' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Tempo de descanso' })).getByRole('button', { name: '60s' }));
    await waitFor(() => expect(screen.getByTestId('linha-descanso')).toHaveTextContent('Descanso: 60 s'));
    expect((await sessoes.get(s.id))!.planSnapshot.itens[0]!.descansoSeg).toBe(60);
    expect((await doDia(1)).itens.find((i) => i.exerciseId === ex)!.descansoSeg).toBe(90);

    // Concluir a série mostra a contagem no rodapé com o descanso escolhido.
    fireEvent.change(screen.getByLabelText('Carga (kg)'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Concluir série' }));
    const contagem = await screen.findByRole('region', { name: 'Cronômetro de descanso' });
    expect(within(screen.getByTestId('rodape-execucao')).getByTestId('descanso')).toHaveTextContent(/^(1:01|1:00|0:59)$/);
    expect(within(contagem).getAllByRole('button').map((b) => b.textContent)).toEqual(['−15 s', 'Pular', '+15 s']);
  });

  it('aviso de notificações aparece uma única vez, só com a permissão pendente', async () => {
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() });
    try {
      const s = await sessoes.iniciar((await doDia(1)).id);
      const ex = s.planSnapshot.itens[0]!.exerciseId;
      const { unmount } = abrir(`/sessao/${ex}`);
      expect(await screen.findByTestId('aviso-notificacao')).toHaveTextContent('Configurações → Alertas de descanso');
      expect(screen.queryByRole('button', { name: /Permitir notificações/ })).not.toBeInTheDocument();
      await waitFor(async () => expect((await settingsRepository.get()).interface.avisoNotificacoesVisto).toBe(true));
      unmount();
      abrir(`/sessao/${ex}`);
      await titulo('Supino máquina');
      expect(screen.queryByTestId('aviso-notificacao')).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
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

    fireEvent.click(screen.getByRole('button', { name: 'Mais opções' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pausar' }));
    await waitFor(() => expect(travas[1]!.release).toHaveBeenCalled());
    expect(await screen.findByText('Tela sempre ligada: desligada')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retomar' }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    await screen.findByText('Tela sempre ligada: ativa');

    fireEvent.click(screen.getByRole('button', { name: 'Finalizar treino' }));
    fireEvent.click(await screen.findByRole('button', { name: '8' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar treino' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Hoje não' }));
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

describe('mudanças durante a sessão (3b.3)', () => {
  const finalizarCom = async (rpe: string) => {
    fireEvent.click(await screen.findByRole('button', { name: rpe }));
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar treino' }));
  };

  it('"Editar exercício" na visão geral e na execução abre o editor do exercício', async () => {
    const s = await sessoes.iniciar((await doDia(1)).id);
    const ex = s.planSnapshot.itens[0]!.exerciseId;
    abrir('/sessao');
    expect(await screen.findByRole('link', { name: 'Editar exercício Supino máquina' })).toHaveAttribute('href', `/exercicios/${ex}`);
    fireEvent.click(within(screen.getAllByTestId('item-sessao')[0]!).getByRole('link', { name: /^(?!Editar).*Supino máquina/ }));
    await titulo('Supino máquina');
    expect(screen.getByRole('link', { name: /Editar exercício/ })).toHaveAttribute('href', `/exercicios/${ex}`);
  });

  it('ajustar séries/reps muda só o snapshot; ao finalizar, aplica só as mudanças marcadas', async () => {
    const plano = await doDia(1);
    const s = await sessoes.iniciar(plano.id);
    const [a, b] = s.planSnapshot.itens;
    await sessoes.setDescansoItem(s.id, b!.exerciseId, 60);
    abrir(`/sessao/${a!.exerciseId}`);
    await titulo('Supino máquina');
    fireEvent.change(screen.getByLabelText('Nº de séries'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Máx. (reps)'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar ajuste' }));
    await waitFor(() => expect(screen.getByText('4× 10 a 15')).toBeInTheDocument());
    expect((await doDia(1)).itens[0]).toMatchObject({ series: 3, repsMax: 12 });

    fireEvent.click(screen.getByRole('link', { name: /Visão geral/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Finalizar treino' }));
    const grupo = await screen.findByRole('group', { name: 'Aplicar também na ficha?' });
    const caixas = within(grupo).getAllByRole('checkbox');
    expect(caixas.map((c) => c.closest('label')!.textContent)).toEqual([
      'Supino máquina: séries 3 → 4; reps 10–12 → 10–15',
      'Supino inclinado articulado: descanso 90 → 60 s',
    ]);
    fireEvent.click(caixas[0]!);
    await finalizarCom('8');
    await waitFor(async () => expect((await sessoes.get(s.id))!.status).toBe('concluida'));
    const depois = await doDia(1);
    expect(depois.itens[0]).toMatchObject({ exerciseId: a!.exerciseId, series: 4, repsMin: 10, repsMax: 15 });
    expect(depois.itens[1]!.descansoSeg).toBe(90);
  });

  it('limites da ficha valem no ajuste', async () => {
    const s = await sessoes.iniciar((await doDia(1)).id);
    const ex = s.planSnapshot.itens[0]!.exerciseId;
    await expect(sessoes.setPrescricaoItem(s.id, ex, { series: 11, repsMin: 10, repsMax: 12 })).rejects.toThrow('Séries');
    await expect(sessoes.setPrescricaoItem(s.id, ex, { series: 3, repsMin: 12, repsMax: 10 })).rejects.toThrow('Mínimo');
  });

  it('substituir exercício vale só para a sessão; aplicar troca o exercício na ficha', async () => {
    const plano = await doDia(1);
    const s = await sessoes.iniciar(plano.id);
    const ex = s.planSnapshot.itens[0]!.exerciseId;
    abrir(`/sessao/${ex}`);
    await titulo('Supino máquina');
    fireEvent.click(screen.getByRole('button', { name: /Substituir exercício/ }));
    const picker = await screen.findByRole('dialog', { name: 'Adicionar exercício' });
    fireEvent.change(within(picker).getByPlaceholderText('Buscar ou criar exercício'), { target: { value: 'Flexão' } });
    fireEvent.change(within(picker).getByLabelText('Grupo principal'), { target: { value: 'peito' } });
    fireEvent.click(within(picker).getByRole('button', { name: 'Criar "Flexão"' }));
    expect(await titulo('Flexão')).toBeInTheDocument();
    const novo = (await exercisesRepository.list()).find((e) => e.nome === 'Flexão')!;
    const snap = (await sessoes.get(s.id))!.planSnapshot.itens[0]!;
    expect(snap).toMatchObject({ exerciseId: novo.id, nome: 'Flexão', series: 3, substituiu: { exerciseId: ex, nome: 'Supino máquina' } });
    expect((await doDia(1)).itens[0]!.exerciseId).toBe(ex);

    fireEvent.click(screen.getByRole('link', { name: /Visão geral/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Finalizar treino' }));
    const caixa = within(await screen.findByRole('group', { name: 'Aplicar também na ficha?' })).getByRole('checkbox', { name: 'Supino máquina → Flexão' });
    fireEvent.click(caixa);
    await finalizarCom('5');
    await waitFor(async () => expect((await doDia(1)).itens[0]!.exerciseId).toBe(novo.id));
    expect((await sessoes.get(s.id))!.status).toBe('concluida');
  });

  it('substituir com séries feitas: original fica "trocado após N séries" e o substituto herda o restante', async () => {
    const plano = await doDia(1);
    const s = await sessoes.iniciar(plano.id);
    const [a, b] = s.planSnapshot.itens;
    const flexao = await exercisesRepository.create({
      nome: 'Flexão', tipo: 'peso_corporal', unidadeCarga: 'kg', grupoPrincipal: 'peito', gruposSecundarios: [], porLado: false,
    });
    await series.registrar({ sessionId: s.id, exerciseId: a!.exerciseId, carga: 40, reps: 10 });
    await sessoes.substituir(s.id, a!.exerciseId, flexao.id);
    const itens = (await sessoes.get(s.id))!.planSnapshot.itens;
    expect(itens.map((i) => [i.nome, i.ordem, i.series, i.trocadoApos])).toEqual([
      ['Supino máquina', 0, 3, 1],
      ['Flexão', 1, 2, undefined],
      [b!.nome, 2, 3, undefined],
      ...itens.slice(3).map((i) => [i.nome, i.ordem, i.series, undefined]),
    ]);
    expect(itens[1]!.substituiu).toEqual({ exerciseId: a!.exerciseId, nome: 'Supino máquina' });

    abrir('/');
    // Retomada vai para o substituto, não para o original trocado.
    expect(await titulo('Flexão')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: /Visão geral/ }));
    const lista = await screen.findAllByTestId('item-sessao');
    expect(lista).toHaveLength(6);
    expect(lista[0]).toHaveTextContent('Trocado após 1 série');
    expect(within(lista[0]!).queryByRole('button', { name: /Pular/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('progresso')).toHaveTextContent('0 de 6');
    fireEvent.click(within(lista[0]!).getByRole('link', { name: /^(?!Editar).*Supino máquina/ }));
    expect(await screen.findByTestId('aviso-trocado')).toHaveTextContent('Trocado após 1 série por Flexão.');
    expect(screen.getByRole('button', { name: 'Concluir série' })).toBeDisabled();

    // Aplicar na ficha: troca o exercício e mantém as 3 séries (1 feita + 2 herdadas).
    fireEvent.click(screen.getByRole('link', { name: /Visão geral/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Finalizar treino' }));
    const grupo = await screen.findByRole('group', { name: 'Aplicar também na ficha?' });
    expect(within(grupo).getAllByRole('checkbox').map((c) => c.closest('label')!.textContent)).toEqual(['Supino máquina → Flexão']);
    fireEvent.click(within(grupo).getByRole('checkbox'));
    await finalizarCom('6');
    await waitFor(async () => expect((await doDia(1)).itens[0]).toMatchObject({ exerciseId: flexao.id, series: 3 }));
    expect((await series.listarDaSessao(s.id)).map((x) => x.exerciseId)).toEqual([a!.exerciseId]);
  });

  it('exercício concluído ou já trocado não pode ser substituído', async () => {
    const s = await sessoes.iniciar((await doDia(1)).id);
    const [a, , c, d] = s.planSnapshot.itens;
    for (let k = 0; k < 3; k++) await series.registrar({ sessionId: s.id, exerciseId: a!.exerciseId, carga: 40, reps: 10 });
    await expect(sessoes.substituir(s.id, a!.exerciseId, c!.exerciseId)).rejects.toThrow('concluído');
    const flexao = await exercisesRepository.create({
      nome: 'Flexão', tipo: 'peso_corporal', unidadeCarga: 'kg', grupoPrincipal: 'peito', gruposSecundarios: [], porLado: false,
    });
    await series.registrar({ sessionId: s.id, exerciseId: d!.exerciseId, carga: 20, reps: 10 });
    await sessoes.substituir(s.id, d!.exerciseId, flexao.id);
    await expect(sessoes.substituir(s.id, d!.exerciseId, c!.exerciseId)).rejects.toThrow('já foi trocado');
  });

  it('editar a ficha durante o treino não gera item em "Aplicar também na ficha?"', async () => {
    const plano = await doDia(1);
    const s = await sessoes.iniciar(plano.id);
    const itens = plano.itens.map((i, k) => (k === 0 ? { ...i, series: 5, descansoSeg: 30 } : i));
    await workoutPlansRepository.update(plano.id, { itens });
    abrir('/sessao/finalizar');
    fireEvent.click(await screen.findByRole('button', { name: '7' }));
    expect(screen.queryByRole('group', { name: 'Aplicar também na ficha?' })).not.toBeInTheDocument();

    // Mudança na sessão aparece medida contra o início; aplicar não desfaz a edição da ficha nos outros campos.
    await sessoes.setPrescricaoItem(s.id, plano.itens[1]!.exerciseId, { series: 2, repsMin: 10, repsMax: 12 });
    const ini = (await sessoes.get(s.id))!.itensIniciais!;
    expect(ini[0]!.series).toBe(3);
  });

  it('sem mudanças não pergunta; RPE mostra a explicação ao tocar', async () => {
    await sessoes.iniciar((await doDia(1)).id);
    abrir('/sessao/finalizar');
    fireEvent.click(await screen.findByRole('button', { name: '7' }));
    expect(screen.getByTestId('descricao-rpe')).toHaveTextContent('7: Pesado, sobravam ~3 repetições.');
    fireEvent.click(screen.getByRole('button', { name: '10' }));
    expect(screen.getByTestId('descricao-rpe')).toHaveTextContent('Máximo, não saía mais nenhuma.');
    expect(screen.queryByRole('group', { name: 'Aplicar também na ficha?' })).not.toBeInTheDocument();
  });
});
