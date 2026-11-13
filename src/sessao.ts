import type { ExerciseSet, SnapshotItem, UnidadeCarga, TipoExercicio, WorkoutPlanItem, WorkoutSession } from './db/types';
import { faixaReps } from './db/repositories/workoutPlans';

/** Regras puras da sessão de treino (sem banco, sem relógio implícito). */

export const ESQUECIDA_MS = 3 * 60 * 60 * 1000;
export const ATIVOS: WorkoutSession['status'][] = ['em_andamento', 'pausada'];

export type StatusExercicio = 'pendente' | 'parcial' | 'concluido' | 'pulado';
type ItemSessao = Pick<SnapshotItem, 'exerciseId' | 'series' | 'ordem'>;

export const pulados = (s: Pick<WorkoutSession, 'exerciciosPulados'>) => s.exerciciosPulados ?? [];

export const seriesFeitas = (sets: ExerciseSet[], exerciseId: string) =>
  sets.filter((x) => x.exerciseId === exerciseId).length;

/** Calculado só pelas séries registradas; "pulado" só vale enquanto não estiver completo. */
export function statusExercicio(item: ItemSessao, sets: ExerciseSet[], pul: string[]): StatusExercicio {
  const n = seriesFeitas(sets, item.exerciseId);
  if (n >= item.series) return 'concluido';
  if (pul.includes(item.exerciseId)) return 'pulado';
  return n > 0 ? 'parcial' : 'pendente';
}

export function progresso(itens: ItemSessao[], sets: ExerciseSet[], pul: string[]) {
  return { feitos: itens.filter((i) => statusExercicio(i, sets, pul) === 'concluido').length, total: itens.length };
}

/** Exercício para retomar: o da última série, se ainda aberto; senão o primeiro aberto na ordem. */
export function exercicioAtual(itens: ItemSessao[], sets: ExerciseSet[], pul: string[]): string | undefined {
  const ordenados = [...itens].sort((a, b) => a.ordem - b.ordem);
  const aberto = (i: ItemSessao) => ['pendente', 'parcial'].includes(statusExercicio(i, sets, pul));
  const ultima = [...sets].sort((a, b) => a.concluidaEm.localeCompare(b.concluidaEm)).at(-1);
  const daUltima = ultima && ordenados.find((i) => i.exerciseId === ultima.exerciseId);
  if (daUltima && aberto(daUltima)) return daUltima.exerciseId;
  return ordenados.find(aberto)?.exerciseId;
}

type Tempo = Pick<WorkoutSession, 'status' | 'duracaoAtivaSeg' | 'ativaDesde' | 'pausadaEm'>;

/**
 * Segundos ativos da sessão no instante t (t = agora, ou um momento passado como a última série).
 * ponytail: para t anterior ao último trecho ativo, devolve o acumulado (aproximação por cima);
 * exato no caso comum (t dentro do trecho atual). Guardar os trechos se precisar de precisão total.
 */
export function tempoAtivoEm(s: Tempo, t: number): number {
  if (s.status === 'em_andamento' && s.ativaDesde != null) {
    return s.duracaoAtivaSeg + Math.max(0, (t - s.ativaDesde) / 1000);
  }
  if (s.status === 'pausada' && s.pausadaEm != null) {
    return Math.max(0, s.duracaoAtivaSeg - Math.max(0, (s.pausadaEm - t) / 1000));
  }
  return s.duracaoAtivaSeg;
}

/** Última série registrada ou retomada (o início conta como retomada). */
export function ultimaAtividade(s: Pick<WorkoutSession, 'iniciadaEm' | 'ativaDesde'>, sets: ExerciseSet[]): number {
  return Math.max(Date.parse(s.iniciadaEm), s.ativaDesde ?? 0, ...sets.map((x) => Date.parse(x.concluidaEm)));
}

/** Horário da última série (ou do início, sem séries): fim usado em "Finalizar no horário da última série". */
export const fimDaUltimaSerie = (s: Pick<WorkoutSession, 'iniciadaEm'>, sets: ExerciseSet[]) =>
  Math.max(Date.parse(s.iniciadaEm), ...sets.map((x) => Date.parse(x.concluidaEm)));

/** Exercício porLado: o registro guarda reps por lado; total da série = reps × 2. */
export const totalReps = (set: Pick<ExerciseSet, 'reps'>, item: { porLado?: boolean }) => (item.porLado ? set.reps * 2 : set.reps);

/**
 * Volume (kg) = soma(carga × reps totais) só de exercícios 'carga' em kg; null se não houver nenhum.
 * Placa e peso corporal não entram.
 */
export function volumeKg(sets: Pick<ExerciseSet, 'exerciseId' | 'carga' | 'reps'>[], itens: Pick<SnapshotItem, 'exerciseId' | 'tipo' | 'unidadeCarga' | 'porLado'>[]): number | null {
  const porId = new Map(itens.map((i) => [i.exerciseId, i]));
  let total: number | null = null;
  for (const s of sets) {
    const i = porId.get(s.exerciseId);
    if (!i || i.tipo !== 'carga' || i.unidadeCarga !== 'kg' || s.carga == null) continue;
    total = (total ?? 0) + s.carga * totalReps(s, i);
  }
  return total;
}

export const sessaoEsquecida = (s: Pick<WorkoutSession, 'iniciadaEm' | 'ativaDesde'>, sets: ExerciseSet[], agora: number) =>
  agora - ultimaAtividade(s, sets) > ESQUECIDA_MS;

/** Segundos restantes de descanso, calculados a partir do horário final salvo. */
export const restanteSeg = (endsAt: number | null, agora: number) =>
  endsAt == null ? 0 : Math.max(0, Math.ceil((endsAt - agora) / 1000));

/** ±delta sobre o descanso atual (ou a partir de agora); se zerar, devolve null (sem descanso). */
export function ajustarDescanso(endsAt: number | null, agora: number, deltaSeg: number): number | null {
  const novo = Math.max(endsAt ?? agora, agora) + deltaSeg * 1000;
  return novo > agora ? novo : null;
}

/** Aceita "40", "40,5" e "40.5"; qualquer outra coisa vira NaN. */
export function parseNumero(texto: string): number {
  const t = texto.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

export const usaCarga = (tipo: TipoExercicio) => tipo === 'carga';

/** Mensagem de erro ou null. Para 'tempo', reps são segundos. */
export function validarSerie(item: { tipo: TipoExercicio; unidadeCarga: UnidadeCarga }, carga: number | null, reps: number): string | null {
  const [min, max] = faixaReps(item.tipo);
  const rotulo = item.tipo === 'tempo' ? 'Segundos' : 'Repetições';
  if (!Number.isInteger(reps) || reps < min || reps > max) return `${rotulo}: informe um número inteiro de ${min} a ${max}`;
  if (!usaCarga(item.tipo)) return carga === null ? null : 'Este exercício não usa carga';
  if (carga === null || !Number.isFinite(carga) || carga < 0 || carga > 1000) return 'Carga: informe um número de 0 a 1000';
  if (item.unidadeCarga === 'placa' && !Number.isInteger(carga)) return 'Placa: use um número inteiro';
  return null;
}

const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export const formatarCarga = (carga: number, unidade: UnidadeCarga) => (unidade === 'kg' ? `${num(carga)} kg` : `placa ${num(carga)}`);

/** "40 kg × 12", "placa 7 × 12", "12 por lado", "30 s". */
export function formatarSerie(
  set: Pick<ExerciseSet, 'carga' | 'reps'>,
  item: { tipo: TipoExercicio; unidadeCarga: UnidadeCarga; porLado?: boolean },
): string {
  const reps = `${set.reps}${item.tipo === 'tempo' ? ' s' : ''}${item.porLado ? ' por lado' : item.tipo === 'peso_corporal' ? ' reps' : ''}`;
  return set.carga != null && usaCarga(item.tipo) ? `${formatarCarga(set.carga, item.unidadeCarga)} × ${reps}` : reps;
}

/** "3× 10 a 12", "2× 10 por lado", "3× 30 a 45 s". */
export function prescricaoSessao(i: Pick<SnapshotItem, 'series' | 'repsMin' | 'repsMax' | 'tipo' | 'porLado'>): string {
  const reps = i.repsMin === i.repsMax ? `${i.repsMin}` : `${i.repsMin} a ${i.repsMax}`;
  return `${i.series}× ${reps}${i.tipo === 'tempo' ? ' s' : ''}${i.porLado ? ' por lado' : ''}`;
}

/** 75 → "1:15"; 3725 → "1:02:05". */
export function formatarDuracao(seg: number): string {
  const s = Math.max(0, Math.floor(seg));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Uma mudança feita durante a sessão num item da ficha, com o item como ficaria na ficha. */
export interface MudancaFicha {
  /** exerciseId do item na ficha (o original, se substituído). */
  exerciseId: string;
  descricao: string;
  item: WorkoutPlanItem;
}

/**
 * Compara o planSnapshot da sessão com a ficha atual: séries, reps, descanso e substituição.
 * ponytail: compara com a ficha de agora; editar a ficha durante a sessão também aparece como mudança.
 * Guardar os itens originais na sessão se isso incomodar.
 */
export function mudancasNaFicha(snapshot: SnapshotItem[], ficha: WorkoutPlanItem[]): MudancaFicha[] {
  const r: MudancaFicha[] = [];
  for (const f of ficha) {
    const s = snapshot.find((i) => i.exerciseId === f.exerciseId) ?? snapshot.find((i) => i.substituiu?.exerciseId === f.exerciseId);
    if (!s) continue;
    const seg = s.tipo === 'tempo' ? ' s' : '';
    const partes: string[] = [];
    if (s.series !== f.series) partes.push(`séries ${f.series} → ${s.series}`);
    if (s.repsMin !== f.repsMin || s.repsMax !== f.repsMax) partes.push(`${s.tipo === 'tempo' ? 'tempo' : 'reps'} ${f.repsMin}–${f.repsMax} → ${s.repsMin}–${s.repsMax}${seg}`);
    if (s.descansoSeg !== f.descansoSeg) partes.push(`descanso ${f.descansoSeg} → ${s.descansoSeg} s`);
    const trocou = s.exerciseId !== f.exerciseId;
    if (!trocou && partes.length === 0) continue;
    const titulo = trocou ? `${s.substituiu!.nome} → ${s.nome}` : s.nome;
    r.push({
      exerciseId: f.exerciseId,
      descricao: partes.length ? `${titulo}: ${partes.join('; ')}` : titulo,
      item: { ...f, exerciseId: s.exerciseId, series: s.series, repsMin: s.repsMin, repsMax: s.repsMax, descansoSeg: s.descansoSeg },
    });
  }
  return r;
}

/** Descrição de cada nota do RPE (tela Finalizar). */
export function descricaoRpe(n: number): string {
  if (n === 0) return 'Repouso.';
  if (n <= 2) return 'Muito leve.';
  if (n <= 4) return 'Leve, dava para fazer muito mais.';
  if (n <= 6) return 'Moderado, sobravam 4 ou mais repetições.';
  return ['Pesado, sobravam ~3 repetições.', 'Difícil, sobravam ~2 repetições.', 'Muito difícil, sobrava 1 repetição.', 'Máximo, não saía mais nenhuma.'][n - 7]!;
}
