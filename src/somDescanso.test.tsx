import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContagemDescanso } from './components/RestTimer';
import { GANHO, prepararAudio, type OpcoesSom } from './somDescanso';

/** AudioContext simulado: registra cada oscilador (frequência, início, se foi cancelado). */
interface Osc { freq: number; inicio: number; parado: boolean; tipo: string; ganho: number }
let oscs: Osc[] = [];
let compressores = 0;
const ctx = {
  state: 'running' as AudioContextState,
  currentTime: 100, // relógio do áudio não começa em zero
  destination: {},
  resume: async () => {},
  // bipe() cria o oscilador antes do ganho: o ganho vai para o último oscilador.
  createGain: () => ({
    gain: { setValueAtTime: (v: number) => void (oscs.at(-1)!.ganho = v), exponentialRampToValueAtTime() {} },
    connect: (d: unknown) => d,
  }),
  createDynamicsCompressor: () => {
    compressores++;
    return { threshold: { value: 0 }, ratio: { value: 0 }, connect: (d: unknown) => d };
  },
  createOscillator() {
    const o: Osc = { freq: 0, inicio: NaN, parado: false, tipo: 'sine', ganho: NaN };
    oscs.push(o);
    return {
      set type(t: string) { o.tipo = t; },
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
const PADRAO: OpcoesSom = { som: true, avisoSeg: 10, contagem: true, volume: 'alto' };

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
const ativos = () => oscs.filter((o) => !o.parado).map((o) => `${Math.round((o.inicio - 100) * 100) / 100}${o.freq >= 3000 ? 'F' : ''}`);
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
    expect(ativos()).toEqual(['20', '20.18', '27', '28', '29', '30F']);
  });

  it('onda quadrada em 2000–3000 Hz, final mais agudo e mais longo, passando pelo compressor', () => {
    render(<ComBanco />);
    iniciar();
    expect(oscs.every((o) => o.tipo === 'square')).toBe(true);
    expect(oscs.every((o) => o.freq >= 2000 && o.freq <= 3000)).toBe(true);
    expect(oscs.at(-1)!.freq).toBeGreaterThan(oscs[0]!.freq);
    expect(compressores).toBeGreaterThanOrEqual(1);
  });

  it('ganho por nível de volume', () => {
    for (const [volume, ganho] of Object.entries(GANHO)) {
      oscs = [];
      const { unmount } = render(<ComBanco som={{ ...PADRAO, volume: volume as OpcoesSom['volume'] }} />);
      iniciar();
      expect(oscs.map((o) => o.ganho)).toEqual(Array(6).fill(ganho));
      unmount();
    }
    expect(GANHO.baixo).toBeLessThan(GANHO.medio);
    expect(GANHO.medio).toBeLessThan(GANHO.alto);
  });

  it('aviso antecipado é bipe duplo; contagem 3-2-1 é bipe simples', () => {
    render(<ComBanco som={{ ...PADRAO, contagem: false }} />);
    iniciar();
    expect(ativos()).toEqual(['20', '20.18', '30F']);
  });

  it('aviso de 5 s e sem contagem', () => {
    render(<ComBanco som={{ ...PADRAO, avisoSeg: 5, contagem: false }} />);
    iniciar();
    expect(ativos()).toEqual(['25', '25.18', '30F']);
  });

  it('+15 s e −15 s cancelam e reagendam', () => {
    render(<ComBanco />);
    iniciar();
    act(() => {
      vi.advanceTimersByTime(5_000);
      ctx.currentTime = 105;
    });
    fireEvent.click(screen.getByRole('button', { name: '+15 s' }));
    expect(ativos()).toEqual(['35', '35.18', '42', '43', '44', '45F']);
    fireEvent.click(screen.getByRole('button', { name: '−15 s' }));
    fireEvent.click(screen.getByRole('button', { name: '−15 s' }));
    // Fim aos 15 s: o aviso de 10 s antes já passou (5 s) e não toca.
    expect(ativos()).toEqual(['5', '5.18', '12', '13', '14', '15F']);
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
    expect(ativos()).toHaveLength(6);
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
    expect(ativos()).toHaveLength(6);
    visibilidade = 'hidden';
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(ativos()).toEqual([]);
  });
});
