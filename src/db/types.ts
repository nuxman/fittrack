export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type NewRecord<T extends BaseRecord> = Omit<T, keyof BaseRecord>;

export interface Equipment extends BaseRecord {
  nome: string;
  observacoes: string;
}

export const GRUPOS_MUSCULARES = [
  'peito', 'costas', 'ombros', 'bíceps', 'tríceps', 'antebraço', 'quadríceps',
  'posterior de coxa', 'glúteos', 'adutores', 'panturrilha', 'abdômen', 'core', 'lombar',
] as const;
export type GrupoMuscular = (typeof GRUPOS_MUSCULARES)[number];

export const TIPOS_EXERCICIO = ['carga', 'peso_corporal', 'tempo'] as const;
export type TipoExercicio = (typeof TIPOS_EXERCICIO)[number];
export const UNIDADES_CARGA = ['kg', 'placa'] as const;
export type UnidadeCarga = (typeof UNIDADES_CARGA)[number];

export interface Exercise extends BaseRecord {
  nome: string;
  tipo: TipoExercicio;
  unidadeCarga: UnidadeCarga;
  equipmentId?: string;
  /** Único grupo considerado no aviso de dias consecutivos. */
  grupoPrincipal: GrupoMuscular;
  gruposSecundarios: GrupoMuscular[];
  porLado: boolean;
  videoUrl?: string;
  anotacoes?: string;
}

export interface ExerciseImage extends BaseRecord {
  exerciseId: string;
  blob: Blob;
  mimeType: string;
  largura: number;
  altura: number;
}

export interface WorkoutPlanItem {
  exerciseId: string;
  series: number;
  repsMin: number;
  repsMax: number;
  descansoSeg: number;
  ordem: number;
}

export interface WorkoutPlan extends BaseRecord {
  nome: string;
  diaSemana: number; // 0 = domingo … 6 = sábado
  itens: WorkoutPlanItem[];
}

/** Item da ficha congelado no início da sessão, com os dados do exercício naquele momento. */
export interface SnapshotItem extends WorkoutPlanItem {
  nome: string;
  tipo: TipoExercicio;
  unidadeCarga: UnidadeCarga;
  grupoPrincipal: GrupoMuscular;
  /** Opcional (ler com ?? false): total de reps da série = reps × 2. */
  porLado?: boolean;
}

export interface PlanSnapshot extends Omit<WorkoutPlan, 'itens'> {
  itens: SnapshotItem[];
}

export type StatusSessao = 'em_andamento' | 'pausada' | 'concluida' | 'abandonada';

export interface WorkoutSession extends BaseRecord {
  planId: string;
  planSnapshot: PlanSnapshot;
  status: StatusSessao;
  iniciadaEm: string;
  finalizadaEm: string | null;
  duracaoAtivaSeg: number;
  rpe: number | null;
  observacoes: string;
  restTimerEndsAt: number | null;
  /** Opcional: ler com ?? []. */
  exerciciosPulados?: string[];
  /** Timestamp da última retomada (ou do início). Tempo conta só com status 'em_andamento'. */
  ativaDesde?: number | null;
  /** Timestamp da pausa atual (com status 'pausada'). */
  pausadaEm?: number | null;
}

export interface ExerciseSet extends BaseRecord {
  sessionId: string;
  exerciseId: string;
  numeroSerie: number;
  carga: number | null;
  reps: number;
  lado: 'esq' | 'dir' | null;
  concluidaEm: string;
}

/** Nível do aparelho (ex.: "nível 7") — não é porcentagem. */
export interface Inclinacao {
  valor: number;
  rotulo: string;
}

export type ModalidadeCardio = 'esteira' | 'bicicleta' | 'caminhada';

export interface CardioSession extends BaseRecord {
  modalidade: ModalidadeCardio;
  duracaoMin: number;
  velocidadeKmh: number | null;
  inclinacaoNivel: Inclinacao | null;
  distanciaKm: number | null;
  fcMedia?: number;
  rpe: number | null;
  observacoes: string;
  data: string; // YYYY-MM-DD
}

export interface BodyMeasurement extends BaseRecord {
  data: string;
  pesoKg: number | null;
  cinturaCm: number | null;
  observacoes: string;
}

export interface BodyPhoto extends BaseRecord {
  measurementId: string;
  blob: Blob;
}

export interface RestDay extends BaseRecord {
  data: string;
  observacoes: string;
}

export interface CardioPadrao {
  modalidade: ModalidadeCardio;
  duracaoMin: number;
  inclinacaoNivel: Inclinacao;
}

export interface UserSettings extends BaseRecord {
  descansoPadraoSeg: number;
  metaPesoKg?: number;
  cardioPadrao: CardioPadrao;
  /**
   * Opcionais, lidos com valor padrão (sem migração): avisoNotificacoesVisto ?? false;
   * somDescanso ?? true, avisoAntecipadoSeg ?? 10, contagem321 ?? true (ver opcoesSom).
   */
  interface: {
    tema: 'escuro' | 'claro';
    vibrar: boolean;
    avisoNotificacoesVisto?: boolean;
    somDescanso?: boolean;
    avisoAntecipadoSeg?: 0 | 5 | 10;
    contagem321?: boolean;
  };
}
