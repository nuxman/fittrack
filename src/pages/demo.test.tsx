import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { abrir } from '../test/abrir';
import { pagina } from '../modo';

beforeEach(async () => {
  localStorage.clear();
  await db.delete();
  await db.open();
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('modo demonstração nas telas', () => {
  it('fora do modo: sem faixa; Configurações explica e "Entrar" grava a escolha e recarrega', async () => {
    const recarregar = vi.spyOn(pagina, 'recarregar').mockImplementation(() => {});
    abrir('/configuracoes');
    expect(await screen.findByText(/Seus dados reais não são lidos nem alterados/)).toBeInTheDocument();
    expect(screen.queryByTestId('faixa-demo')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Entrar no modo demonstração' }));
    expect(localStorage.getItem('fittrack-modo')).toBe('demo');
    expect(recarregar).toHaveBeenCalledOnce();
  });

  it('no modo: faixa "Modo demonstração · Sair" em todas as telas, Recomeçar e Sair em Configurações', async () => {
    localStorage.setItem('fittrack-modo', 'demo');
    const recarregar = vi.spyOn(pagina, 'recarregar').mockImplementation(() => {});
    const { router } = abrir('/');
    expect(await screen.findByTestId('faixa-demo')).toHaveTextContent('Modo demonstração · Sair');
    await router.navigate('/historico');
    expect(screen.getByTestId('faixa-demo')).toBeInTheDocument();
    await router.navigate('/configuracoes');
    expect(await screen.findByRole('button', { name: 'Recomeçar demonstração' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entrar no modo demonstração' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(localStorage.getItem('fittrack-modo')).toBeNull();
    expect(recarregar).toHaveBeenCalledOnce();
    localStorage.setItem('fittrack-modo', 'demo');
    fireEvent.click(screen.getByRole('button', { name: 'Sair do modo demonstração' }));
    expect(localStorage.getItem('fittrack-modo')).toBeNull();
  });
});
