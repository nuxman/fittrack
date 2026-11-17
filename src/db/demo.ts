/** Dados fictícios do banco de demonstração: cerca de 4 semanas de treinos concluídos, cargas subindo aos poucos e cardio. */
import type {
  BaseRecord, CardioSession, Exercise, ExerciseSet, GrupoMuscular, SnapshotItem, WorkoutPlan, WorkoutSession,
} from './types';

/** Carga inicial (kg) por grupo principal; sobe 2,5 kg por semana (5 kg nos de perna). */
const CARGA_INICIAL: Partial<Record<GrupoMuscular, number>> = {
  peito: 30, costas: 35, ombros: 15, bíceps: 10, tríceps: 15, quadríceps: 60, 'posterior de coxa': 30,
  glúteos: 30, panturrilha: 40, abdômen: 20,
};
const PERNA: GrupoMuscular[] = ['quadríceps', 'posterior de coxa', 'glúteos', 'panturrilha'];
const SEMANAS = 4;
const DIA_MS = 864e5;

const chaveDia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const registro = <T extends BaseRecord>(dados: Omit<T, keyof BaseRecord>, iso: string) =>
  ({ id: crypto.randomUUID(), createdAt: iso, updatedAt: iso, deletedAt: null, ...dados }) as T;

/**
 * Do início da semana de 4 semanas atrás até ontem, um treino concluído por dia com ficha (exceto duas faltas),
 * às 18h30. Hoje fica livre, para iniciar um treino de verdade na demonstração.
 */
export function gerarDemo(exercises: Exercise[], planos: WorkoutPlan[], agora = new Date()) {
  const porId = new Map(exercises.map((e) => [e.id, e]));
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const inicio = new Date(hoje.getTime() - (((hoje.getDay() + 6) % 7) + SEMANAS * 7) * DIA_MS);
  const sessions: WorkoutSession[] = [];
  const sets: ExerciseSet[] = [];
  const cardio: CardioSession[] = [];

  for (let n = 0; ; n++) {
    const dia = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + n, 18, 30);
    if (dia >= hoje) break;
    const plano = planos.find((p) => p.diaSemana === dia.getDay());
    const semana = Math.floor(n / 7);
    // Duas faltas: quinta da 2ª semana e terça da 4ª.
    if (!plano || (semana === 1 && dia.getDay() === 4) || (semana === 3 && dia.getDay() === 2)) continue;

    const itens: SnapshotItem[] = plano.itens.map((it) => {
      const e = porId.get(it.exerciseId)!;
      return { ...it, nome: e.nome, tipo: e.tipo, unidadeCarga: e.unidadeCarga, grupoPrincipal: e.grupoPrincipal, porLado: e.porLado };
    });
    const sessionId = crypto.randomUUID();
    let t = dia.getTime();
    for (const item of itens) {
      const base = CARGA_INICIAL[item.grupoPrincipal] ?? 20;
      const carga = item.tipo === 'carga' ? base + semana * (PERNA.includes(item.grupoPrincipal) ? 5 : 2.5) : null;
      for (let k = 0; k < item.series; k++) {
        t += 150_000;
        const iso = new Date(t).toISOString();
        sets.push(registro<ExerciseSet>({
          sessionId, exerciseId: item.exerciseId, numeroSerie: k + 1, carga,
          reps: Math.max(item.repsMin, item.repsMax - k), lado: null, concluidaEm: iso,
        }, iso));
      }
      t += 60_000;
    }
    const iniciadaEm = dia.toISOString();
    const finalizadaEm = new Date(t).toISOString();
    sessions.push({
      ...registro<WorkoutSession>({
        planId: plano.id, planSnapshot: structuredClone({ ...plano, itens }), itensIniciais: structuredClone(itens),
        status: 'concluida', iniciadaEm, finalizadaEm, duracaoAtivaSeg: Math.round((t - dia.getTime()) / 1000),
        rpe: 6 + ((n * 7) % 3), observacoes: '', restTimerEndsAt: null, ativaDesde: null, pausadaEm: null,
      }, iniciadaEm),
      id: sessionId,
    });
    // Cardio pós-treino às terças e quintas.
    if (dia.getDay() === 2 || dia.getDay() === 4) {
      cardio.push(registro<CardioSession>({
        sessionId, modalidade: 'esteira', duracaoMin: 15, velocidadeKmh: 5.5, inclinacaoNivel: { valor: 7, rotulo: 'nível 7' },
        distanciaKm: 1.4, rpe: 5, observacoes: '', data: chaveDia(dia),
      }, finalizadaEm));
    }
  }
  return { sessions, sets, cardio };
}
