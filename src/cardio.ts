import type { CardioEmCurso, CardioPadrao, CardioSession, RascunhoCardio } from './db/types';
import { ESQUECIDA_MS, parseNumero } from './sessao';

/** Regras puras do cardio pós-treino. */

export type DadosCardio = Pick<CardioSession, 'modalidade' | 'duracaoMin' | 'velocidadeKmh' | 'inclinacaoNivel' | 'distanciaKm' | 'fcMedia'>;

export const rascunhoPadrao = (p: CardioPadrao): RascunhoCardio => ({
  modalidade: p.modalidade, duracaoMin: String(p.duracaoMin), inclinacao: p.inclinacaoNivel.rotulo, velocidade: '', distancia: '', fc: '',
});

/** Opcional: vazio = null; senão número de min a max (vírgula ou ponto). */
function opcional(texto: string, rotulo: string, min: number, max: number, inteiro = false): number | null {
  if (!texto.trim()) return null;
  const v = parseNumero(texto);
  if (Number.isNaN(v) || v < min || v > max || (inteiro && !Number.isInteger(v))) throw new Error(`${rotulo}: de ${min} a ${max}`);
  return v;
}

/** Valida o rascunho; lança Error com a mensagem do primeiro campo inválido. */
export function validarCardio(r: RascunhoCardio): DadosCardio {
  const duracaoMin = opcional(r.duracaoMin, 'Duração (min)', 1, 300, true);
  if (duracaoMin === null) throw new Error('Informe a duração (min)');
  let inclinacaoNivel: DadosCardio['inclinacaoNivel'] = null;
  const rotulo = r.inclinacao.trim().replace(/\s+/g, ' ');
  if (rotulo) {
    const n = rotulo.match(/\d+([.,]\d+)?/);
    if (!n) throw new Error('Inclinação: inclua o número (ex.: "nível 7")');
    inclinacaoNivel = { valor: parseNumero(n[0]), rotulo };
  }
  const fc = opcional(r.fc, 'FC média', 30, 250, true);
  return {
    modalidade: r.modalidade,
    duracaoMin,
    velocidadeKmh: opcional(r.velocidade, 'Velocidade (km/h)', 0, 30),
    inclinacaoNivel,
    distanciaKm: opcional(r.distancia, 'Distância (km)', 0, 100),
    ...(fc !== null && { fcMedia: fc }),
  };
}

/** Minutos entre o início do cronômetro e `fim` (no mínimo 1). */
export const minutosEntre = (inicio: number, fim: number) => Math.max(1, Math.round((fim - inicio) / 60_000));

/** Esquecido: o horário final (ou o início, se parado) passou há mais de 3 horas. */
export const cardioEsquecido = (c: CardioEmCurso, agora: number) => agora - (c.fimEm ?? c.iniciouEm ?? c.desde) > ESQUECIDA_MS;
