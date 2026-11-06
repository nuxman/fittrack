import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { App } from './App';
import { db } from './db/db';
import { seedIfEmpty } from './db/seed';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedIfEmpty();
});

it('abre com a navegação inferior e mostra a ficha', async () => {
  render(<App />);
  const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
  for (const label of ['Início', 'Treinar', 'Histórico', 'Evolução', 'Configurações']) {
    expect(nav).toHaveTextContent(label);
  }
  expect(await screen.findByText(/Segunda — Peito e tríceps/)).toBeInTheDocument();
});
