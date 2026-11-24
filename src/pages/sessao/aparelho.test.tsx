import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { abrir } from '../../test/abrir';
import { db } from '../../db/db';
import { workoutPlansRepository } from '../../db/repositories/workoutPlans';
import { workoutSessionsRepository as sessoes } from '../../db/repositories/workoutSessions';
import { exercisesRepository } from '../../db/repositories/exercises';
import { corSugerida, equipmentRepository as aparelhos, textoEtiqueta } from '../../db/repositories/equipment';
import { GRUPOS_MUSCULARES } from '../../db/types';

const doDia = async (d: number) => (await workoutPlansRepository.list()).find((p) => p.diaSemana === d)!;

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('aparelhos com cor e número (0.21.0)', () => {
  it('cor sugerida pelo grupo principal', () => {
    const por = Object.fromEntries(GRUPOS_MUSCULARES.map((g) => [g, corSugerida(g)]));
    expect(por).toEqual({
      quadríceps: 'azul', 'posterior de coxa': 'azul', glúteos: 'azul', adutores: 'azul', panturrilha: 'azul',
      peito: 'laranja', costas: 'laranja', ombros: 'laranja',
      bíceps: 'verde', tríceps: 'verde', antebraço: 'verde',
      abdômen: 'vermelho', core: 'vermelho', lombar: 'vermelho',
    });
  });

  it('etiqueta nunca é só a cor; cor e número opcionais; limpar remove', async () => {
    expect(textoEtiqueta({ nome: 'Polia', cor: 'azul', numero: '12' })).toBe('Azul 12');
    expect(textoEtiqueta({ nome: 'Polia', cor: 'verde' })).toBe('Verde');
    expect(textoEtiqueta({ nome: 'Polia' })).toBe('Polia');
    const a = await aparelhos.create({ nome: 'Polia', observacoes: '', cor: 'verde', numero: ' 7 ' });
    expect(a).toMatchObject({ cor: 'verde', numero: '7' });
    const b = await aparelhos.update(a.id, { cor: undefined, numero: '' });
    expect(b.cor).toBeUndefined();
    expect(b.numero).toBeUndefined();
    await expect(aparelhos.create({ nome: 'X', observacoes: '', cor: 'roxo' as never })).rejects.toThrow();
  });

  it('na sessão: "Definir aparelho" cria um novo (cor sugerida), liga ao exercício e mostra a etiqueta sem sair da sessão', async () => {
    const s = await sessoes.iniciar((await doDia(2)).id); // Pernas A: Leg press primeiro
    const exId = s.planSnapshot.itens[0]!.exerciseId;
    const { router } = abrir('/sessao');
    const [li] = await screen.findAllByTestId('item-sessao');
    fireEvent.click(within(li!).getByRole('button', { name: 'Definir aparelho de Leg press' }));
    const dlg = await screen.findByRole('dialog', { name: 'Aparelho' });
    fireEvent.click(within(dlg).getByRole('button', { name: /Novo aparelho/ }));
    expect(within(dlg).getByRole('button', { name: 'Azul', pressed: true })).toBeInTheDocument();
    fireEvent.change(within(dlg).getByLabelText('Nome'), { target: { value: 'Leg 45°' } });
    fireEvent.change(within(dlg).getByLabelText('Número'), { target: { value: '12' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Criar e usar' }));
    await waitFor(() => expect(within(screen.getAllByTestId('item-sessao')[0]!).getByTestId('etiqueta-aparelho')).toHaveTextContent('Azul 12'));
    expect(router.state.location.pathname).toBe('/sessao');
    const ex = (await exercisesRepository.get(exId))!;
    expect(await aparelhos.get(ex.equipmentId!)).toMatchObject({ nome: 'Leg 45°', cor: 'azul', numero: '12' });

    // Na execução: a etiqueta aparece; tocar permite escolher outro existente.
    const outro = await aparelhos.create({ nome: 'Leg antigo', observacoes: '', cor: 'azul', numero: '5' });
    await act(() => router.navigate(`/sessao/${exId}`));
    fireEvent.click(await screen.findByRole('button', { name: 'Aparelho de Leg press: Azul 12. Alterar' }));
    fireEvent.click(await within(await screen.findByRole('dialog', { name: 'Aparelho' })).findByRole('button', { name: /Leg antigo/ }));
    await waitFor(async () => expect((await exercisesRepository.get(exId))!.equipmentId).toBe(outro.id));
    expect(await screen.findByRole('button', { name: 'Aparelho de Leg press: Azul 5. Alterar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/sessao/${exId}`);
  });

  it('editor de exercício: criar aparelho no próprio diálogo e ver a etiqueta no detalhe', async () => {
    const ex = (await exercisesRepository.list()).find((e) => e.nome === 'Rosca martelo')!;
    const { router } = abrir(`/exercicios/${ex.id}`);
    fireEvent.click(await screen.findByRole('button', { name: /Escolher ou criar aparelho/ }));
    const dlg = await screen.findByRole('dialog', { name: 'Aparelho' });
    fireEvent.click(within(dlg).getByRole('button', { name: /Novo aparelho/ }));
    expect(within(dlg).getByRole('button', { name: 'Verde', pressed: true })).toBeInTheDocument();
    fireEvent.change(within(dlg).getByLabelText('Nome'), { target: { value: 'Banco Scott' } });
    fireEvent.change(within(dlg).getByLabelText('Número'), { target: { value: '21' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Criar e usar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Aparelho' })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(async () => expect((await exercisesRepository.get(ex.id))!.equipmentId).toBeDefined());
    await act(() => router.navigate(`/exercicio/${ex.id}`));
    expect(await screen.findByTestId('etiqueta-aparelho')).toHaveTextContent('Verde 21');
  });
});
