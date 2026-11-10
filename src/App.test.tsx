import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { App } from './App';
import { db } from './db/db';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

it('abre com a navegação inferior e mostra a ficha', async () => {
  render(<App />);
  const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
  for (const label of ['Início', 'Treinar', 'Histórico', 'Evolução', 'Configurações']) {
    expect(nav).toHaveTextContent(label);
  }
  expect(await screen.findByText(/Segunda — Peito e tríceps/)).toBeInTheDocument();
  expect(screen.getByText(/Bird dog · 2×10 por lado/)).toBeInTheDocument();
  expect(screen.getByText(/Supino máquina · 3×10–12/)).toBeInTheDocument();
});

it('Histórico e Evolução vazios explicam o que vai aparecer', async () => {
  window.location.hash = '#/historico';
  const { unmount } = render(<App />);
  expect(await screen.findByText(/Seus treinos concluídos aparecem aqui/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Ir para Treinar' })).toHaveAttribute('href', '#/treinar');
  unmount();
  window.location.hash = '#/';
});

it('Configurações mostra a versão (dev no lugar do hash fora do build)', async () => {
  window.location.hash = '#/configuracoes';
  const { unmount } = render(<App />);
  expect(await screen.findByTestId('versao')).toHaveTextContent(/^Versão 0\.3\.1 · dev · \d{2}\/\d{2}\/\d{4}$/);
  unmount();
  window.location.hash = '#/';
});
