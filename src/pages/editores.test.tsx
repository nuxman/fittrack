import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { db } from '../db/db';
import { exercisesRepository } from '../db/repositories/exercises';
import { ordenarItens, workoutPlansRepository } from '../db/repositories/workoutPlans';

const segunda = async () => (await workoutPlansRepository.list()).find((p) => p.diaSemana === 1)!;
const abrir = (rota: string) => render(<MemoryRouter initialEntries={[rota]}><AppRoutes /></MemoryRouter>);

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('editor de ficha', () => {
  it('descer um exercício e salvar grava a nova ordem', async () => {
    const seg = await segunda();
    abrir(`/fichas/${seg.id}`);
    const itens = await screen.findAllByTestId('item-ficha');
    expect(itens[0]).toHaveTextContent('Supino máquina');

    fireEvent.click(within(itens[0]!).getByRole('button', { name: 'Descer' }));
    expect(screen.getAllByTestId('item-ficha')[1]).toHaveTextContent('Supino máquina');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(async () => {
      const nomes = await Promise.all(ordenarItens((await segunda()).itens).map(async (i) => (await exercisesRepository.get(i.exerciseId))!.nome));
      expect(nomes.slice(0, 2)).toEqual(['Supino inclinado articulado', 'Supino máquina']);
    });
  });

  it('mudar para dia ocupado pede confirmação no diálogo do app e troca os dias', async () => {
    const seg = await segunda();
    abrir(`/fichas/${seg.id}`);
    await screen.findAllByTestId('item-ficha');
    fireEvent.change(screen.getByLabelText('Dia da semana'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    const dlg = await screen.findByRole('dialog');
    expect(dlg).toHaveTextContent('Quarta já tem "Costas e bíceps"');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Trocar os dias' }));

    await waitFor(async () => expect((await workoutPlansRepository.get(seg.id))!.diaSemana).toBe(3));
    expect((await workoutPlansRepository.list()).find((p) => p.nome === 'Costas e bíceps')!.diaSemana).toBe(1);
  });

  it('séries fora do limite mostram erro e não salvam', async () => {
    const seg = await segunda();
    abrir(`/fichas/${seg.id}`);
    fireEvent.change(await screen.findByLabelText('Séries — Supino máquina'), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('séries entre 1 e 10');
    expect((await segunda()).itens[0]!.series).toBe(3);
  });

  it('tocar no exercício abre o editor dele', async () => {
    const seg = await segunda();
    abrir(`/fichas/${seg.id}`);
    fireEvent.click(await screen.findByRole('button', { name: /Supino máquina/ }));
    expect(await screen.findByRole('heading', { name: 'Editar exercício' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveValue('Supino máquina'));
  });
});

describe('editor de exercício', () => {
  it('link http:// mostra erro e não salva', async () => {
    const ex = (await exercisesRepository.findByName('Leg press'))!;
    abrir(`/exercicios/${ex.id}`);
    fireEvent.change(await screen.findByLabelText('Link do vídeo de execução (https://)'), { target: { value: 'http://x.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('https://');
    expect((await exercisesRepository.get(ex.id))!.videoUrl).toBeUndefined();
  });

  it('excluir exercício em uso mostra em quais fichas', async () => {
    const ex = (await exercisesRepository.findByName('Leg press'))!;
    abrir(`/exercicios/${ex.id}`);
    fireEvent.click(await screen.findByRole('button', { name: /Excluir exercício/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText(/Usado em: Pernas A e abdômen, Pernas B e corpo inteiro/)).toBeInTheDocument();
    expect(await exercisesRepository.get(ex.id)).toBeDefined();
  });

  it('criar com nome de excluído oferece "Restaurar"', async () => {
    const ex = await exercisesRepository.create({ nome: 'Pullover', tipo: 'carga', unidadeCarga: 'kg', grupoPrincipal: 'costas', gruposSecundarios: [], porLado: false });
    await exercisesRepository.remove(ex.id);
    abrir('/exercicios/novo');
    fireEvent.change(await screen.findByLabelText('Nome'), { target: { value: 'pullover' } });
    fireEvent.change(screen.getByLabelText('Grupo principal'), { target: { value: 'costas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Restaurar "Pullover"' }));
    await waitFor(async () => expect((await exercisesRepository.get(ex.id))?.deletedAt).toBeNull());
  });
});
