import type { Exercise, NewRecord, UserSettings, WorkoutPlan, WorkoutPlanItem } from './types';
import { stamp } from './repositories/base';
import { normalizeNome } from './normalize';

export const DEFAULT_SETTINGS: NewRecord<UserSettings> = {
  descansoPadraoSeg: 90,
  cardioPadrao: { modalidade: 'esteira', duracaoMin: 15, inclinacaoNivel: { valor: 7, rotulo: 'nível 7' } },
  interface: { tema: 'escuro', vibrar: true },
};

type Ex = Pick<Exercise, 'nome' | 'grupoPrincipal'> &
  Partial<Pick<Exercise, 'gruposSecundarios' | 'tipo' | 'porLado'>>;
type Linha = [ex: Ex, series: number, repsMin: number, repsMax: number];

const corpo = { tipo: 'peso_corporal', porLado: true } as const;

const SUPINO: Ex = { nome: 'Supino máquina', grupoPrincipal: 'peito', gruposSecundarios: ['tríceps', 'ombros'] };
const LEG: Ex = { nome: 'Leg press', grupoPrincipal: 'quadríceps', gruposSecundarios: ['glúteos'] };
const FLEXORA: Ex = { nome: 'Cadeira flexora', grupoPrincipal: 'posterior de coxa' };
const REMADA_APOIO: Ex = { nome: 'Remada com apoio no peito', grupoPrincipal: 'costas', gruposSecundarios: ['bíceps', 'ombros'] };

export const FICHA: { nome: string; diaSemana: number; itens: Linha[] }[] = [
  { nome: 'Peito e tríceps', diaSemana: 1, itens: [
    [SUPINO, 3, 10, 12],
    [{ nome: 'Supino inclinado articulado', grupoPrincipal: 'peito', gruposSecundarios: ['ombros', 'tríceps'] }, 3, 10, 12],
    [{ nome: 'Crucifixo máquina', grupoPrincipal: 'peito' }, 2, 12, 15],
    [{ nome: 'Tríceps polia barra reta', grupoPrincipal: 'tríceps' }, 3, 10, 15],
    [{ nome: 'Tríceps corda', grupoPrincipal: 'tríceps' }, 2, 12, 15],
  ] },
  { nome: 'Pernas A e abdômen', diaSemana: 2, itens: [
    [LEG, 3, 10, 12],
    [{ nome: 'Cadeira extensora', grupoPrincipal: 'quadríceps' }, 3, 12, 15],
    [FLEXORA, 3, 10, 15],
    [{ nome: 'Panturrilha máquina', grupoPrincipal: 'panturrilha' }, 3, 12, 15],
    [{ nome: 'Abdominal máquina', grupoPrincipal: 'abdômen' }, 2, 12, 15],
  ] },
  { nome: 'Costas e bíceps', diaSemana: 3, itens: [
    [{ nome: 'Puxada frontal', grupoPrincipal: 'costas', gruposSecundarios: ['bíceps'] }, 3, 10, 12],
    [{ nome: 'Remada baixa', grupoPrincipal: 'costas', gruposSecundarios: ['bíceps'] }, 3, 10, 12],
    [REMADA_APOIO, 2, 12, 12],
    [{ nome: 'Rosca martelo', grupoPrincipal: 'bíceps', gruposSecundarios: ['antebraço'] }, 3, 10, 12],
    [{ nome: 'Rosca barra W', grupoPrincipal: 'bíceps' }, 2, 12, 12],
  ] },
  { nome: 'Ombros e core', diaSemana: 4, itens: [
    [{ nome: 'Desenvolvimento máquina', grupoPrincipal: 'ombros', gruposSecundarios: ['tríceps'] }, 3, 10, 12],
    [{ nome: 'Elevação lateral', grupoPrincipal: 'ombros' }, 3, 12, 15],
    [{ nome: 'Crucifixo inverso', grupoPrincipal: 'ombros', gruposSecundarios: ['costas'] }, 3, 12, 15],
    [{ nome: 'Bird dog', grupoPrincipal: 'core', gruposSecundarios: ['glúteos'], ...corpo }, 2, 10, 10],
    [{ nome: 'Dead bug', grupoPrincipal: 'core', ...corpo }, 2, 10, 10],
  ] },
  { nome: 'Pernas B e corpo inteiro', diaSemana: 5, itens: [
    [FLEXORA, 3, 10, 12],
    [LEG, 3, 12, 12],
    [{ nome: 'Cadeira abdutora', grupoPrincipal: 'glúteos' }, 2, 12, 15],
    [SUPINO, 2, 12, 12],
    [REMADA_APOIO, 2, 12, 12],
  ] },
];

/** Link de busca no YouTube: "como fazer <nome>". */
export const linkDeBusca = (nome: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`como fazer ${nome}`)}`;

/** Nome normalizado → link, para todos os exercícios da ficha inicial. */
export const LINKS_DO_SEED = new Map(FICHA.flatMap((d) => d.itens.map(([ex]) => [normalizeNome(ex.nome), linkDeBusca(ex.nome)] as const)));

/** Monta os registros da ficha inicial; nomes iguais (normalizados) viram um único Exercise. */
export function buildSeed() {
  const exercicios = new Map<string, Exercise>();
  const workoutPlans = FICHA.map((dia) => {
    const itens: WorkoutPlanItem[] = dia.itens.map(([ex, series, repsMin, repsMax], ordem) => {
      const chave = normalizeNome(ex.nome);
      let exercise = exercicios.get(chave);
      if (!exercise) {
        exercise = stamp<Exercise>({ tipo: 'carga', unidadeCarga: 'kg', porLado: false, gruposSecundarios: [], ...ex, videoUrl: linkDeBusca(ex.nome) });
        exercicios.set(chave, exercise);
      }
      return { exerciseId: exercise.id, series, repsMin, repsMax, descansoSeg: DEFAULT_SETTINGS.descansoPadraoSeg, ordem };
    });
    return stamp<WorkoutPlan>({ nome: dia.nome, diaSemana: dia.diaSemana, local: 'academia', itens });
  });
  return { exercises: [...exercicios.values()], workoutPlans, settings: stamp<UserSettings>(DEFAULT_SETTINGS) };
}
