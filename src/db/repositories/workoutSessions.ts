import { db } from '../db';
import type { PlanSnapshot, WorkoutSession } from '../types';
import { ativo, createRepository } from './base';
import { faixaReps, LIMITES } from './workoutPlans';
import { exerciseSetsRepository } from './exerciseSets';
import { ATIVOS, pulados, tempoAtivoEm } from '../../sessao';

const base = createRepository<WorkoutSession>(db.workoutSessions);

export class SessaoAtivaError extends Error {
  constructor(readonly sessao: WorkoutSession) {
    super(`Já existe um treino em andamento: ${sessao.planSnapshot.nome}`);
  }
}

/** Cópia profunda da ficha com nome/tipo/unidade/grupo/porLado de cada exercício congelados agora. */
function snapshotDaFicha(planId: string): Promise<PlanSnapshot> {
  return db.transaction('r', db.workoutPlans, db.exercises, async () => {
    const plano = await db.workoutPlans.get(planId);
    if (!plano || plano.deletedAt !== null) throw new Error('Ficha não encontrada');
    const itens = await Promise.all(
      plano.itens.map(async (it) => {
        const e = await db.exercises.get(it.exerciseId);
        if (!e) throw new Error(`Exercício ${it.exerciseId} não encontrado`);
        return {
          ...it, nome: e.nome, tipo: e.tipo, unidadeCarga: e.unidadeCarga, grupoPrincipal: e.grupoPrincipal, porLado: e.porLado,
        };
      }),
    );
    return structuredClone({ ...plano, itens: itens.sort((a, b) => a.ordem - b.ordem) });
  });
}

async function ativa(): Promise<WorkoutSession | undefined> {
  return db.workoutSessions.where('status').anyOf(ATIVOS).filter(ativo).first();
}

/** Atualiza a sessão lida dentro da transação (sem corrida entre telas/abas). */
function alterar(id: string, f: (s: WorkoutSession, agora: number) => Partial<WorkoutSession>): Promise<WorkoutSession> {
  return db.transaction('rw', db.workoutSessions, async () => {
    const s = await base.get(id);
    if (!s) throw new Error('Sessão não encontrada');
    return base.update(id, f(s, Date.now()));
  });
}

const exigirAtiva = (s: WorkoutSession) => {
  if (!ATIVOS.includes(s.status)) throw new Error('A sessão já foi encerrada');
};

/** Fecha a sessão: acumula o tempo até `fim`, zera descanso. */
function encerrar(s: WorkoutSession, fim: number, status: 'concluida' | 'abandonada', extra: Partial<WorkoutSession> = {}) {
  return {
    ...extra,
    status,
    duracaoAtivaSeg: Math.round(tempoAtivoEm(s, fim)),
    finalizadaEm: new Date(fim).toISOString(),
    ativaDesde: null,
    pausadaEm: null,
    restTimerEndsAt: null,
  };
}

export const workoutSessionsRepository = {
  get: base.get,
  list: base.list,
  snapshotDaFicha,
  ativa,

  /** Uma sessão ativa por vez. */
  iniciar(planId: string): Promise<WorkoutSession> {
    return db.transaction('rw', db.workoutSessions, db.workoutPlans, db.exercises, async () => {
      const atual = await ativa();
      if (atual) throw new SessaoAtivaError(atual);
      const agora = Date.now();
      const planSnapshot = await snapshotDaFicha(planId);
      return base.create({
        planId, planSnapshot, itensIniciais: structuredClone(planSnapshot.itens), status: 'em_andamento',
        iniciadaEm: new Date(agora).toISOString(), finalizadaEm: null, duracaoAtivaSeg: 0, rpe: null, observacoes: '',
        restTimerEndsAt: null, exerciciosPulados: [], ativaDesde: agora, pausadaEm: null,
      });
    });
  },

  /** Pausa: congela o tempo ativo e zera o descanso em curso. */
  pausar: (id: string) =>
    alterar(id, (s, agora) => {
      if (s.status !== 'em_andamento') return {};
      return { status: 'pausada', duracaoAtivaSeg: Math.round(tempoAtivoEm(s, agora)), ativaDesde: null, pausadaEm: agora, restTimerEndsAt: null };
    }),

  /**
   * Retoma a sessão. Em sessão esquecida 'em_andamento', `ate` (última atividade) fecha o tempo
   * contado até ali e descarta o intervalo parado.
   */
  retomar: (id: string, ate?: number) =>
    alterar(id, (s, agora) => {
      exigirAtiva(s);
      if (s.status === 'em_andamento') return { duracaoAtivaSeg: Math.round(tempoAtivoEm(s, ate ?? agora)), ativaDesde: agora };
      return { status: 'em_andamento', ativaDesde: agora, pausadaEm: null };
    }),

  setDescanso: (id: string, restTimerEndsAt: number | null) =>
    alterar(id, (s) => (s.status === 'em_andamento' ? { restTimerEndsAt } : {})),

  /** Descanso do exercício só nesta sessão (muda o planSnapshot, nunca a ficha). */
  setDescansoItem: (id: string, exerciseId: string, descansoSeg: number) =>
    alterar(id, (s) => {
      exigirAtiva(s);
      const [min, max] = LIMITES.descansoSeg;
      if (!Number.isInteger(descansoSeg) || descansoSeg < min || descansoSeg > max) throw new Error(`Descanso deve ser de ${min} a ${max} s`);
      const itens = s.planSnapshot.itens.map((i) => (i.exerciseId === exerciseId ? { ...i, descansoSeg } : i));
      return { planSnapshot: { ...s.planSnapshot, itens } };
    }),

  /** Séries e reps do exercício só nesta sessão (planSnapshot), com os limites da ficha. */
  setPrescricaoItem: (id: string, exerciseId: string, p: { series: number; repsMin: number; repsMax: number }) =>
    alterar(id, (s) => {
      exigirAtiva(s);
      const item = s.planSnapshot.itens.find((i) => i.exerciseId === exerciseId);
      if (!item) throw new Error('Exercício fora deste treino');
      const [rMin, rMax] = faixaReps(item.tipo);
      const fora = (v: number, min: number, max: number) => !Number.isInteger(v) || v < min || v > max;
      if (fora(p.series, ...LIMITES.series)) throw new Error('Séries: de 1 a 10');
      if (fora(p.repsMin, rMin, rMax) || fora(p.repsMax, rMin, rMax)) throw new Error(`${item.tipo === 'tempo' ? 'Segundos' : 'Repetições'}: de ${rMin} a ${rMax}`);
      if (p.repsMin > p.repsMax) throw new Error('Mínimo maior que o máximo');
      const itens = s.planSnapshot.itens.map((i) => (i.exerciseId === exerciseId ? { ...i, ...p } : i));
      return { planSnapshot: { ...s.planSnapshot, itens } };
    }),

  /**
   * Troca o exercício só nesta sessão. Sem séries registradas: o substituto ocupa o lugar (mesmas séries,
   * reps e descanso). Com N séries: o original fica como "trocado após N séries" e o substituto entra logo
   * depois, com as séries que faltavam.
   */
  async substituir(id: string, exerciseId: string, novoId: string): Promise<WorkoutSession> {
    const [novo, sets] = await Promise.all([db.exercises.get(novoId), exerciseSetsRepository.listarDaSessao(id)]);
    if (!novo || novo.deletedAt !== null) throw new Error('Exercício não encontrado');
    const feitas = sets.filter((x) => x.exerciseId === exerciseId).length;
    return alterar(id, (s) => {
      exigirAtiva(s);
      const itens = [...s.planSnapshot.itens].sort((a, b) => a.ordem - b.ordem);
      const k = itens.findIndex((x) => x.exerciseId === exerciseId);
      const i = itens[k];
      if (!i) throw new Error('Exercício fora deste treino');
      if (i.trocadoApos != null) throw new Error('Este exercício já foi trocado');
      if (feitas >= i.series) throw new Error('Este exercício já foi concluído');
      if (itens.some((x) => x.exerciseId === novoId)) throw new Error(`"${novo.nome}" já está neste treino`);
      const [min, max] = faixaReps(novo.tipo);
      const lim = (v: number) => Math.min(max, Math.max(min, v));
      const original = i.substituiu ?? { exerciseId: i.exerciseId, nome: i.nome };
      const substituto = {
        ...i, exerciseId: novoId, nome: novo.nome, tipo: novo.tipo, unidadeCarga: novo.unidadeCarga, grupoPrincipal: novo.grupoPrincipal,
        porLado: novo.porLado, series: i.series - feitas, repsMin: lim(i.repsMin), repsMax: lim(i.repsMax),
        // Voltar ao exercício original (sem séries) desfaz a substituição.
        substituiu: original.exerciseId === novoId ? undefined : original,
      };
      itens.splice(k, 1, ...(feitas > 0 ? [{ ...i, trocadoApos: feitas }, substituto] : [substituto]));
      return {
        planSnapshot: { ...s.planSnapshot, itens: itens.map((x, ordem) => ({ ...x, ordem })) },
        exerciciosPulados: pulados(s).filter((e) => e !== exerciseId),
      };
    });
  },

  pular: (id: string, exerciseId: string) =>
    alterar(id, (s) => ({ exerciciosPulados: [...new Set([...pulados(s), exerciseId])] })),

  despular: (id: string, exerciseId: string) =>
    alterar(id, (s) => ({ exerciciosPulados: pulados(s).filter((e) => e !== exerciseId) })),

  finalizar: (id: string, dados: { rpe: number; observacoes: string }, fim?: number) =>
    alterar(id, (s, agora) => {
      exigirAtiva(s);
      if (!Number.isInteger(dados.rpe) || dados.rpe < 0 || dados.rpe > 10) throw new Error('RPE deve ser de 0 a 10');
      return encerrar(s, fim ?? agora, 'concluida', { rpe: dados.rpe, observacoes: dados.observacoes.trim() });
    }),

  /** As séries registradas permanecem. */
  abandonar: (id: string, fim?: number) =>
    alterar(id, (s, agora) => {
      exigirAtiva(s);
      return encerrar(s, fim ?? agora, 'abandonada');
    }),
};
