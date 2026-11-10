import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContagemDescanso, FolhaDescanso } from './RestTimer';

const vibrate = vi.fn();
let visibilidade: DocumentVisibilityState = 'visible';

/** Simula o banco: endsAt fica fora do componente, como restTimerEndsAt. "Iniciar 90" faz o papel de concluir uma série. */
let salvo: number | null = null;
function ComBanco() {
  const [endsAt, setEndsAt] = useState<number | null>(salvo);
  const definir = (t: number | null) => {
    salvo = t;
    setEndsAt(t);
  };
  return (
    <>
      {[45, 60, 90].map((s) => (
        <button key={s} type="button" onClick={() => definir(Date.now() + s * 1000)}>
          iniciar {s}
        </button>
      ))}
      <ContagemDescanso endsAt={endsAt} vibrar onDefinir={definir} />
    </>
  );
}
const visor = () => screen.queryByTestId('descanso')?.textContent ?? null;
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
    // Sem descanso ativo, o painel não aparece.
    expect(screen.queryByRole('region', { name: 'Cronômetro de descanso' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'iniciar 90' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'iniciar 60' }));
    unmount();
    vi.advanceTimersByTime(25_000); // app fechado / tela bloqueada
    render(<ComBanco />);
    expect(visor()).toBe('0:35');
  });

  it('vibra uma única vez no zero e limpa o descanso', () => {
    render(<ComBanco />);
    fireEvent.click(screen.getByRole('button', { name: 'iniciar 45' }));
    avancar(44_000);
    expect(vibrate).not.toHaveBeenCalled();
    avancar(1_000);
    expect(vibrate).toHaveBeenCalledTimes(1);
    avancar(10_000);
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(salvo).toBeNull();
    expect(visor()).toBeNull();
  });

  it('não vibra com o app oculto', () => {
    render(<ComBanco />);
    fireEvent.click(screen.getByRole('button', { name: 'iniciar 45' }));
    visibilidade = 'hidden';
    avancar(46_000);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('Pular encerra o descanso', () => {
    render(<ComBanco />);
    fireEvent.click(screen.getByRole('button', { name: 'iniciar 60' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }));
    expect(salvo).toBeNull();
    expect(visor()).toBeNull();
  });
});

describe('folha de descanso', () => {
  it('opções fixas e personalizado de 5 a 600 s', () => {
    const escolher = vi.fn();
    render(<FolhaDescanso atualSeg={90} onEscolher={escolher} onFechar={() => {}} />);
    expect(screen.getByRole('button', { name: '90s' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '120s' }));
    expect(escolher).toHaveBeenLastCalledWith(120);
    const campo = screen.getByLabelText('Descanso personalizado (segundos)');
    const usar = screen.getByRole('button', { name: 'Usar' });
    fireEvent.change(campo, { target: { value: '700' } });
    expect(usar).toBeDisabled();
    fireEvent.change(campo, { target: { value: '75' } });
    fireEvent.click(usar);
    expect(escolher).toHaveBeenLastCalledWith(75);
  });
});
