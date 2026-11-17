import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';

/** "Abre o app" do zero (módulos recarregados, como depois de recarregar a página) numa rota. */
async function abrirApp(rota: string) {
  vi.resetModules();
  const modo = await import('../modo');
  const recarregar = vi.spyOn(modo.pagina, 'recarregar').mockImplementation(() => {});
  const { db } = await import('../db/db');
  await db.open();
  const { abrir } = await import('../test/abrir');
  return { ...abrir(rota), db, recarregar };
}

let aberto: Dexie | undefined;
beforeEach(async () => {
  localStorage.clear();
  await Dexie.delete('fittrack');
  await Dexie.delete('fittrack-demo');
});
afterEach(async () => {
  // Desmonta a tela e espera as leituras dela antes de fechar o banco.
  cleanup();
  await new Promise((ok) => setTimeout(ok, 20));
  aberto?.close();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('modo demonstração nas telas', () => {
  it('fora do modo: sem faixa; Configurações explica e "Entrar" grava a escolha e recarrega', async () => {
    const app = await abrirApp('/configuracoes');
    aberto = app.db;
    expect(await screen.findByText(/Seus dados reais não são lidos nem alterados/)).toBeInTheDocument();
    expect(screen.queryByTestId('faixa-demo')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Entrar no modo demonstração' }));
    expect(localStorage.getItem('fittrack-modo')).toBe('demo');
    expect(app.recarregar).toHaveBeenCalledOnce();
  });

  it('no modo: faixa "Modo demonstração · Sair" em todas as telas, Recomeçar e Sair em Configurações', async () => {
    localStorage.setItem('fittrack-modo', 'demo');
    const app = await abrirApp('/');
    aberto = app.db;
    expect(await screen.findByTestId('faixa-demo')).toHaveTextContent('Modo demonstração · Sair');
    await app.router.navigate('/historico');
    expect(screen.getByTestId('faixa-demo')).toBeInTheDocument();
    await app.router.navigate('/configuracoes');
    expect(await screen.findByRole('button', { name: 'Recomeçar demonstração' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entrar no modo demonstração' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(localStorage.getItem('fittrack-modo')).toBeNull();
    expect(app.recarregar).toHaveBeenCalledOnce();
    localStorage.setItem('fittrack-modo', 'demo');
    fireEvent.click(screen.getByRole('button', { name: 'Sair do modo demonstração' }));
    expect(localStorage.getItem('fittrack-modo')).toBeNull();
  });

  it('outra aba entra no modo: esta continua no banco real e sem a faixa até recarregar', async () => {
    const app = await abrirApp('/configuracoes');
    aberto = app.db;
    await screen.findByRole('button', { name: 'Entrar no modo demonstração' });
    localStorage.setItem('fittrack-modo', 'demo');
    await app.router.navigate('/historico');
    await app.router.navigate('/configuracoes');
    expect(await screen.findByRole('button', { name: 'Entrar no modo demonstração' })).toBeInTheDocument();
    expect(screen.queryByTestId('faixa-demo')).not.toBeInTheDocument();
    expect(app.db.name).toBe('fittrack');
  });
});
