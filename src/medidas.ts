import type { BodyMeasurement, DirecaoMeta } from './db/types';
import { deChave } from './semana';
import { parseNumero } from './sessao';

/** Regras puras das medidas corporais. */

const DIA_MS = 864e5;
/** Prazo do "Desfazer" depois de excluir (treino, cardio, medida). */
export const DESFAZER_MS = 8000;
/** "Cerca de 7 dias antes": a medição de peso mais próxima de 7 dias, entre 4 e 10 dias antes da atual. */
const JANELA = { min: 4, max: 10, alvo: 7 };

type Medicao = Pick<BodyMeasurement, 'data' | 'pesoKg' | 'createdAt'>;

/** Da mais recente para a mais antiga (mesmo dia: a registrada por último primeiro). */
export const maisRecentesPrimeiro = <M extends Pick<BodyMeasurement, 'data' | 'createdAt'>>(lista: M[]) =>
  [...lista].sort((a, b) => b.data.localeCompare(a.data) || b.createdAt.localeCompare(a.createdAt));

const dias = (a: string, b: string) => Math.round((deChave(a).getTime() - deChave(b).getTime()) / DIA_MS);

export interface ResumoPeso {
  atual: Medicao & { pesoKg: number };
  /** Variação contra a medição de cerca de 7 dias antes (null se não houver na janela de 4 a 10 dias). */
  variacao: { kg: number; dias: number } | null;
}

/** Peso atual (medição mais recente com peso) e variação. Medições só de cintura não contam. */
export function resumoPeso(medicoes: Medicao[]): ResumoPeso | null {
  const comPeso = maisRecentesPrimeiro(medicoes).filter((m): m is Medicao & { pesoKg: number } => m.pesoKg !== null);
  const atual = comPeso[0];
  if (!atual) return null;
  let base: (Medicao & { pesoKg: number }) | undefined;
  for (const m of comPeso) {
    const d = dias(atual.data, m.data);
    if (d < JANELA.min || d > JANELA.max) continue;
    // Mais próxima de 7 dias; empate: a mais antiga (7 − 1 e 7 + 1 → 8 dias).
    if (!base || Math.abs(d - JANELA.alvo) <= Math.abs(dias(atual.data, base.data) - JANELA.alvo)) base = m;
  }
  return { atual, variacao: base ? { kg: Math.round((atual.pesoKg - base.pesoKg) * 10) / 10, dias: dias(atual.data, base.data) } : null };
}

const um = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/** "−0,8 kg em 7 dias", "+0,3 kg em 5 dias", "igual em 7 dias". */
export const textoVariacao = (v: { kg: number; dias: number }) =>
  `${v.kg === 0 ? 'igual' : `${v.kg > 0 ? '+' : '−'}${um(Math.abs(v.kg))} kg`} em ${v.dias} ${v.dias === 1 ? 'dia' : 'dias'}`;

/**
 * Direção da meta: a gravada; meta antiga (antes da 0.13.1) sem direção: pela medição mais antiga com peso
 * (acima da meta = perder; abaixo = ganhar). Sem como deduzir (sem peso, ou o mais antigo igual à meta): null.
 */
export function direcaoMeta(
  settings: { metaPesoKg?: number; metaDirecao?: DirecaoMeta },
  medicoes: Pick<BodyMeasurement, 'data' | 'pesoKg' | 'createdAt'>[],
): DirecaoMeta | null {
  if (settings.metaPesoKg == null) return null;
  if (settings.metaDirecao) return settings.metaDirecao;
  const primeira = maisRecentesPrimeiro(medicoes).reverse().find((m) => m.pesoKg !== null);
  return primeira ? direcaoPorPeso(settings.metaPesoKg, primeira.pesoKg!) : null;
}

/** Ao salvar: meta abaixo do peso = perder, acima = ganhar; igual: null (perguntar). */
export const direcaoPorPeso = (meta: number, peso: number): DirecaoMeta | null => (meta < peso ? 'perder' : meta > peso ? 'ganhar' : null);

/**
 * Meta de peso, sem julgamento. Perder: peso ≤ meta = "meta de 80 kg alcançada"; senão "faltam X kg para a meta (80 kg)".
 * Ganhar: o contrário. Sem direção conhecida: só "faltam" ou "alcançada" quando o peso está exatamente na meta.
 */
export function textoMeta(atual: number, meta: number, direcao: DirecaoMeta | null): string {
  const falta = Math.round(Math.abs(atual - meta) * 10) / 10;
  const alcancada = direcao === 'perder' ? atual <= meta : direcao === 'ganhar' ? atual >= meta : falta === 0;
  return alcancada || falta === 0 ? `meta de ${um(meta)} kg alcançada` : `faltam ${um(falta)} kg para a meta (${um(meta)} kg)`;
}

/** Campos digitados (vírgula ou ponto): vazio = null. Lança Error com a mensagem do primeiro inválido. */
export function lerMedida(texto: string, rotulo: string, min: number, max: number): number | null {
  if (!texto.trim()) return null;
  const v = parseNumero(texto);
  if (Number.isNaN(v) || v < min || v > max) throw new Error(`${rotulo}: de ${min} a ${max}`);
  return v;
}

export const LIMITES = { peso: [20, 400], cintura: [30, 250] } as const;
