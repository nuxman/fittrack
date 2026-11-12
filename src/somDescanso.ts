import type { UserSettings } from './db/types';

/** Bipes do descanso gerados com Web Audio (sem arquivos). Só tocam com o app visível. */
export interface OpcoesSom {
  som: boolean;
  avisoSeg: 0 | 5 | 10;
  contagem: boolean;
}

export const opcoesSom = (s: UserSettings): OpcoesSom => ({
  som: s.interface.somDescanso ?? true,
  avisoSeg: s.interface.avisoAntecipadoSeg ?? 10,
  contagem: s.interface.contagem321 ?? true,
});

const CURTO = { freq: 880, dur: 0.12 };
const FINAL = { freq: 1320, dur: 0.6 };

let ctx: AudioContext | null = null;
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

function bipe(c: AudioContext, quando: number, { freq, dur }: { freq: number; dur: number }) {
  const osc = c.createOscillator();
  const ganho = c.createGain();
  osc.frequency.value = freq;
  ganho.gain.setValueAtTime(0.4, quando);
  ganho.gain.exponentialRampToValueAtTime(0.001, quando + dur);
  osc.connect(ganho).connect(c.destination);
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
  const marcar = (segAntes: number, tipo: typeof CURTO) => {
    const atraso = (endsAt - segAntes * 1000 - agora) / 1000;
    if (atraso >= 0) bipe(ctx!, base + atraso, tipo);
  };
  if (o.avisoSeg > 0) marcar(o.avisoSeg, CURTO);
  if (o.contagem) [3, 2, 1].forEach((s) => marcar(s, CURTO));
  marcar(0, FINAL);
}

/** "Testar som": aviso, um bipe da contagem e o final, em sequência. */
export function testarSom(): void {
  prepararAudio();
  if (!ctx) return;
  const c = ctx;
  const tocar = () => [CURTO, CURTO, FINAL].forEach((t, k) => bipe(c, c.currentTime + 0.05 + k * 0.5, t));
  if (c.state === 'running') tocar();
  else void c.resume().then(tocar);
}
