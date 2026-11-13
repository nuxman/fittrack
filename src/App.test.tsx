import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { db } from './db/db';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

it('abre com a navegação inferior e o dashboard da semana', async () => {
  render(<App />);
  const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
  for (const label of ['Início', 'Treinar', 'Histórico', 'Evolução', 'Configurações']) {
    expect(nav).toHaveTextContent(label);
  }
  expect(await screen.findByTestId('contador-semana')).toHaveTextContent('0 de 5 treinos esta semana');
  expect(screen.getAllByTestId('dia-semana')).toHaveLength(7);
  expect(screen.getByRole('group', { name: 'Local do treino' })).toBeInTheDocument();
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
  expect(__APP_VERSION__).toMatch(/^\d+\.\d+\.\d+$/);
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
  expect(within(secao).queryByRole('button', { name: /Permitir notificações/ })).not.toBeInTheDocument();
  unmount();
  vi.unstubAllGlobals();
  window.location.hash = '#/';
});

it('Configurações → Alertas de descanso: som, aviso antecipado e 3-2-1 salvos com padrão ligado/10 s', async () => {
  window.location.hash = '#/configuracoes';
  const { unmount } = render(<App />);
  const som = await screen.findByLabelText('Som');
  expect(som).toBeChecked();
  expect(screen.getByLabelText('Aviso antecipado')).toHaveValue('10');
  expect(screen.getByLabelText('Contagem 3-2-1')).toBeChecked();
  expect(screen.getByRole('button', { name: /Testar som/ })).toBeInTheDocument();
  expect(screen.getByLabelText('Volume do alerta')).toHaveValue('alto');
  expect(screen.getByText('O alerta não fica mais alto que o volume de mídia do celular.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Volume do alerta'), { target: { value: 'medio' } });
  await waitFor(async () => expect((await db.settings.toArray())[0]!.interface.volumeAlerta).toBe('medio'));
  fireEvent.change(screen.getByLabelText('Aviso antecipado'), { target: { value: '5' } });
  await waitFor(async () => expect((await db.settings.toArray())[0]!.interface.avisoAntecipadoSeg).toBe(5));
  fireEvent.click(screen.getByLabelText('Contagem 3-2-1'));
  await waitFor(async () => expect((await db.settings.toArray())[0]!.interface.contagem321).toBe(false));
  fireEvent.click(som);
  await waitFor(() => expect(screen.getByLabelText('Som')).not.toBeChecked());
  expect(screen.getByLabelText('Aviso antecipado')).toBeDisabled();
  unmount();
  window.location.hash = '#/';
});
