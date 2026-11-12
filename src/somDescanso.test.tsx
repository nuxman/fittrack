import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContagemDescanso } from './components/RestTimer';
import { prepararAudio, type OpcoesSom } from './somDescanso';

/** AudioContext simulado: registra cada oscilador (frequência, início, se foi cancelado). */
interface Osc { freq: number; inicio: number; parado: boolean }
let oscs: Osc[] = [];
const ctx = {
  state: 'running' as AudioContextState,
  currentTime: 100, // relógio do áudio não começa em zero
  destination: {},
  resume: async () => {},
  createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (d: unknown) => d }),
  createOscillator() {
    const o: Osc = { freq: 0, inicio: NaN, parado: false };
    oscs.push(o);
    return {
      frequency: { set value(v: number) { o.freq = v; } },
      connect: (g: unknown) => g,
      disconnect() {},
      start: (t: number) => void (o.inicio = t),
      stop: (t: number) => void (t === 0 && (o.parado = true)),
    };
  },
};
vi.stubGlobal('AudioContext', function AudioContext() { return ctx; });

let visibilidade: DocumentVisibilityState = 'visible';
const PADRAO: OpcoesSom = { som: true, avisoSeg: 10, contagem: true };

function ComBanco({ som = PADRAO }: { som?: OpcoesSom }) {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  return (
    <>
      <button type="button" onClick={() => { prepararAudio(); setEndsAt(Date.now() + 30_000); }}>
        iniciar 30
      </button>
      <ContagemDescanso endsAt={endsAt} vibrar={false} som={som} onDefinir={setEndsAt} />
    </>
  );
}
/** Bipes ainda valendo, em segundos a partir do início do descanso; F = bipe final. */
const ativos = () => oscs.filter((o) => !o.parado).map((o) => `${Math.round((o.inicio - 100) * 10) / 10}${o.freq > 1000 ? 'F' : ''}`);
const iniciar = () => fireEvent.click(screen.getByRole('button', { name: 'iniciar 30' }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-05T10:00:00Z'));
  oscs = [];
  ctx.currentTime = 100;
  ctx.state = 'running';
  visibilidade = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilidade);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('alerta sonoro do descanso', () => {
  it('agenda aviso antecipado, 3-2-1 e o bipe final no relógio do AudioContext', () => {
    render(<ComBanco />);
    iniciar();
    expect(ativos()).toEqual(['20', '27', '28', '29', '30F']);
  });

  it('aviso de 5 s e sem contagem', () => {
    render(<ComBanco som={{ som: true, avisoSeg: 5, contagem: false }} />);
    iniciar();
    expect(ativos()).toEqual(['25', '30F']);
  });

  it('+15 s e −15 s cancelam e reagendam', () => {
    render(<ComBanco />);
    iniciar();
    act(() => {
      vi.advanceTimersByTime(5_000);
      ctx.currentTime = 105;
    });
    fireEvent.click(screen.getByRole('button', { name: '+15 s' }));
    expect(ativos()).toEqual(['35', '42', '43', '44', '45F']);
    fireEvent.click(screen.getByRole('button', { name: '−15 s' }));
    fireEvent.click(screen.getByRole('button', { name: '−15 s' }));
    // Fim aos 15 s: o aviso de 10 s antes já passou (5 s) e não toca.
    expect(ativos()).toEqual(['5', '12', '13', '14', '15F']);
  });

  it('Pular cancela todos os bipes', () => {
    render(<ComBanco />);
    iniciar();
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }));
    expect(ativos()).toEqual([]);
  });

  it('sair da execução cancela os bipes', () => {
    const { unmount } = render(<ComBanco />);
    iniciar();
    unmount();
    expect(ativos()).toEqual([]);
  });

  it('AudioContext suspenso com descanso ativo: "Toque para ativar o som" reagenda', async () => {
    render(<ComBanco />);
    iniciar();
    ctx.state = 'suspended';
    act(() => void vi.advanceTimersByTime(300));
    const ativar = screen.getByRole('button', { name: 'Toque para ativar o som' });
    ctx.state = 'running';
    oscs = [];
    fireEvent.click(ativar);
    expect(ativos()).toHaveLength(5);
    act(() => void vi.advanceTimersByTime(300));
    expect(screen.queryByRole('button', { name: 'Toque para ativar o som' })).not.toBeInTheDocument();
  });

  it('som desligado: nenhum bipe', () => {
    render(<ComBanco som={{ ...PADRAO, som: false }} />);
    iniciar();
    expect(oscs).toHaveLength(0);
  });

  it('app oculto: nenhum bipe; ao voltar, reagenda o que falta', () => {
    render(<ComBanco />);
    visibilidade = 'hidden';
    iniciar();
    expect(oscs).toHaveLength(0);
    visibilidade = 'visible';
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(ativos()).toHaveLength(5);
    visibilidade = 'hidden';
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(ativos()).toEqual([]);
  });
});
