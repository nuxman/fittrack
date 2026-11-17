/** Regras puras da Evolução: pontos por sessão, medidas por unidade e recordes. */
import type { ExerciseSet, SnapshotItem, WorkoutSession } from './db/types';
import { ATIVOS, totalReps, volumeKg } from './sessao';

/** Como o exercício é medido naquela sessão (tipo e unidade do planSnapshot). */
export type Medida = 'kg' | 'placa' | 'peso_corporal' | 'tempo';

export const medidaDe = (i: Pick<SnapshotItem, 'tipo' | 'unidadeCarga'>): Medida => (i.tipo === 'carga' ? i.unidadeCarga : i.tipo);

/** Um exercício numa sessão encerrada. */
export interface Ponto {
  sessionId: string;
  data: string;
  medida: Medida;
  /** Maior carga da sessão (kg ou placa); null para peso corporal e tempo. */
  cargaMax: number | null;
  /** Reps da série com a maior carga. */
  repsNaCargaMax: number | null;
  /** soma(carga × reps) só em kg; null nas outras medidas. */
  volume: number | null;
  /** Total de reps da sessão (porLado × 2). */
  reps: number;
  /** Maior tempo de uma série (s), só para tipo 'tempo'. */
  tempoMax: number | null;
}

type Sessao = Pick<WorkoutSession, 'id' | 'status' | 'iniciadaEm' | 'planSnapshot'>;

/** Sessões encerradas (concluídas e abandonadas: as séries foram feitas), em ordem cronológica. */
const encerradas = <S extends Sessao>(sessoes: S[]) =>
  sessoes.filter((s) => !ATIVOS.includes(s.status)).sort((a, b) => a.iniciadaEm.localeCompare(b.iniciadaEm));

/** Pontos do exercício, um por sessão em que ele tem séries, do mais antigo ao mais recente. */
export function pontosDoExercicio(exerciseId: string, sessoes: Sessao[], setsPorSessao: Map<string, ExerciseSet[]>): Ponto[] {
  const pontos: Ponto[] = [];
  for (const s of encerradas(sessoes)) {
    const item = s.planSnapshot.itens.find((i) => i.exerciseId === exerciseId);
    const sets = (setsPorSessao.get(s.id) ?? []).filter((x) => x.exerciseId === exerciseId);
    if (!item || sets.length === 0) continue;
    const medida = medidaDe(item);
    const comCarga = medida === 'kg' || medida === 'placa';
    const max = comCarga ? sets.reduce<ExerciseSet | null>((m, x) => (x.carga != null && (m === null || x.carga > m.carga!) ? x : m), null) : null;
    pontos.push({
      sessionId: s.id,
      data: s.iniciadaEm,
      medida,
      cargaMax: max?.carga ?? null,
      repsNaCargaMax: max?.reps ?? null,
      volume: medida === 'kg' ? volumeKg(sets, [item]) : null,
      reps: sets.reduce((t, x) => t + totalReps(x, item), 0),
      tempoMax: medida === 'tempo' ? Math.max(...sets.map((x) => x.reps)) : null,
    });
  }
  return pontos;
}

/** Pontos separados por medida (um exercício que mudou de kg para placa tem dois grupos). */
export function porMedida(pontos: Ponto[]): Map<Medida, Ponto[]> {
  const m = new Map<Medida, Ponto[]>();
  for (const p of pontos) m.set(p.medida, [...(m.get(p.medida) ?? []), p]);
  return m;
}

export interface Recorde {
  rotulo: string;
  valor: number;
  /** Reps da série do recorde de carga. */
  reps?: number;
  data: string;
}

/** Maior valor (o primeiro a atingir vence o empate). */
function maior(pontos: Ponto[], valor: (p: Ponto) => number | null): Ponto | undefined {
  let m: Ponto | undefined;
  for (const p of pontos) {
    const v = valor(p);
    if (v != null && (m === undefined || v > valor(m)!)) m = p;
  }
  return m;
}

/** Recordes de uma medida: kg = maior carga e maior volume; placa = maior placa; peso corporal = mais reps; tempo = maior tempo. */
export function recordes(medida: Medida, pontos: Ponto[]): Recorde[] {
  const r: Recorde[] = [];
  const add = (rotulo: string, p: Ponto | undefined, valor: (p: Ponto) => number | null, reps?: number | null) => {
    if (p) r.push({ rotulo, valor: valor(p)!, data: p.data, ...(reps != null && { reps }) });
  };
  if (medida === 'kg' || medida === 'placa') {
    const c = maior(pontos, (p) => p.cargaMax);
    add('Maior carga', c, (p) => p.cargaMax, c?.repsNaCargaMax);
  }
  if (medida === 'kg') add('Maior volume', maior(pontos, (p) => p.volume), (p) => p.volume);
  if (medida === 'peso_corporal') add('Mais repetições numa sessão', maior(pontos, (p) => p.reps), (p) => p.reps);
  if (medida === 'tempo') add('Maior tempo', maior(pontos, (p) => p.tempoMax), (p) => p.tempoMax);
  return r;
}

export interface ExercicioComSeries {
  exerciseId: string;
  nome: string;
  sessoes: number;
  ultima: string;
}

/** Exercícios com séries em sessões encerradas, do treinado mais recentemente ao mais antigo. Nome atual, ou o do snapshot se excluído. */
export function exerciciosComSeries(
  sessoes: Sessao[],
  setsPorSessao: Map<string, ExerciseSet[]>,
  nomesAtuais: Map<string, string>,
): ExercicioComSeries[] {
  const m = new Map<string, ExercicioComSeries>();
  for (const s of encerradas(sessoes)) {
    const ids = new Set((setsPorSessao.get(s.id) ?? []).map((x) => x.exerciseId));
    for (const id of ids) {
      const nome = nomesAtuais.get(id) ?? s.planSnapshot.itens.find((i) => i.exerciseId === id)?.nome ?? 'Exercício';
      const atual = m.get(id);
      m.set(id, { exerciseId: id, nome, sessoes: (atual?.sessoes ?? 0) + 1, ultima: s.iniciadaEm });
    }
  }
  return [...m.values()].sort((a, b) => b.ultima.localeCompare(a.ultima));
}
