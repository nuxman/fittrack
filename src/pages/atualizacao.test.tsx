import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { abrir } from '../test/abrir';
import { avisarNovaVersao } from '../atualizacao';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('nova versão (Etapa 7)', () => {
  it('sem versão nova, nada aparece; com versão nova, "Nova versão disponível — atualizar" ativa o service worker novo', async () => {
    abrir('/');
    await screen.findByTestId('saudacao');
    expect(screen.queryByTestId('aviso-atualizacao')).not.toBeInTheDocument();
    const atualizar = vi.fn(async () => {});
    act(() => avisarNovaVersao(atualizar));
    const botao = await screen.findByRole('button', { name: 'Nova versão disponível — atualizar' });
    fireEvent.click(botao);
    expect(atualizar).toHaveBeenCalledOnce();
    expect(botao).toBeDisabled();
  });
});
