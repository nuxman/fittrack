import type { BodyMeasurement, ExerciseSet, SnapshotItem, WorkoutSession } from './db/types';

/** CSV para Excel / Google Planilhas em português: separador ';', vírgula decimal, BOM UTF-8, linhas CRLF. */

const BOM = '﻿';

/** Escapa um campo: com ';', aspas ou quebra de linha, vai entre aspas (aspas duplicadas). */
export function campo(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : v;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const montarCsv = (cabecalho: string[], linhas: (string | number | null | undefined)[][]) =>
  BOM + [cabecalho, ...linhas].map((l) => l.map(campo).join(';')).join('\r\n') + '\r\n';

const UNIDADE = (i: Pick<SnapshotItem, 'tipo' | 'unidadeCarga'> | undefined) =>
  !i ? '' : i.tipo === 'tempo' ? 'segundos' : i.tipo === 'peso_corporal' ? 'peso corporal' : i.unidadeCarga;
const STATUS: Record<WorkoutSession['status'], string> = { concluida: 'concluído', abandonada: 'abandonado', em_andamento: 'em andamento', pausada: 'pausado' };
const LADO = { esq: 'esquerdo', dir: 'direito' } as const;

const p2 = (n: number) => String(n).padStart(2, '0');
/** dd/mm/aaaa de uma chave de dia (AAAA-MM-DD). */
const dataBr = (chave: string) => chave.split('-').reverse().join('/');
/** Data (dd/mm/aaaa) e hora (hh:mm) locais de um instante ISO. */
const dataHora = (iso: string) => {
  const d = new Date(iso);
  return [`${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`, `${p2(d.getHours())}:${p2(d.getMinutes())}`];
};

/**
 * Uma linha por série, da mais antiga para a mais recente. Nomes, tipo e unidade vêm do planSnapshot da sessão
 * (o histórico sobrevive a renomear ou excluir o exercício). Reps: por lado em exercícios por lado; segundos no tipo tempo.
 */
export function csvSeries(sessoes: WorkoutSession[], series: ExerciseSet[], nomeAtual: (exerciseId: string) => string | undefined): string {
  const porId = new Map(sessoes.map((s) => [s.id, s]));
  const item = (x: ExerciseSet) => porId.get(x.sessionId)!.planSnapshot.itens.find((i) => i.exerciseId === x.exerciseId);
  // Empate de horário (mesmo segundo): ordem do exercício na ficha, depois número da série.
  const ordem = (x: ExerciseSet) => item(x)?.ordem ?? Number.MAX_SAFE_INTEGER;
  const linhas = series
    .filter((x) => porId.has(x.sessionId))
    .sort((a, b) => a.concluidaEm.localeCompare(b.concluidaEm) || ordem(a) - ordem(b) || a.numeroSerie - b.numeroSerie)
    .map((x) => {
      const s = porId.get(x.sessionId)!;
      const it = item(x);
      return [
        ...dataHora(x.concluidaEm), s.planSnapshot.nome, it?.nome ?? nomeAtual(x.exerciseId) ?? '', x.numeroSerie,
        x.carga, UNIDADE(it), x.reps, it?.porLado ? 'sim' : 'não', x.lado ? LADO[x.lado] : '', STATUS[s.status],
      ];
    });
  return montarCsv(['data', 'hora', 'ficha', 'exercício', 'série', 'carga', 'unidade', 'reps', 'por lado', 'lado', 'status do treino'], linhas);
}

/** Uma linha por medição, da mais antiga para a mais recente. */
export function csvMedidas(medidas: BodyMeasurement[]): string {
  const linhas = [...medidas]
    .sort((a, b) => a.data.localeCompare(b.data) || a.createdAt.localeCompare(b.createdAt))
    .map((m) => [dataBr(m.data), m.pesoKg, m.cinturaCm, m.observacoes]);
  return montarCsv(['data', 'peso (kg)', 'cintura (cm)', 'observações'], linhas);
}
