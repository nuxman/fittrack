import type { CardioEmCurso, CardioPadrao, CardioSession, ModalidadeCardio, RascunhoCardio } from './db/types';
import { ESQUECIDA_MS, parseNumero } from './sessao';

/** Regras puras do cardio pós-treino. */

export const NOME_MODALIDADE: Record<ModalidadeCardio, string> = { esteira: 'Esteira', bicicleta: 'Bicicleta', caminhada: 'Caminhada', escada: 'Escada' };

/** Escada: nível e andares; sem velocidade nem distância. As outras: velocidade e distância; sem andares. */
export const ehEscada = (m: ModalidadeCardio) => m === 'escada';

/** Linha do cardio ligado no Histórico: "+ Esteira 15 min". */
export const linhaCardio = (c: Pick<CardioSession, 'modalidade' | 'duracaoMin'>) => `+ ${NOME_MODALIDADE[c.modalidade]} ${c.duracaoMin} min`;

export type DadosCardio = Pick<CardioSession, 'modalidade' | 'duracaoMin' | 'velocidadeKmh' | 'inclinacaoNivel' | 'distanciaKm' | 'andares' | 'fcMedia'>;

export const rascunhoPadrao = (p: CardioPadrao): RascunhoCardio => ({
  modalidade: p.modalidade, duracaoMin: String(p.duracaoMin), inclinacao: p.inclinacaoNivel.rotulo, velocidade: '', distancia: '', fc: '',
});

const texto = (n: number | null | undefined) => (n == null ? '' : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));

/** Campos do formulário a partir de um cardio gravado (correção pelo Histórico). */
export const rascunhoDe = (c: CardioSession): RascunhoCardio => ({
  modalidade: c.modalidade, duracaoMin: String(c.duracaoMin), inclinacao: c.inclinacaoNivel?.rotulo ?? '',
  velocidade: texto(c.velocidadeKmh), distancia: texto(c.distanciaKm), andares: texto(c.andares), fc: texto(c.fcMedia),
});

/** Card do cardio avulso no Histórico: "40 min · 3,2 km"; escada: "20 min · 45 andares". */
export function resumoCardio(c: Pick<CardioSession, 'modalidade' | 'duracaoMin' | 'distanciaKm' | 'andares'>) {
  const extra = ehEscada(c.modalidade)
    ? c.andares != null && ` · ${c.andares} ${c.andares === 1 ? 'andar' : 'andares'}`
    : c.distanciaKm != null && ` · ${texto(c.distanciaKm)} km`;
  return `${c.duracaoMin} min${extra || ''}`;
}

/** Trocar de modalidade limpa os campos que não valem para a nova. */
export const trocarModalidade = (r: RascunhoCardio, modalidade: ModalidadeCardio): RascunhoCardio =>
  ehEscada(modalidade) ? { ...r, modalidade, velocidade: '', distancia: '' } : { ...r, modalidade, andares: '' };

/** Opcional: vazio = null; senão número de min a max (vírgula ou ponto). */
function opcional(texto: string, rotulo: string, min: number, max: number, inteiro = false): number | null {
  if (!texto.trim()) return null;
  const v = parseNumero(texto);
  if (Number.isNaN(v) || v < min || v > max || (inteiro && !Number.isInteger(v))) throw new Error(`${rotulo}: de ${min} a ${max}`);
  return v;
}

/** Valida o rascunho; lança Error com a mensagem do primeiro campo inválido. Campos que não valem para a modalidade não são gravados. */
export function validarCardio(r: RascunhoCardio): DadosCardio {
  const duracaoMin = opcional(r.duracaoMin, 'Duração (min)', 1, 300, true);
  if (duracaoMin === null) throw new Error('Informe a duração (min)');
  let inclinacaoNivel: DadosCardio['inclinacaoNivel'] = null;
  const rotulo = r.inclinacao.trim().replace(/\s+/g, ' ');
  if (rotulo) {
    const n = rotulo.match(/\d+([.,]\d+)?/);
    if (!n) throw new Error(ehEscada(r.modalidade) ? 'Nível: inclua o número (ex.: "nível 8")' : 'Inclinação: inclua o número (ex.: "nível 7")');
    inclinacaoNivel = { valor: parseNumero(n[0]), rotulo };
  }
  const fc = opcional(r.fc, 'FC média', 30, 250, true);
  const escada = ehEscada(r.modalidade);
  const andares = escada ? opcional(r.andares ?? '', 'Andares', 0, 1000, true) : null;
  return {
    modalidade: r.modalidade,
    duracaoMin,
    velocidadeKmh: escada ? null : opcional(r.velocidade, 'Velocidade (km/h)', 0, 30),
    inclinacaoNivel,
    distanciaKm: escada ? null : opcional(r.distancia, 'Distância (km)', 0, 100),
    ...(andares !== null && { andares }),
    ...(fc !== null && { fcMedia: fc }),
  };
}

/** Minutos entre o início do cronômetro e `fim` (no mínimo 1). */
export const minutosEntre = (inicio: number, fim: number) => Math.max(1, Math.round((fim - inicio) / 60_000));

/** Esquecido: o horário final (ou o início, se parado) passou há mais de 3 horas. */
export const cardioEsquecido = (c: CardioEmCurso, agora: number) => agora - (c.fimEm ?? c.iniciouEm ?? c.desde) > ESQUECIDA_MS;
