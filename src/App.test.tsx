import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
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
  const versao = (await screen.findByTestId('versao')).textContent!;
  expect(versao.startsWith(`Versão ${__APP_VERSION__} · dev · `)).toBe(true);
  expect(__APP_VERSION__).toBe('0.3.2');
  expect(versao).toMatch(/· \d{2}\/\d{2}\/\d{4}$/);
  unmount();
  window.location.hash = '#/';
});

it('Configurações → Alertas de descanso: explicação e "Permitir notificações" só com permissão pendente', async () => {
  const requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
  vi.stubGlobal('Notification', { permission: 'default', requestPermission });
  window.location.hash = '#/configuracoes';
  const { unmount } = render(<App />);
  const secao = (await screen.findByRole('heading', { name: 'Alertas de descanso' })).closest('section')!;
  expect(secao).toHaveTextContent('o alerta não é garantido');
  fireEvent.click(within(secao).getByRole('button', { name: /Permitir notificações/ }));
  await waitFor(() => expect(within(secao).getByTestId('permissao-notificacao')).toHaveTextContent('Notificações permitidas.'));
  expect(within(secao).queryByRole('button')).not.toBeInTheDocument();
  unmount();
  vi.unstubAllGlobals();
  window.location.hash = '#/';
});
