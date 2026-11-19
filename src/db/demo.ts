/** Dados fictícios do banco de demonstração: cerca de 4 semanas de treinos concluídos, cargas subindo aos poucos, cardio pós-treino e avulso. */
import type {
  BaseRecord, BodyMeasurement, CardioSession, Equipment, Exercise, ExerciseSet, GrupoMuscular, SnapshotItem, WorkoutPlan, WorkoutSession,
} from './types';

/** Carga inicial (kg) por grupo principal; sobe 2,5 kg por semana (5 kg nos de perna). */
const CARGA_INICIAL: Partial<Record<GrupoMuscular, number>> = {
  peito: 30, costas: 35, ombros: 15, bíceps: 10, tríceps: 15, quadríceps: 60, 'posterior de coxa': 30,
  glúteos: 30, panturrilha: 40, abdômen: 20,
};
const PERNA: GrupoMuscular[] = ['quadríceps', 'posterior de coxa', 'glúteos', 'panturrilha'];
const SEMANAS = 4;
const APARELHOS: [string, string, string[]][] = [
  ['Leg press 45°', 'Máquina do fundo, perto da janela', ['Leg press']],
  ['Polia alta', 'Estação dupla de cabos', ['Tríceps polia barra reta', 'Tríceps corda', 'Puxada frontal']],
  ['Cadeira extensora/flexora', 'Máquina combinada; trocar o encosto', ['Cadeira extensora', 'Cadeira flexora']],
];
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
    // Cardio avulso (sem treino) aos sábados, de manhã: caminhada nas semanas pares, escada nas ímpares.
    if (dia.getDay() === 6) {
      const manha = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 8).toISOString();
      const comum = { rpe: semana % 2 ? 7 : 4, observacoes: '', data: chaveDia(dia) };
      cardio.push(registro<CardioSession>(semana % 2
        ? { ...comum, modalidade: 'escada', duracaoMin: 15 + semana * 2, velocidadeKmh: null, inclinacaoNivel: { valor: 8, rotulo: 'nível 8' }, distanciaKm: null, andares: 40 + semana * 5 }
        : { ...comum, modalidade: 'caminhada', duracaoMin: 35 + semana * 5, velocidadeKmh: 5.2, inclinacaoNivel: null, distanciaKm: Math.round((35 + semana * 5) * 5.2 / 6) / 10 },
      manha));
    }
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
  // Medidas: ~6 semanas, duas por semana (segunda e quinta, 7h), peso caindo devagar com oscilação; cintura uma vez por semana.
  const medidas: BodyMeasurement[] = [];
  const inicioMedidas = new Date(hoje.getTime() - (((hoje.getDay() + 6) % 7) + 5 * 7) * DIA_MS);
  for (let n = 0; ; n++) {
    const dia = new Date(inicioMedidas.getFullYear(), inicioMedidas.getMonth(), inicioMedidas.getDate() + n, 7);
    if (dia > agora) break;
    if (dia.getDay() !== 1 && dia.getDay() !== 4) continue;
    const semana = Math.floor(n / 7);
    medidas.push(registro<BodyMeasurement>({
      data: chaveDia(dia),
      pesoKg: Math.round((84.6 - n * 0.06 + (n % 3 === 0 ? 0.3 : 0)) * 10) / 10,
      cinturaCm: dia.getDay() === 1 ? 94 - semana * 0.5 : null,
      observacoes: '',
    }, dia.toISOString()));
  }
  // Alguns aparelhos ligados a exercícios da ficha (pelo nome do seed).
  const criadoEm = inicio.toISOString();
  const ligacoes: [string, string][] = [];
  const aparelhos = APARELHOS.map(([nome, observacoes, exercicios]) => {
    const a = registro<Equipment>({ nome, observacoes }, criadoEm);
    for (const e of exercises) if (exercicios.includes(e.nome)) ligacoes.push([e.id, a.id]);
    return a;
  });
  return { sessions, sets, cardio, medidas, aparelhos, ligacoes };
}
