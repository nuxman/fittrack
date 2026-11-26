export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type NewRecord<T extends BaseRecord> = Omit<T, keyof BaseRecord>;

/** Cor do aparelho (padrão de academias: azul = pernas, laranja = peito/costas/ombros, verde = braços, vermelho = abdômen/core/lombar). */
export const CORES_APARELHO = ['azul', 'laranja', 'verde', 'vermelho'] as const;
export type CorAparelho = (typeof CORES_APARELHO)[number];

export interface Equipment extends BaseRecord {
  nome: string;
  observacoes: string;
  /** Opcional (0.21.0); ausente = sem cor. */
  cor?: CorAparelho;
  /** Número na academia, texto curto (ex.: "12"). Opcional (0.21.0). */
  numero?: string;
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

export const LOCAIS_TREINO = ['academia', 'casa'] as const;
export type LocalTreino = (typeof LOCAIS_TREINO)[number];

export interface WorkoutPlan extends BaseRecord {
  nome: string;
  diaSemana: number; // 0 = domingo … 6 = sábado
  /** Opcional: ler com localDe() (?? 'academia'). Um diaSemana por local. */
  local?: LocalTreino;
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
  /** Opcional: exercício da ficha trocado por este só nesta sessão ("Substituir exercício"). */
  substituiu?: { exerciseId: string; nome: string };
  /** Opcional: exercício trocado no meio, depois de N séries; fica na sessão como parcial, encerrado. */
  trocadoApos?: number;
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
  /** Opcional: itens do planSnapshot no início, base de "Aplicar também na ficha?". Sessões antigas: comparar com a ficha. */
  itensIniciais?: WorkoutPlanItem[];
  /** Opcional: cardio pós-treino em curso (some ao concluir ou cancelar). */
  cardio?: CardioEmCurso;
}

/** Campos da tela de cardio como digitados (texto), salvos para sobreviver a recarregar. */
export interface RascunhoCardio {
  modalidade: ModalidadeCardio;
  duracaoMin: string;
  /** Rótulo livre com um número, ex.: "nível 7" (valor 7, não é porcentagem). */
  inclinacao: string;
  velocidade: string;
  distancia: string;
  /** Opcional (0.11.0): ler com ?? ''. */
  andares?: string;
  fc: string;
}

export interface CardioEmCurso {
  /** Quando o cardio foi aberto ("Fazer cardio agora?" → Sim). */
  desde: number;
  /** Início do cronômetro atual (null = ainda não iniciado). */
  iniciouEm: number | null;
  /** Horário final do cronômetro, salvo no banco (null = parado). */
  fimEm: number | null;
  rascunho?: RascunhoCardio;
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

/** Lista fixa. 'escada' (0.11.0) e 'eliptico' (1.1.0) são valores novos, sem migração: registros antigos não mudam. */
export const MODALIDADES_CARDIO = ['esteira', 'bicicleta', 'caminhada', 'escada', 'eliptico'] as const;
export type ModalidadeCardio = (typeof MODALIDADES_CARDIO)[number];

export interface CardioSession extends BaseRecord {
  /** Opcional: treino ao qual o cardio pós-treino pertence. */
  sessionId?: string;
  modalidade: ModalidadeCardio;
  duracaoMin: number;
  velocidadeKmh: number | null;
  inclinacaoNivel: Inclinacao | null;
  distanciaKm: number | null;
  /** Só escada: andares subidos (inteiro, opcional). Na escada, velocidade e distância ficam null. */
  andares?: number;
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

export const SEXOS = ['feminino', 'masculino', 'outro'] as const;
export type Sexo = (typeof SEXOS)[number];

/** Perfil (0.19.0): um por aparelho, todos os campos opcionais. Sem IMC nem cálculo de saúde. */
export interface Profile extends BaseRecord {
  nome?: string;
  /** AAAA-MM-DD. */
  nascimento?: string;
  alturaCm?: number;
  sexo?: Sexo;
  objetivo?: string;
  /** Foto redimensionada (no máximo 512 px), WebP ou JPEG. Removida: campo ausente. */
  foto?: { blob: Blob; mimeType: string; largura: number; altura: number };
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

export type DirecaoMeta = 'perder' | 'ganhar';

export interface UserSettings extends BaseRecord {
  descansoPadraoSeg: number;
  metaPesoKg?: number;
  /** Opcional (0.13.1): direção da meta, gravada ao salvar. Meta antiga sem direção: ver direcaoMeta em medidas.ts. */
  metaDirecao?: DirecaoMeta;
  cardioPadrao: CardioPadrao;
  /** Opcional (0.16.0): quando o último backup foi exportado (ISO). Não é restaurado pela importação. */
  ultimoBackupEm?: string;
  /**
   * Opcionais, lidos com valor padrão (sem migração): avisoNotificacoesVisto ?? false;
   * somDescanso ?? true, avisoAntecipadoSeg ?? 10, contagem321 ?? true, volumeAlerta ?? 'alto' (ver opcoesSom).
   */
  interface: {
    tema: 'escuro' | 'claro';
    vibrar: boolean;
    avisoNotificacoesVisto?: boolean;
    somDescanso?: boolean;
    avisoAntecipadoSeg?: 0 | 5 | 10;
    contagem321?: boolean;
    volumeAlerta?: 'baixo' | 'medio' | 'alto';
    /** Local escolhido no Início, válido só no dia `data` (chaveDia); em outro dia, volta para academia. */
    localHoje?: { local: LocalTreino; data: string };
  };
}
