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

export type Sugestao<F> =
  /** Pendente mais antiga; `hoje` = ficha de hoje (não feita) como segunda opção. Fim de semana: opcional. */
  | { tipo: 'pendente'; plano: F; opcional: boolean; hoje?: F }
  | { tipo: 'hoje'; plano: F }
  | { tipo: 'descanso' }
  /** Nada a sugerir em dia útil: mostrar as fichas do local para escolher. */
  | { tipo: 'escolher' };

export function sugestao<F extends Ficha>(planos: F[], sessoes: Sessao[], local: LocalTreino, agora: Date): Sugestao<F> {
  const doHoje = planos.find((p) => localDe(p) === local && p.diaSemana === agora.getDay());
  const hoje = doHoje && !feita(doHoje, sessoes, agora) ? doHoje : undefined;
  const [maisAntiga] = pendentes(planos, sessoes, local, agora);
  if (maisAntiga) return { tipo: 'pendente', plano: maisAntiga, opcional: fimDeSemana(agora), ...(hoje && { hoje }) };
  if (hoje) return { tipo: 'hoje', plano: hoje };
  return fimDeSemana(agora) ? { tipo: 'descanso' } : { tipo: 'escolher' };
}

/** "X de Y treinos esta semana": X = concluídos em qualquer local; Y = dias com ficha de academia. */
export function contadorSemana(planos: Ficha[], sessoes: Sessao[], agora: Date) {
  return {
    feitos: concluidasNaSemana(sessoes, agora).length,
    planejados: new Set(planos.filter((p) => localDe(p) === 'academia').map((p) => p.diaSemana)).size,
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
