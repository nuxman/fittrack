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

export type TipoExercicio = 'carga' | 'peso_corporal' | 'tempo';
export type UnidadeCarga = 'kg' | 'placa';

export interface Exercise extends BaseRecord {
  nome: string;
  tipo: TipoExercicio;
  unidadeCarga: UnidadeCarga;
  equipmentId?: string;
  gruposMusculares: string[];
  porLado: boolean;
  videoUrl?: string;
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

export type StatusSessao = 'em_andamento' | 'pausada' | 'concluida' | 'abandonada';

export interface WorkoutSession extends BaseRecord {
  planId: string;
  planSnapshot: WorkoutPlan;
  status: StatusSessao;
  iniciadaEm: string;
  finalizadaEm: string | null;
  duracaoAtivaSeg: number;
  rpe: number | null;
  observacoes: string;
  restTimerEndsAt: number | null;
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
  interface: { tema: 'escuro' | 'claro'; vibrar: boolean };
}
