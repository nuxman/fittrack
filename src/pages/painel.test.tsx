import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { abrir } from '../test/abrir';
import { workoutPlansRepository } from '../db/repositories/workoutPlans';
import { workoutSessionsRepository as sessoes } from '../db/repositories/workoutSessions';
import { exerciseSetsRepository as series } from '../db/repositories/exerciseSets';
import { exercisesRepository } from '../db/repositories/exercises';
import { cardioSessionsRepository } from '../db/repositories/cardioSessions';
import { settingsRepository } from '../db/repositories/settings';

// Quarta-feira, 7 de janeiro de 2026, 10h (semana de 5 a 11).
const QUARTA = new Date(2026, 0, 7, 10);
const doDia = async (d: number) => (await workoutPlansRepository.list()).find((p) => p.diaSemana === d && p.local === 'academia')!;

/** Sessão concluída em `em` com o RPE dado. */
async function concluir(diaSemana: number, em: Date, rpe = 6) {
  vi.setSystemTime(em);
  const s = await sessoes.iniciar((await doDia(diaSemana)).id);
  await series.registrar({ sessionId: s.id, exerciseId: s.planSnapshot.itens[0]!.exerciseId, carga: 40, reps: 10 });
  vi.setSystemTime(new Date(em.getTime() + 30 * 60_000));
  await sessoes.finalizar(s.id, { rpe, observacoes: '' });
}

beforeEach(async () => {
  // Só o Date é falso: timers reais para o IndexedDB e o React.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(QUARTA);
  await db.delete();
  await db.open();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Início', () => {
  it('falta na terça: card "Pendente de terça" com a ficha de hoje como segunda opção', async () => {
    await concluir(1, new Date(2026, 0, 5, 10));
    vi.setSystemTime(QUARTA);
    abrir('/');
    const cards = await screen.findAllByTestId('card-ficha');
    expect(cards[0]).toHaveTextContent('Pendente de terça');
    expect(cards[0]).toHaveTextContent('Pernas A e abdômen');
    expect(cards[1]).toHaveTextContent('Treino de hoje');
    expect(cards[1]).toHaveTextContent('Costas e bíceps');
    expect(screen.getByTestId('contador-semana')).toHaveTextContent('1 de 5 treinos esta semana');
    // Miniaturas de todos os exercícios da ficha sugerida.
    expect(within(cards[0]!).getAllByRole('link', { name: /.+/ }).filter((l) => l.getAttribute('href')?.includes('/exercicio/'))).toHaveLength(5);
    expect(screen.getByTestId('min-musculacao')).toHaveTextContent('30');
    expect(screen.getByTestId('ultimo-treino')).toHaveTextContent('400 kg de volume');
  });

  it('minutos de cardio lidos das CardioSession da semana; check no dia', async () => {
    await cardioSessionsRepository.create({
      modalidade: 'esteira', duracaoMin: 15, velocidadeKmh: null, inclinacaoNivel: null, distanciaKm: null, rpe: null, observacoes: '', data: '2026-01-06',
    });
    abrir('/');
    expect(await screen.findByTestId('min-cardio')).toHaveTextContent('15');
    expect(screen.getByLabelText(/^Terça 6, treino feito/)).toBeInTheDocument();
  });

  it('Casa sem fichas: "Criar ficha de casa"; a escolha vale só para hoje', async () => {
    abrir('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Casa' }));
    expect(await screen.findByRole('link', { name: /Criar ficha de casa/ })).toHaveAttribute('href', '/fichas/nova?local=casa');
    expect((await settingsRepository.get()).interface.localHoje).toEqual({ local: 'casa', data: '2026-01-07' });
  });

  it('aviso de mesmo grupo: linha no card sugerido e diálogo ao tocar em "Iniciar"', async () => {
    // Ontem (terça), em casa, peito com RPE 9; hoje a sugestão é a de segunda (peito).
    const ex = (await exercisesRepository.findByName('Supino máquina'))!;
    await workoutPlansRepository.create({ nome: 'Casa peito', diaSemana: 2, local: 'casa', itens: [{ exerciseId: ex.id, series: 3, repsMin: 10, repsMax: 12, descansoSeg: 60, ordem: 0 }] });
    vi.setSystemTime(new Date(2026, 0, 6, 19));
    const s = await sessoes.iniciar((await workoutPlansRepository.list()).find((p) => p.local === 'casa')!.id);
    await sessoes.finalizar(s.id, { rpe: 9, observacoes: '' });
    vi.setSystemTime(QUARTA);

    abrir('/');
    const [pendente] = await screen.findAllByTestId('card-ficha');
    expect(pendente).toHaveTextContent('Pendente de segunda');
    expect(within(pendente!).getByTestId('aviso-grupo')).toHaveTextContent('Ontem você treinou peito com esforço 9.');
    fireEvent.click(within(pendente!).getByRole('button', { name: /^Iniciar / }));
    const dlg = await screen.findByRole('dialog');
    expect(dlg).toHaveTextContent('Ontem você treinou peito com esforço 9. Iniciar mesmo assim?');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await sessoes.ativa()).toBeUndefined();

    fireEvent.click(within(pendente!).getByRole('button', { name: /^Iniciar / }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Iniciar mesmo assim' }));
    expect(await screen.findAllByTestId('item-sessao')).toHaveLength(5);
  });
});

describe('treino concluído hoje', () => {
  it('Início e aba Treinar mostram "Treino de hoje concluído" com a ficha e a duração; outra ficha ainda pode ser iniciada', async () => {
    await concluir(3, new Date(2026, 0, 7, 7));
    vi.setSystemTime(QUARTA);
    const { router } = abrir('/');
    const card = await screen.findByTestId('concluido-hoje');
    expect(card).toHaveTextContent('Treino de hoje concluído');
    expect(card).toHaveTextContent('Costas e bíceps · 30:00');
    // Segunda e terça estão pendentes, mas não são sugeridas hoje.
    expect(screen.queryByText(/Pendente de/)).not.toBeInTheDocument();

    await act(() => router.navigate('/treinar'));
    expect(await screen.findByTestId('concluido-hoje')).toHaveTextContent('Sugerido');
    expect(screen.queryByText(/Sugerido · pendente/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Iniciar / })).toHaveLength(5);
  });
});

describe('aba Treinar', () => {
  it('filtro por local; "Nova ficha" cria no local selecionado', async () => {
    abrir('/treinar');
    expect(await screen.findAllByTestId('card-ficha')).toHaveLength(5);
    // Hoje (quarta) sem treinos: sugerido = segunda (pendente), primeiro e destacado.
    expect(screen.getAllByTestId('card-ficha')[0]).toHaveTextContent('Sugerido · pendente');
    fireEvent.click(screen.getByRole('button', { name: 'Casa' }));
    expect(await screen.findByRole('link', { name: /Criar ficha de casa/ })).toBeInTheDocument();
    expect(screen.queryAllByTestId('card-ficha')).toHaveLength(0);
    fireEvent.click(screen.getByRole('link', { name: /Criar ficha de casa/ }));
    expect(await screen.findByRole('button', { name: 'Casa', pressed: true })).toBeInTheDocument();
  });

  it('miniatura abre o detalhe: prescrição, anotações editáveis direto e "Editar exercício"', async () => {
    abrir('/treinar');
    const [card] = await screen.findAllByTestId('card-ficha');
    fireEvent.click(within(card!).getByRole('link', { name: 'Supino máquina' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Supino máquina' })).toBeInTheDocument();
    expect(screen.getByText(/Na ficha: 3×10–12 · descanso 90 s/)).toBeInTheDocument();
    expect(screen.getByText('Última carga: sem registro')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver execução/ })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('button', { name: 'Concluir série' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Minhas anotações'), { target: { value: 'Banco na posição 4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar anotações' }));
    expect(await screen.findByText('Anotações salvas.')).toBeInTheDocument();
    expect((await exercisesRepository.findByName('Supino máquina'))!.anotacoes).toBe('Banco na posição 4');
    expect(screen.getByRole('link', { name: /Editar exercício/ })).toBeInTheDocument();
  });
});

describe('alterações não salvas', () => {
  it('voltar (POP) com alterações pendentes mostra o diálogo; "Ficar" mantém a tela', async () => {
    const seg = await doDia(1);
    const { router } = abrir('/treinar');
    await screen.findAllByTestId('card-ficha');
    await act(() => router.navigate(`/fichas/${seg.id}`));
    fireEvent.change(await screen.findByLabelText('Nome'), { target: { value: 'Peito pesado' } });

    await act(() => router.navigate(-1));
    const dlg = await screen.findByRole('dialog');
    expect(dlg).toHaveTextContent('Sair sem salvar?');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Ficar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe(`/fichas/${seg.id}`);
    expect(screen.getByLabelText('Nome')).toHaveValue('Peito pesado');

    // Navegação inferior também pergunta; "Sair sem salvar" sai e não grava.
    fireEvent.click(screen.getByRole('link', { name: /Início/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sair sem salvar' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect((await workoutPlansRepository.get(seg.id))!.nome).toBe('Peito e tríceps');
  });

  it('sem alterações, ou depois de salvar, não pergunta', async () => {
    const seg = await doDia(1);
    const { router } = abrir(`/fichas/${seg.id}`);
    await screen.findAllByTestId('item-ficha');
    fireEvent.click(screen.getByRole('link', { name: /Início/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));

    await act(() => router.navigate(`/fichas/${seg.id}`));
    fireEvent.change(await screen.findByLabelText('Nome'), { target: { value: 'Peito pesado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/treinar'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('editor de exercício: alteração pendente pergunta; recarregar dispara beforeunload', async () => {
    const ex = (await exercisesRepository.findByName('Leg press'))!;
    const { router } = abrir('/exercicios');
    await act(() => router.navigate(`/exercicios/${ex.id}`));
    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveValue('Leg press'));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Leg press 45' } });

    const ev = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Sair sem salvar?');
  });
});

describe('concluído hoje com Casa escolhido e sem fichas de casa', () => {
  it('mostra o card de concluído e, abaixo, o link pequeno "Criar ficha de casa"', async () => {
    await concluir(3, new Date(2026, 0, 7, 7));
    vi.setSystemTime(QUARTA);
    abrir('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Casa' }));
    expect(await screen.findByTestId('concluido-hoje')).toHaveTextContent('Costas e bíceps');
    const link = await screen.findByRole('link', { name: 'Criar ficha de casa' });
    expect(link).toHaveAttribute('href', '/fichas/nova?local=casa');
    expect(link).not.toHaveClass('btn-primary');
  });
});

describe('foto em tela cheia', () => {
  it('zoom com dois dedos, arrastar ampliada e toque duplo volta a 1×', async () => {
    const { FotoAmpliavel } = await import('../components/FotoAmpliavel');
    const { render } = await import('@testing-library/react');
    URL.createObjectURL = () => 'blob:x';
    URL.revokeObjectURL = () => {};
    render(<FotoAmpliavel blob={new Blob(['x'], { type: 'image/webp' })} grupo="peito" className="h-10 w-10" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar foto' }));
    const area = screen.getByTestId('foto-zoom');
    const p = (tipo: string, id: number, x: number, y: number) => fireEvent(area, Object.assign(new Event(tipo, { bubbles: true }), { pointerId: id, clientX: x, clientY: y }));

    // Pinça: dedos de 100 px para 300 px de distância = 3×.
    p('pointerdown', 1, 100, 300);
    p('pointerdown', 2, 200, 300);
    p('pointermove', 2, 400, 300);
    p('pointerup', 2, 400, 300);
    p('pointerup', 1, 100, 300);
    expect(area.style.transform).toBe('translate(0px, 0px) scale(3)');
    expect(screen.getByRole('dialog', { name: 'Foto ampliada' })).toBeInTheDocument();

    // Arrastar com um dedo, ampliada.
    p('pointerdown', 3, 100, 100);
    p('pointermove', 3, 150, 80);
    p('pointerup', 3, 150, 80);
    expect(area.style.transform).toBe('translate(50px, -20px) scale(3)');

    // Toque duplo volta a 1×; um toque simples com 1× fecha.
    for (let k = 0; k < 2; k++) {
      p('pointerdown', 10 + k, 50, 50);
      p('pointerup', 10 + k, 50, 50);
    }
    expect(area.style.transform).toBe('translate(0px, 0px) scale(1)');
    vi.setSystemTime(Date.now() + 1000);
    p('pointerdown', 20, 50, 50);
    p('pointerup', 20, 50, 50);
    expect(screen.queryByRole('dialog', { name: 'Foto ampliada' })).not.toBeInTheDocument();
  });
});
