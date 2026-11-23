import { z } from 'zod';
import { db, SCHEMA_VERSAO } from '../db';
import {
  GRUPOS_MUSCULARES, LOCAIS_TREINO, MODALIDADES_CARDIO, TIPOS_EXERCICIO, UNIDADES_CARGA,
  type BaseRecord, type BodyMeasurement, type CardioSession, type Equipment, type Exercise, type ExerciseImage,
  type ExerciseSet, type Profile, type RestDay, type UserSettings, type WorkoutPlan, type WorkoutSession,
} from '../types';
import { exerciseSchema } from './exercises';
import { equipmentSchema } from './equipment';
import { cardioSchema } from './cardioSessions';
import { medidaSchema } from './bodyMeasurements';
import { validarFicha } from './workoutPlans';
import { completarLinkDoSeed } from '../seed';
import { settingsRepository } from './settings';
import { csvMedidas, csvSeries } from '../../csv';
import { MAX_FOTO_PERFIL, perfilSchema } from './profile';

/**
 * Backup JSON (Etapa 6a): todas as tabelas, inclusive registros excluídos (soft delete); imagens de exercício
 * em base64; fotos corporais fora. A importação valida cada registro com as regras do app e substitui tudo numa transação.
 */

type ImagemJson = Omit<ExerciseImage, 'blob'> & { blob: string };
type PerfilJson = Omit<Profile, 'foto'> & { foto?: Omit<NonNullable<Profile['foto']>, 'blob'> & { blob: string } };

export interface Tabelas {
  equipment: Equipment[];
  exercises: Exercise[];
  exerciseImages: ExerciseImage[];
  workoutPlans: WorkoutPlan[];
  workoutSessions: WorkoutSession[];
  exerciseSets: ExerciseSet[];
  cardioSessions: CardioSession[];
  bodyMeasurements: BodyMeasurement[];
  restDays: RestDay[];
  settings: UserSettings[];
  profile: Profile[];
}

export interface BackupValidado {
  schemaVersion: number;
  exportadoEm: string;
  appVersion: string;
  tabelas: Tabelas;
}

export interface Previa {
  exportadoEm: string;
  totais: { fichas: number; exercicios: number; imagens: number; treinos: number; series: number; cardios: number; medidas: number; descansos: number };
  /** Fotos corporais deste aparelho cuja medição não está no backup: serão apagadas. */
  fotosApagadas: number;
}

export class BackupInvalidoError extends Error {}

// --- Base64 (imagens de exercício) ---

async function paraBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const deBase64 = (s: string, type: string) => new Blob([Uint8Array.from(atob(s), (c) => c.charCodeAt(0))], { type });

// --- Validação: as mesmas regras do app em cada registro ---

const iso = z.string().min(1);
const baseSchema = z.object({ id: z.string().min(1), createdAt: iso, updatedAt: iso, deletedAt: iso.nullable() });
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data inválida');
const inteiro = (min: number, max: number) => z.number().int().min(min).max(max);
const itemFicha = z.object({
  exerciseId: z.string().min(1), series: inteiro(1, 10), repsMin: inteiro(1, 600), repsMax: inteiro(1, 600), descansoSeg: inteiro(0, 600), ordem: z.number().int(),
});
const itemSnapshot = itemFicha.extend({
  nome: z.string().min(1), tipo: z.enum(TIPOS_EXERCICIO), unidadeCarga: z.enum(UNIDADES_CARGA), grupoPrincipal: z.enum(GRUPOS_MUSCULARES),
  porLado: z.boolean().optional(),
  substituiu: z.object({ exerciseId: z.string().min(1), nome: z.string() }).optional(),
  trocadoApos: z.number().int().min(0).optional(),
});
const fichaSchema = z.object({ nome: z.string().trim().min(1), diaSemana: inteiro(0, 6), local: z.enum(LOCAIS_TREINO).optional(), itens: z.array(itemFicha) });
const rascunho = z.object({
  modalidade: z.enum(MODALIDADES_CARDIO), duracaoMin: z.string(), inclinacao: z.string(), velocidade: z.string(), distancia: z.string(), andares: z.string().optional(), fc: z.string(),
});
const sessaoSchema = z.object({
  planId: z.string().min(1),
  planSnapshot: baseSchema.merge(fichaSchema.omit({ itens: true })).extend({ itens: z.array(itemSnapshot) }),
  status: z.enum(['em_andamento', 'pausada', 'concluida', 'abandonada']),
  iniciadaEm: iso,
  finalizadaEm: iso.nullable(),
  duracaoAtivaSeg: z.number().min(0),
  rpe: inteiro(0, 10).nullable(),
  observacoes: z.string(),
  restTimerEndsAt: z.number().nullable(),
  exerciciosPulados: z.array(z.string()).optional(),
  ativaDesde: z.number().nullable().optional(),
  pausadaEm: z.number().nullable().optional(),
  itensIniciais: z.array(itemSnapshot.partial({ nome: true, tipo: true, unidadeCarga: true, grupoPrincipal: true })).optional(),
  cardio: z.object({ desde: z.number(), iniciouEm: z.number().nullable(), fimEm: z.number().nullable(), rascunho: rascunho.optional() }).optional(),
});
const serieSchema = z.object({
  sessionId: z.string().min(1), exerciseId: z.string().min(1), numeroSerie: inteiro(1, 100),
  carga: z.number().min(0).max(1000).nullable(), reps: inteiro(1, 600), lado: z.enum(['esq', 'dir']).nullable(), concluidaEm: iso,
});
const imagemSchema = z.object({
  exerciseId: z.string().min(1),
  blob: z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/, 'imagem inválida'),
  mimeType: z.enum(['image/webp', 'image/jpeg']),
  largura: inteiro(1, 1024),
  altura: inteiro(1, 1024),
});
const settingsSchema = z.object({
  descansoPadraoSeg: inteiro(0, 600),
  metaPesoKg: z.number().min(20).max(400).optional(),
  metaDirecao: z.enum(['perder', 'ganhar']).optional(),
  cardioPadrao: z.object({ modalidade: z.enum(MODALIDADES_CARDIO), duracaoMin: inteiro(1, 300), inclinacaoNivel: z.object({ valor: z.number().min(0), rotulo: z.string().min(1) }) }),
  interface: z.object({
    tema: z.enum(['escuro', 'claro']),
    vibrar: z.boolean(),
    avisoNotificacoesVisto: z.boolean().optional(),
    somDescanso: z.boolean().optional(),
    avisoAntecipadoSeg: z.union([z.literal(0), z.literal(5), z.literal(10)]).optional(),
    contagem321: z.boolean().optional(),
    volumeAlerta: z.enum(['baixo', 'medio', 'alto']).optional(),
  }),
});

const NOME_TABELA: Record<keyof Tabelas, string> = {
  equipment: 'Aparelhos', exercises: 'Exercícios', exerciseImages: 'Imagens', workoutPlans: 'Fichas', workoutSessions: 'Treinos',
  exerciseSets: 'Séries', cardioSessions: 'Cardio', bodyMeasurements: 'Medidas', restDays: 'Descansos', settings: 'Configurações', profile: 'Perfil',
};

/**
 * Valida cada registro: campos base + `regras` do app. Grava o registro como veio (sem as transformações das regras), para
 * não perder campo que as regras não listam; os campos que elas listam já foram conferidos.
 */
function registros<T>(tabela: keyof Tabelas, lista: unknown, ...regras: z.ZodTypeAny[]): T[] {
  if (!Array.isArray(lista)) throw new BackupInvalidoError(`${NOME_TABELA[tabela]}: lista ausente`);
  return lista.map((r, k) => {
    const erro = [baseSchema, ...regras].map((s) => s.safeParse(r)).find((p) => !p.success);
    if (erro && !erro.success) {
      const i = erro.error.issues[0]!;
      throw new BackupInvalidoError(`${NOME_TABELA[tabela]}, registro ${k + 1}${i.path.length ? ` (${i.path.join('.')})` : ''}: ${i.message}`);
    }
    return r as T;
  });
}

/** Lê e valida o JSON do backup. Lança BackupInvalidoError com a mensagem em português. */
export function validarBackup(texto: string): BackupValidado {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    throw new BackupInvalidoError('O arquivo não é um backup do FitTrack (JSON inválido).');
  }
  const cab = z.object({ app: z.literal('fittrack'), schemaVersion: z.number().int().min(1), exportadoEm: iso, appVersion: z.string(), tabelas: z.record(z.unknown()) }).safeParse(bruto);
  if ((bruto as { tipo?: unknown } | null)?.tipo === 'pacote-exercicios') {
    throw new BackupInvalidoError('Este arquivo é um pacote de exercícios, não um backup completo. Use "Importar pacote de exercícios".');
  }
  if (!cab.success) throw new BackupInvalidoError('O arquivo não é um backup do FitTrack.');
  const { schemaVersion, tabelas: t } = cab.data;
  if (schemaVersion > SCHEMA_VERSAO) throw new BackupInvalidoError('Este backup é de uma versão mais nova do app. Atualize o app antes de importar.');

  const exercises = registros<Exercise>('exercises', t.exercises, exerciseSchema);
  // Backup anterior à v2: o mesmo upgrade do banco (links de busca nos exercícios do seed sem link).
  if (schemaVersion < 2) exercises.forEach(completarLinkDoSeed);
  const porId = new Map(exercises.map((e) => [e.id, e]));
  const workoutPlans = registros<WorkoutPlan>('workoutPlans', t.workoutPlans, fichaSchema);
  workoutPlans.forEach((p, k) => {
    const erros = validarFicha(p, (id) => porId.get(id));
    if (erros.length) throw new BackupInvalidoError(`Fichas, registro ${k + 1}: ${erros[0]}`);
  });
  const settings = registros<UserSettings>('settings', t.settings, settingsSchema);
  if (!settings.some((s) => s.deletedAt === null)) throw new BackupInvalidoError('Configurações: registro ausente');
  let exerciseImages: ExerciseImage[];
  try {
    exerciseImages = registros<ImagemJson>('exerciseImages', t.exerciseImages, imagemSchema).map((i) => ({ ...i, blob: deBase64(i.blob, i.mimeType) }));
  } catch (e) {
    if (e instanceof BackupInvalidoError) throw e;
    throw new BackupInvalidoError('Imagens: conteúdo inválido');
  }
  // Perfil (v3): backup anterior não tem a tabela.
  let profile: Profile[] = [];
  if (schemaVersion >= 3 || t.profile !== undefined) {
    const fotoPerfil = z.object({
      blob: z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/, 'imagem inválida'),
      mimeType: z.enum(['image/webp', 'image/jpeg']),
      largura: inteiro(1, MAX_FOTO_PERFIL),
      altura: inteiro(1, MAX_FOTO_PERFIL),
    });
    profile = registros<PerfilJson>('profile', t.profile, perfilSchema, z.object({ foto: fotoPerfil.optional() })).map((p) => {
      if (!p.foto) return p as Profile;
      try {
        return { ...p, foto: { ...p.foto, blob: deBase64(p.foto.blob, p.foto.mimeType) } };
      } catch {
        throw new BackupInvalidoError('Perfil: foto inválida');
      }
    });
  }
  return {
    schemaVersion,
    exportadoEm: cab.data.exportadoEm,
    appVersion: cab.data.appVersion,
    tabelas: {
      equipment: registros('equipment', t.equipment, equipmentSchema),
      exercises,
      exerciseImages,
      workoutPlans,
      workoutSessions: registros('workoutSessions', t.workoutSessions, sessaoSchema),
      exerciseSets: registros('exerciseSets', t.exerciseSets, serieSchema),
      cardioSessions: registros('cardioSessions', t.cardioSessions, cardioSchema, z.object({ sessionId: z.string().min(1).optional(), data: dia })),
      bodyMeasurements: registros('bodyMeasurements', t.bodyMeasurements, medidaSchema),
      restDays: registros('restDays', t.restDays, z.object({ data: dia, observacoes: z.string() })),
      settings,
      profile,
    },
  };
}

const TABELAS = Object.keys(NOME_TABELA) as (keyof Tabelas)[];
const ativos = (l: BaseRecord[]) => l.filter((r) => r.deletedAt === null).length;

/** Fotos corporais com conteúdo cuja medição não está no backup (apagadas ao importar). */
async function fotosForaDoBackup(b: BackupValidado) {
  const medidas = new Set(b.tabelas.bodyMeasurements.map((m) => m.id));
  return db.bodyPhotos.filter((f) => !medidas.has(f.measurementId)).toArray();
}

export const backupRepository = {
  /** JSON do banco aberto (no modo demonstração, o de demonstração). */
  async exportar(agora = new Date()): Promise<string> {
    const tabelas = await db.transaction('r', TABELAS.map((t) => db.table(t)), async () =>
      Object.fromEntries(await Promise.all(TABELAS.map(async (t) => [t, await db.table(t).toArray()] as const))),
    );
    tabelas.exerciseImages = await Promise.all(
      (tabelas.exerciseImages as ExerciseImage[]).map(async (i): Promise<ImagemJson> => ({ ...i, blob: await paraBase64(i.blob) })),
    );
    tabelas.profile = await Promise.all(
      (tabelas.profile as Profile[]).map(async (p): Promise<PerfilJson> => (p.foto ? { ...p, foto: { ...p.foto, blob: await paraBase64(p.foto.blob) } } : (p as PerfilJson))),
    );
    return JSON.stringify({ app: 'fittrack', tipo: 'backup', schemaVersion: SCHEMA_VERSAO, appVersion: __APP_VERSION__, exportadoEm: agora.toISOString(), tabelas });
  },

  /** CSV das séries de treinos encerrados (concluídos e abandonados); excluídos e treinos ativos ficam fora. */
  async csvSeries(): Promise<string> {
    const [sessoes, series, exercicios] = await Promise.all([
      db.workoutSessions.filter((s) => s.deletedAt === null && (s.status === 'concluida' || s.status === 'abandonada')).toArray(),
      db.exerciseSets.filter((x) => x.deletedAt === null).toArray(),
      db.exercises.toArray(),
    ]);
    const nomes = new Map(exercicios.map((e) => [e.id, e.nome]));
    return csvSeries(sessoes, series, (id) => nomes.get(id));
  },

  csvMedidas: async () => csvMedidas(await db.bodyMeasurements.filter((m) => m.deletedAt === null).toArray()),

  /** Exportado com sucesso: lembrete do último backup (Configurações e Início). */
  marcarExportado: (agora = new Date()) => settingsRepository.update({ ultimoBackupEm: agora.toISOString() }).then(() => undefined),

  async previa(b: BackupValidado): Promise<Previa> {
    const t = b.tabelas;
    return {
      exportadoEm: b.exportadoEm,
      totais: {
        fichas: ativos(t.workoutPlans), exercicios: ativos(t.exercises), imagens: t.exerciseImages.filter((i) => i.deletedAt === null && i.blob.size > 0).length,
        treinos: ativos(t.workoutSessions), series: ativos(t.exerciseSets), cardios: ativos(t.cardioSessions), medidas: ativos(t.bodyMeasurements), descansos: ativos(t.restDays),
      },
      fotosApagadas: (await fotosForaDoBackup(b)).filter((f) => f.deletedAt === null && f.blob.size > 0).length,
    };
  },

  /**
   * Substitui todos os dados numa transação (falha = dados atuais intactos). Fotos corporais: ficam as das medições
   * do backup. Configurações: mantém o local do dia e a data do último backup deste aparelho.
   */
  async importar(b: BackupValidado): Promise<void> {
    await db.transaction('rw', [...TABELAS.map((t) => db.table(t)), db.bodyPhotos], async () => {
      const atual = await settingsRepository.get();
      await db.bodyPhotos.bulkDelete((await fotosForaDoBackup(b)).map((f) => f.id));
      for (const t of TABELAS) {
        await db.table(t).clear();
        const lista = t === 'settings'
          ? b.tabelas.settings.map((s) => ({ ...s, interface: { ...s.interface, localHoje: atual.interface.localHoje }, ultimoBackupEm: atual.ultimoBackupEm }))
          : b.tabelas[t];
        await db.table(t).bulkAdd(lista);
      }
    });
  },
};

// Compartilhados com o pacote de exercícios (pacote.ts).
export { paraBase64, deBase64, baseSchema, fichaSchema, imagemSchema, registros };
