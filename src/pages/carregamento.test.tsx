import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { abrir } from '../test/abrir';
import { workoutPlansRepository } from '../db/repositories/workoutPlans';
import { workoutSessionsRepository as sessoes } from '../db/repositories/workoutSessions';
import { exerciseSetsRepository as series } from '../db/repositories/exerciseSets';

// Simula o import() dinâmico falhando (sem internet, ou arquivo antigo apagado por um deploy novo).
const falha = vi.hoisted(() => ({ ativa: true }));
const quebrar = () => {
  if (falha.ativa) throw new TypeError('Failed to fetch dynamically imported module');
};
vi.mock('./evolucao/MiniGrafico', () => {
  quebrar();
  return { default: () => <p>Mini gráfico carregado</p> };
});
vi.mock('./evolucao/Evolucao', () => {
  quebrar();
  return { default: () => null };
});
vi.mock('./evolucao/EvolucaoExercicio', () => {
  quebrar();
  return { default: () => null };
});

beforeEach(async () => {
  falha.ativa = true;
  await db.delete();
  await db.open();
});

const abrirSecao = async () => {
  const det = (await screen.findByText('Evolução de carga')).closest('details')!;
  det.open = true;
  fireEvent(det, new Event('toggle'));
};

describe('falha ao carregar partes sob demanda', () => {
  it('mini gráfico: mensagem na seção, a execução continua usável e "Tentar de novo" carrega', async () => {
    const plano = (await workoutPlansRepository.list()).find((p) => p.diaSemana === 1)!;
    const s = await sessoes.iniciar(plano.id);
    const exId = s.planSnapshot.itens[0]!.exerciseId;
    abrir(`/sessao/${exId}`);
    await abrirSecao();
    expect(await screen.findByText('Não foi possível carregar o gráfico. Verifique a internet.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Carga (kg)'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Concluir série' }));
    expect(await screen.findByLabelText('Série 1 concluída')).toBeInTheDocument();
    expect(await series.listarDaSessao(s.id)).toHaveLength(1);

    falha.ativa = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Mini gráfico carregado')).toBeInTheDocument();
  });

  it('aba Evolução: tela de erro em português com "Tentar de novo" e "Voltar ao início"', async () => {
    abrir('/evolucao');
    expect(await screen.findByText('Não foi possível abrir a Evolução.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');
  });

  it('detalhe da evolução também', async () => {
    abrir('/evolucao/x');
    expect(await screen.findByText('Não foi possível abrir a Evolução.')).toBeInTheDocument();
  });

  it('rota inexistente cai no erro geral em português', async () => {
    abrir('/nao-existe');
    expect(await screen.findByText('Algo deu errado.')).toBeInTheDocument();
  });
});
