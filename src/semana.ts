import type { GrupoMuscular, LocalTreino, UserSettings, WorkoutPlan, WorkoutSession } from './db/types';
import { localDe } from './db/repositories/workoutPlans';
import { SEMANA } from './dias';

/** Regras da semana (segunda a domingo): ficha feita, pendências, sugestão, contador e aviso de grupo. */

/** 'AAAA-MM-DD' no fuso local. */
export const chaveDia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Segunda-feira 00:00 (local) da semana de `d`. */
export function inicioSemana(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - SEMANA.indexOf(r.getDay()));
  return r;
}

type Sessao = Pick<WorkoutSession, 'planId' | 'status' | 'iniciadaEm' | 'rpe' | 'planSnapshot'>;
type Ficha = Pick<WorkoutPlan, 'id' | 'diaSemana' | 'local'>;

/** Sessões concluídas nesta semana (pelo dia em que começaram), em qualquer local. Abandonadas não contam. */
export function concluidasNaSemana<S extends Sessao>(sessoes: S[], agora: Date): S[] {
  const ini = inicioSemana(agora).getTime();
  return sessoes.filter((s) => s.status === 'concluida' && inicioSemana(new Date(s.iniciadaEm)).getTime() === ini);
}

/** Ficha feita = sessão concluída dela nesta semana, em qualquer dia. */
export const feita = (plano: Ficha, sessoes: Sessao[], agora: Date) =>
  concluidasNaSemana(sessoes, agora).some((s) => s.planId === plano.id);

/**
 * Pendentes do local: fichas com dia anterior a hoje nesta semana, não feitas, cujo dia não teve
 * nenhum treino concluído (casa ou academia). Da mais antiga para a mais recente.
 */
export function pendentes<F extends Ficha>(planos: F[], sessoes: Sessao[], local: LocalTreino, agora: Date): F[] {
  const semana = concluidasNaSemana(sessoes, agora);
  const diasComTreino = new Set(semana.map((s) => new Date(s.iniciadaEm).getDay()));
  const hoje = SEMANA.indexOf(agora.getDay());
  return planos
    .filter((p) => localDe(p) === local && SEMANA.indexOf(p.diaSemana) < hoje)
    .filter((p) => !diasComTreino.has(p.diaSemana) && !semana.some((s) => s.planId === p.id))
    .sort((a, b) => SEMANA.indexOf(a.diaSemana) - SEMANA.indexOf(b.diaSemana));
}

export const fimDeSemana = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

export type Sugestao<F, S = Sessao> =
  /** Já houve treino concluído hoje (qualquer local): nada a sugerir hoje; pendências voltam amanhã. */
  | { tipo: 'concluido'; sessao: S }
  /** Pendente mais antiga; `hoje` = ficha de hoje (não feita) como segunda opção. Fim de semana: opcional. */
  | { tipo: 'pendente'; plano: F; opcional: boolean; hoje?: F }
  | { tipo: 'hoje'; plano: F }
  | { tipo: 'descanso' }
  /** Nada a sugerir em dia útil: mostrar as fichas do local para escolher. */
  | { tipo: 'escolher' };

export function sugestao<F extends Ficha, S extends Sessao>(planos: F[], sessoes: S[], local: LocalTreino, agora: Date): Sugestao<F, S> {
  const hojeChave = chaveDia(agora);
  const deHoje = sessoes
    .filter((s) => s.status === 'concluida' && chaveDia(new Date(s.iniciadaEm)) === hojeChave)
    .sort((a, b) => b.iniciadaEm.localeCompare(a.iniciadaEm))[0];
  if (deHoje) return { tipo: 'concluido', sessao: deHoje };
  const doHoje = planos.find((p) => localDe(p) === local && p.diaSemana === agora.getDay());
  const hoje = doHoje && !feita(doHoje, sessoes, agora) ? doHoje : undefined;
  const [maisAntiga] = pendentes(planos, sessoes, local, agora);
  if (maisAntiga) return { tipo: 'pendente', plano: maisAntiga, opcional: fimDeSemana(agora), ...(hoje && { hoje }) };
  if (hoje) return { tipo: 'hoje', plano: hoje };
  return fimDeSemana(agora) ? { tipo: 'descanso' } : { tipo: 'escolher' };
}

/**
 * "X de Y treinos esta semana": Y = dias com ficha de academia; X = desses dias, os cobertos: a ficha
 * de academia do dia foi concluída nesta semana (em qualquer dia) ou houve treino em casa concluído
 * naquele dia da semana. X nunca passa de Y.
 */
export function contadorSemana(planos: Ficha[], sessoes: Sessao[], agora: Date) {
  const semana = concluidasNaSemana(sessoes, agora);
  const feitas = new Set(semana.map((s) => s.planId));
  const diasEmCasa = new Set(semana.filter((s) => localDe(s.planSnapshot) === 'casa').map((s) => new Date(s.iniciadaEm).getDay()));
  const academia = planos.filter((p) => localDe(p) === 'academia');
  return {
    feitos: new Set(academia.filter((p) => feitas.has(p.id) || diasEmCasa.has(p.diaSemana)).map((p) => p.diaSemana)).size,
    planejados: new Set(academia.map((p) => p.diaSemana)).size,
  };
}

/**
 * Aviso informativo: grupos principais da ficha a iniciar que foram treinados ontem (qualquer local)
 * numa sessão concluída com RPE ≥ 8. Grupos secundários não contam.
 */
export function avisoGrupoSeguido(grupos: GrupoMuscular[], sessoes: Sessao[], agora: Date): { grupos: GrupoMuscular[]; rpe: number } | null {
  const ontem = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1);
  let r: { grupos: GrupoMuscular[]; rpe: number } | null = null;
  for (const s of sessoes) {
    if (s.status !== 'concluida' || (s.rpe ?? 0) < 8 || chaveDia(new Date(s.iniciadaEm)) !== chaveDia(ontem)) continue;
    const deOntem = new Set(s.planSnapshot.itens.map((i) => i.grupoPrincipal));
    const comuns = grupos.filter((g) => deOntem.has(g));
    if (comuns.length && (!r || s.rpe! > r.rpe)) r = { grupos: comuns, rpe: s.rpe! };
  }
  return r;
}

/** Local escolhido no Início: vale só no dia em que foi escolhido. */
export const localEscolhido = (s: Pick<UserSettings, 'interface'>, agora: Date): LocalTreino =>
  s.interface.localHoje?.data === chaveDia(agora) ? s.interface.localHoje.local : 'academia';

type Item = Pick<WorkoutPlan['itens'][number], 'exerciseId' | 'series' | 'descansoSeg'>;

export const SERIE_SEG = 40;
export const TROCA_SEG = 60;
const MIN_VALIDA_SEG = 10 * 60;

/** Sem histórico: por exercício, séries × 40 s + (séries − 1) × descanso, mais 60 s de troca entre exercícios. */
export const duracaoPlanejadaSeg = (itens: Pick<Item, 'series' | 'descansoSeg'>[]) =>
  itens.reduce((t, i) => t + i.series * SERIE_SEG + Math.max(0, i.series - 1) * i.descansoSeg, 0) + Math.max(0, itens.length - 1) * TROCA_SEG;

type SessaoDuracao = Pick<WorkoutSession, 'id' | 'planId' | 'status' | 'iniciadaEm' | 'duracaoAtivaSeg' | 'planSnapshot'>;

/**
 * Duração estimada (s): média das últimas 3 sessões concluídas válidas da ficha. Válida = pelo menos
 * 50% das séries planejadas (no snapshot) e 10 min ou mais. Sem nenhuma válida, duracaoPlanejadaSeg.
 * `seriesPorSessao`: séries registradas em cada sessão (id → quantidade).
 */
export function duracaoEstimadaSeg(plano: { id: string; itens: Item[] }, sessoes: SessaoDuracao[], seriesPorSessao: Map<string, number>): number {
  const validas = sessoes
    .filter((s) => s.planId === plano.id && s.status === 'concluida' && s.duracaoAtivaSeg >= MIN_VALIDA_SEG)
    .filter((s) => {
      const planejadas = s.planSnapshot.itens.reduce((t, i) => t + i.series, 0);
      return planejadas > 0 && (seriesPorSessao.get(s.id) ?? 0) * 2 >= planejadas;
    })
    .sort((a, b) => b.iniciadaEm.localeCompare(a.iniciadaEm))
    .slice(0, 3);
  if (validas.length) return validas.reduce((t, s) => t + s.duracaoAtivaSeg, 0) / validas.length;
  return duracaoPlanejadaSeg(plano.itens);
}

/** "~45 min" (mínimo 1 min). */
export const formatarEstimativa = (seg: number) => `~${Math.max(1, Math.round(seg / 60))} min`;

/** Grupos principais da ficha, sem repetição, na ordem dos exercícios. */
export function gruposDaFicha(itens: Pick<Item, 'exerciseId'>[], grupoDe: (exerciseId: string) => GrupoMuscular | undefined): GrupoMuscular[] {
  return [...new Set(itens.map((i) => grupoDe(i.exerciseId)).filter((g): g is GrupoMuscular => g !== undefined))];
}

/** Os 7 dias da semana de `agora` (segunda a domingo), como Date às 00:00 e chave 'AAAA-MM-DD'. */
export function diasDaSemana(agora: Date): { data: Date; chave: string }[] {
  const ini = inicioSemana(agora);
  return Array.from({ length: 7 }, (_, k) => {
    const data = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + k);
    return { data, chave: chaveDia(data) };
  });
}
