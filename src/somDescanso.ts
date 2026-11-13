import type { UserSettings } from './db/types';

/** Bipes do descanso gerados com Web Audio (sem arquivos). Só tocam com o app visível. */
export type VolumeAlerta = 'baixo' | 'medio' | 'alto';

export interface OpcoesSom {
  som: boolean;
  avisoSeg: 0 | 5 | 10;
  contagem: boolean;
  volume: VolumeAlerta;
}

/** Ganho do bipe por nível (antes do compressor). Não passa do volume de mídia do celular. */
export const GANHO: Record<VolumeAlerta, number> = { baixo: 0.2, medio: 0.45, alto: 0.9 };

export const opcoesSom = (s: UserSettings): OpcoesSom => ({
  som: s.interface.somDescanso ?? true,
  avisoSeg: s.interface.avisoAntecipadoSeg ?? 10,
  contagem: s.interface.contagem321 ?? true,
  volume: s.interface.volumeAlerta ?? 'alto',
});

/**
 * Onda quadrada em 2000–3000 Hz: corta melhor por cima de música no fone que a senoidal.
 * Aviso antecipado = bipe duplo (diferente da contagem 3-2-1); final mais agudo e mais longo.
 */
interface Tom { freq: number; dur: number }
const CURTO: Tom = { freq: 2200, dur: 0.12 };
const FINAL: Tom = { freq: 3000, dur: 0.7 };
const INTERVALO_DUPLO = 0.18;

let ctx: AudioContext | null = null;
/** Compressor entre os bipes e a saída: bipe mais "cheio" sem distorcer. */
let saida: AudioNode | null = null;
let agendados: { osc: OscillatorNode; quando: number }[] = [];
/** Muda a cada cancelamento: um resume() pendente não agenda bipes de um descanso já cancelado. */
let geracao = 0;

/** Cria ou retoma o AudioContext. Chamar dentro de um gesto (toque em "Concluir série", "Iniciar", "Testar som"). */
export function prepararAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null; // sem Web Audio: segue só com vibração/notificação
  }
}

/** Sem AudioContext rodando (ex.: app reaberto no meio do descanso, sem gesto ainda): nada toca. */
export const audioSuspenso = () => ctx?.state !== 'running';

function destino(c: AudioContext): AudioNode {
  if (!saida) {
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.ratio.value = 12;
    comp.connect(c.destination);
    saida = comp;
  }
  return saida;
}

function bipe(c: AudioContext, quando: number, { freq, dur }: Tom, volume: VolumeAlerta) {
  const osc = c.createOscillator();
  const ganho = c.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  ganho.gain.setValueAtTime(GANHO[volume], quando);
  ganho.gain.exponentialRampToValueAtTime(0.001, quando + dur);
  osc.connect(ganho).connect(destino(c));
  osc.start(quando);
  osc.stop(quando + dur);
  agendados.push({ osc, quando });
}

export function cancelarBipes(): void {
  geracao++;
  // Bipe já iniciado termina sozinho (o final não é cortado quando o descanso é limpo no zero).
  for (const { osc, quando } of agendados) {
    if (ctx && quando <= ctx.currentTime) continue;
    try {
      osc.stop(0);
      osc.disconnect();
    } catch {
      // já parado
    }
  }
  agendados = [];
}

/** Agenda no relógio do AudioContext os bipes até endsAt (aviso antecipado, 3-2-1, final). Cancela os anteriores. */
export function agendarBipes(endsAt: number, o: OpcoesSom): void {
  cancelarBipes();
  if (!o.som || !ctx || document.visibilityState !== 'visible') return;
  // resume() do gesto pode ainda estar pendente; sem gesto, nunca resolve e nada toca.
  if (ctx.state !== 'running') {
    const g = geracao;
    return void ctx.resume().then(() => g === geracao && agendarBipes(endsAt, o));
  }
  const agora = Date.now();
  const base = ctx.currentTime;
  const marcar = (segAntes: number, tipo: Tom, extra = 0) => {
    const atraso = (endsAt - segAntes * 1000 - agora) / 1000 + extra;
    if (atraso >= 0) bipe(ctx!, base + atraso, tipo, o.volume);
  };
  if (o.avisoSeg > 0) {
    marcar(o.avisoSeg, CURTO);
    marcar(o.avisoSeg, CURTO, INTERVALO_DUPLO);
  }
  if (o.contagem) [3, 2, 1].forEach((s) => marcar(s, CURTO));
  marcar(0, FINAL);
}

/** "Testar som" no volume escolhido: aviso (duplo), um bipe da contagem e o final. */
export function testarSom(volume: VolumeAlerta): void {
  prepararAudio();
  if (!ctx) return;
  const c = ctx;
  const tocar = () => {
    const t0 = c.currentTime + 0.05;
    bipe(c, t0, CURTO, volume);
    bipe(c, t0 + INTERVALO_DUPLO, CURTO, volume);
    bipe(c, t0 + 0.8, CURTO, volume);
    bipe(c, t0 + 1.4, FINAL, volume);
  };
  if (c.state === 'running') tocar();
  else void c.resume().then(tocar);
}
