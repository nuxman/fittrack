import { z } from 'zod';
import { db } from '../db';
import type { Equipment, Exercise, ExerciseImage, WorkoutPlan } from '../types';
import { stamp, now } from './base';
import { exerciseSchema } from './exercises';
import { equipmentSchema } from './equipment';
import { localDe, NOME_LOCAL, validarFicha } from './workoutPlans';
import { BackupInvalidoError, deBase64, fichaSchema, imagemSchema, paraBase64, registros } from './backup';
import { normalizeNome } from '../normalize';
import { DIAS, SEMANA } from '../../dias';

/**
 * Pacote de exercícios (6c): para levar exercícios (com foto e aparelho) e, opcionalmente, as fichas a outro aparelho.
 * Nunca leva treinos, séries, cardio, medidas, fotos corporais, descanso, perfil nem configurações.
 * Importar junta sem apagar nada, pelo nome normalizado do exercício.
 */

type ImagemJson = Omit<ExerciseImage, 'blob'> & { blob: string };

export interface PacoteValidado {
  exportadoEm: string;
  exercises: Exercise[];
  exerciseImages: ExerciseImage[];
  equipment: Equipment[];
  workoutPlans: WorkoutPlan[];
}

/** Ficha do pacote cujo dia e local já têm uma ficha neste aparelho. */
export interface ConflitoFicha {
  ficha: WorkoutPlan;
  ocupante: WorkoutPlan;
  rotulo: string;
}

export interface PreviaPacote {
  exportadoEm: string;
  novos: number;
  restaurados: number;
  ganhamFoto: number;
  jaTemFoto: number;
  fichas: number;
  conflitos: ConflitoFicha[];
}

const ativo = <T extends { deletedAt: string | null }>(l: T[]) => l.filter((r) => r.deletedAt === null);

export async function exportarPacote({ fichas = false, agora = new Date() } = {}): Promise<string> {
  const exercises = ativo(await db.exercises.toArray());
  const ids = new Set(exercises.map((e) => e.id));
  const imagens = ativo(await db.exerciseImages.toArray()).filter((i) => ids.has(i.exerciseId) && i.blob.size > 0);
  const aparelhos = new Set(exercises.map((e) => e.equipmentId).filter(Boolean));
  const equipment = ativo(await db.equipment.toArray()).filter((a) => aparelhos.has(a.id));
  return JSON.stringify({
    app: 'fittrack',
    tipo: 'pacote-exercicios',
    appVersion: __APP_VERSION__,
    exportadoEm: agora.toISOString(),
    exercises,
    exerciseImages: await Promise.all(imagens.map(async (i): Promise<ImagemJson> => ({ ...i, blob: await paraBase64(i.blob) }))),
    equipment,
    workoutPlans: fichas ? ativo(await db.workoutPlans.toArray()) : [],
  });
}

/** Lê e valida o pacote com as regras do app. Lança BackupInvalidoError com a mensagem em português. */
export function validarPacote(texto: string): PacoteValidado {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    throw new BackupInvalidoError('O arquivo não é um pacote de exercícios do FitTrack (JSON inválido).');
  }
  const b = bruto as { app?: unknown; tipo?: unknown } | null;
  if (b?.app === 'fittrack' && b.tipo !== 'pacote-exercicios') {
    throw new BackupInvalidoError('Este arquivo é um backup completo, não um pacote de exercícios. Use "Importar backup".');
  }
  const cab = z.object({ app: z.literal('fittrack'), tipo: z.literal('pacote-exercicios'), exportadoEm: z.string().min(1) }).passthrough().safeParse(bruto);
  if (!cab.success) throw new BackupInvalidoError('O arquivo não é um pacote de exercícios do FitTrack.');
  const t = cab.data as Record<string, unknown>;

  const exercises = registros<Exercise>('exercises', t.exercises, exerciseSchema);
  const porId = new Map(exercises.map((e) => [e.id, e]));
  const workoutPlans = registros<WorkoutPlan>('workoutPlans', t.workoutPlans, fichaSchema);
  workoutPlans.forEach((p, k) => {
    const erros = validarFicha(p, (id) => porId.get(id));
    if (erros.length) throw new BackupInvalidoError(`Fichas, registro ${k + 1}: ${erros[0]}`);
  });
  const exerciseImages = registros<ImagemJson>('exerciseImages', t.exerciseImages, imagemSchema).map((i) => {
    if (!porId.has(i.exerciseId)) throw new BackupInvalidoError('Imagens: exercício não encontrado no pacote');
    try {
      return { ...i, blob: deBase64(i.blob, i.mimeType) };
    } catch {
      throw new BackupInvalidoError('Imagens: conteúdo inválido');
    }
  });
  return { exportadoEm: cab.data.exportadoEm, exercises, exerciseImages, equipment: registros('equipment', t.equipment, equipmentSchema), workoutPlans };
}

/** Exercícios deste aparelho por nome normalizado: ativo (se houver) e excluído mais recente. */
async function indiceLocal() {
  const m = new Map<string, { ativo?: Exercise; excluido?: Exercise }>();
  for (const e of await db.exercises.toArray()) {
    const k = normalizeNome(e.nome);
    const v = m.get(k) ?? {};
    if (e.deletedAt === null) v.ativo = e;
    else if (!v.excluido || e.updatedAt > v.excluido.updatedAt) v.excluido = e;
    m.set(k, v);
  }
  return m;
}

const temFoto = async (exerciseId: string) =>
  (await db.exerciseImages.where('exerciseId').equals(exerciseId).filter((i) => i.deletedAt === null && i.blob.size > 0).count()) > 0;

/** Ficha ativa deste aparelho no mesmo dia e local. */
async function ocupantes(p: PacoteValidado): Promise<ConflitoFicha[]> {
  const locais = ativo(await db.workoutPlans.toArray());
  const porDia = [...p.workoutPlans].sort((a, b) => SEMANA.indexOf(a.diaSemana) - SEMANA.indexOf(b.diaSemana));
  return porDia.flatMap((ficha) => {
    const ocupante = locais.find((o) => o.diaSemana === ficha.diaSemana && localDe(o) === localDe(ficha));
    return ocupante ? [{ ficha, ocupante, rotulo: `${DIAS[ficha.diaSemana]} (${NOME_LOCAL[localDe(ficha)]})` }] : [];
  });
}

export async function previaPacote(p: PacoteValidado): Promise<PreviaPacote> {
  const idx = await indiceLocal();
  const comFoto = new Set(p.exerciseImages.map((i) => i.exerciseId));
  const r: PreviaPacote = { exportadoEm: p.exportadoEm, novos: 0, restaurados: 0, ganhamFoto: 0, jaTemFoto: 0, fichas: p.workoutPlans.length, conflitos: await ocupantes(p) };
  for (const e of p.exercises) {
    const local = idx.get(normalizeNome(e.nome));
    const destino = local?.ativo ?? local?.excluido;
    if (!destino) r.novos++;
    else {
      if (!local?.ativo) r.restaurados++;
      if (comFoto.has(e.id)) {
        if (await temFoto(destino.id)) r.jaTemFoto++;
        else r.ganhamFoto++;
      }
    }
  }
  return r;
}

/**
 * Junta o pacote neste aparelho, numa transação, sem apagar nada:
 * exercício inexistente = cria (com foto e aparelho); existente sem foto = ganha a foto; existente com foto = mantém a dele;
 * excluído com o mesmo nome = restaura. Fichas: criadas com os exercícios deste aparelho; dia e local ocupados seguem
 * `substituir` (ids das fichas do pacote que substituem a ocupante, que vai para o soft delete; as outras são puladas).
 */
export async function importarPacote(p: PacoteValidado, substituir: Set<string> = new Set()): Promise<void> {
  const conflitos = await ocupantes(p);
  await db.transaction('rw', db.exercises, db.exerciseImages, db.equipment, db.workoutPlans, async () => {
    const idx = await indiceLocal();
    const aparelhos = new Map(ativo(await db.equipment.toArray()).map((a) => [normalizeNome(a.nome), a]));
    const mapaAparelho = new Map<string, string>();
    for (const a of p.equipment) {
      const local = aparelhos.get(normalizeNome(a.nome));
      if (local) mapaAparelho.set(a.id, local.id);
      else {
        const novo = stamp<Equipment>({ nome: a.nome, observacoes: a.observacoes });
        await db.equipment.add(novo);
        aparelhos.set(normalizeNome(a.nome), novo);
        mapaAparelho.set(a.id, novo.id);
      }
    }

    const imagem = new Map(p.exerciseImages.map((i) => [i.exerciseId, i]));
    const mapaExercicio = new Map<string, string>();
    for (const e of p.exercises) {
      const k = normalizeNome(e.nome);
      const local = idx.get(k);
      let id: string;
      if (local?.ativo) id = local.ativo.id;
      else if (local?.excluido) {
        id = local.excluido.id;
        await db.exercises.update(id, { deletedAt: null, updatedAt: now() });
        idx.set(k, { ativo: { ...local.excluido, deletedAt: null } });
      } else {
        const equipmentId = e.equipmentId && mapaAparelho.get(e.equipmentId);
        const novo: Exercise = { ...e, ...stamp<Exercise>({} as Exercise), equipmentId: equipmentId || undefined };
        if (!novo.equipmentId) delete novo.equipmentId;
        await db.exercises.add(novo);
        idx.set(k, { ativo: novo });
        id = novo.id;
      }
      mapaExercicio.set(e.id, id);
      const img = imagem.get(e.id);
      if (img && !(await temFoto(id))) {
        await db.exerciseImages.add(stamp<ExerciseImage>({ exerciseId: id, blob: img.blob, mimeType: img.mimeType, largura: img.largura, altura: img.altura }));
      }
    }

    const ocupada = new Map(conflitos.map((c) => [c.ficha.id, c.ocupante]));
    for (const f of p.workoutPlans) {
      const ocupante = ocupada.get(f.id);
      if (ocupante) {
        if (!substituir.has(f.id)) continue;
        const ts = now();
        await db.workoutPlans.update(ocupante.id, { deletedAt: ts, updatedAt: ts });
      }
      await db.workoutPlans.add(stamp<WorkoutPlan>({
        nome: f.nome, diaSemana: f.diaSemana, local: localDe(f),
        itens: f.itens.map((it) => ({ ...it, exerciseId: mapaExercicio.get(it.exerciseId)! })),
      }));
    }
  });
}
