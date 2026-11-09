import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RestTimer } from './RestTimer';

const vibrate = vi.fn();
let visibilidade: DocumentVisibilityState = 'visible';

/** Simula o banco: endsAt fica fora do componente, como restTimerEndsAt. */
let salvo: number | null = null;
function ComBanco() {
  const [endsAt, setEndsAt] = useState<number | null>(salvo);
  return (
    <RestTimer
      endsAt={endsAt}
      vibrar
      onDefinir={(t) => {
        salvo = t;
        setEndsAt(t);
      }}
    />
  );
}
const visor = () => screen.getByTestId('descanso').textContent;
const avancar = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-05T10:00:00Z'));
  salvo = null;
  visibilidade = 'visible';
  vibrate.mockReset();
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilidade);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('cronômetro de descanso', () => {
  it('conta a partir do horário final, com ±15 s', () => {
    render(<ComBanco />);
    expect(visor()).toBe('—');
    fireEvent.click(screen.getByRole('button', { name: '90s' }));
    expect(visor()).toBe('1:30');
    avancar(10_000);
    expect(visor()).toBe('1:20');
    fireEvent.click(screen.getByRole('button', { name: '+15 s' }));
    expect(visor()).toBe('1:35');
    fireEvent.click(screen.getByRole('button', { name: '−15 s' }));
    fireEvent.click(screen.getByRole('button', { name: '−15 s' }));
    expect(visor()).toBe('1:05');
  });

  it('sobrevive a recarregar: remontar lê o horário salvo', () => {
    const { unmount } = render(<ComBanco />);
    fireEvent.click(screen.getByRole('button', { name: '60s' }));
    unmount();
    vi.advanceTimersByTime(25_000); // app fechado / tela bloqueada
    render(<ComBanco />);
    expect(visor()).toBe('0:35');
  });

  it('personalizado aceita de 5 a 600 s', () => {
    render(<ComBanco />);
    const campo = screen.getByLabelText('Descanso personalizado (segundos)');
    const iniciar = screen.getByRole('button', { name: 'Iniciar' });
    fireEvent.change(campo, { target: { value: '700' } });
    expect(iniciar).toBeDisabled();
    fireEvent.change(campo, { target: { value: '75' } });
    fireEvent.click(iniciar);
    expect(visor()).toBe('1:15');
  });

  it('vibra uma única vez no zero e limpa o descanso', () => {
    render(<ComBanco />);
    fireEvent.click(screen.getByRole('button', { name: '45s' }));
    avancar(44_000);
    expect(vibrate).not.toHaveBeenCalled();
    avancar(1_000);
    expect(vibrate).toHaveBeenCalledTimes(1);
    avancar(10_000);
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(salvo).toBeNull();
    expect(visor()).toBe('—');
  });

  it('não vibra com o app oculto', () => {
    render(<ComBanco />);
    fireEvent.click(screen.getByRole('button', { name: '45s' }));
    visibilidade = 'hidden';
    avancar(46_000);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('"Permitir notificações" só enquanto a permissão não foi decidida', async () => {
    const requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    const { unmount } = render(<ComBanco />);
    fireEvent.click(screen.getByRole('button', { name: /Permitir notificações/ }));
    await act(async () => {});
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Permitir notificações/ })).not.toBeInTheDocument();
    unmount();

    vi.stubGlobal('Notification', { permission: 'denied', requestPermission });
    render(<ComBanco />);
    expect(screen.queryByRole('button', { name: /Permitir notificações/ })).not.toBeInTheDocument();
  });
});
