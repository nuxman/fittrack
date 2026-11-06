import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { Page } from '../components/Page';
import { ExercisePicker } from '../components/ExercisePicker';
import { useDialog } from '../components/ConfirmDialog';
import { useAsync } from '../useAsync';
import type { Exercise, WorkoutPlanItem } from '../db/types';
import { exercisesRepository } from '../db/repositories/exercises';
import { settingsRepository } from '../db/repositories/settings';
import {
  DiaOcupadoError, faixaReps, FichaInvalidaError, moverItem, ordenarItens, validarFicha, workoutPlansRepository,
} from '../db/repositories/workoutPlans';
import { DIAS, SEMANA } from '../dias';

type Campo = 'series' | 'repsMin' | 'repsMax' | 'descansoSeg';

const numero = (v: string) => (v.trim() === '' ? NaN : Number(v));
const mostrar = (n: number) => (Number.isNaN(n) ? '' : String(n));

export function FichaEditor() {
  const { id } = useParams();
  const nova = id === undefined;
  const navigate = useNavigate();
  const { confirmar, escolher } = useDialog();

  const [dados] = useAsync(async () => {
    const [planos, exercicios, settings] = await Promise.all([
      workoutPlansRepository.list(), exercisesRepository.list(), settingsRepository.get(),
    ]);
    return { planos, exercicios: new Map(exercicios.map((e) => [e.id, e])), descansoPadrao: settings.descansoPadraoSeg };
  }, [id]);

  const [nome, setNome] = useState('');
  const [dia, setDia] = useState<number>();
  const [itens, setItens] = useState<WorkoutPlanItem[]>([]);
  const [extras, setExtras] = useState(new Map<string, Exercise>());
  const [sujo, setSujo] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [escolhendo, setEscolhendo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const plano = dados?.planos.find((p) => p.id === id);
  const ocupados = new Map(dados?.planos.filter((p) => p.id !== id).map((p) => [p.diaSemana, p]));

  useEffect(() => {
    if (!dados) return;
    if (plano) {
      setNome(plano.nome);
      setDia(plano.diaSemana);
      setItens(ordenarItens(plano.itens));
    } else if (nova) {
      setDia(SEMANA.find((d) => !dados.planos.some((p) => p.diaSemana === d)));
    }
    setSujo(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados]);

  if (!dados) return <Page title="Ficha" voltar>Carregando…</Page>;
  if (!nova && !plano) return <Page title="Ficha" voltar><p className="card">Ficha não encontrada.</p></Page>;

  const exercicio = (eid: string) => extras.get(eid) ?? dados.exercicios.get(eid);
  const mudar = (f: () => void) => {
    f();
    setSujo(true);
    setErros([]);
  };
  const setCampo = (i: number, campo: Campo, v: number) =>
    mudar(() => setItens((xs) => xs.map((it, j) => (j === i ? { ...it, [campo]: v } : it))));

  /** Salva; retorna o id da ficha ou undefined se não salvou. */
  async function salvar(): Promise<string | undefined> {
    if (dia === undefined) return setErros(['Escolha o dia da semana']), undefined;
    const ficha = { nome, diaSemana: dia, itens };
    const locais = validarFicha(ficha, exercicio);
    if (locais.length) return setErros(locais), undefined;

    setSalvando(true);
    try {
      if (nova) return (await workoutPlansRepository.create(ficha)).id;
      try {
        await workoutPlansRepository.update(id, ficha);
      } catch (e) {
        if (!(e instanceof DiaOcupadoError)) throw e;
        const ok = await confirmar(
          'Trocar os dias?',
          `${DIAS[dia]} já tem "${e.ocupante.nome}". Ela passa para ${DIAS[plano!.diaSemana]}.`,
          'Trocar os dias',
        );
        if (!ok) return undefined;
        await workoutPlansRepository.update(id, ficha, { trocarDia: true });
      }
      return id;
    } catch (e) {
      setErros(e instanceof FichaInvalidaError ? e.erros : [e instanceof Error ? e.message : 'Erro ao salvar']);
      return undefined;
    } finally {
      setSalvando(false);
    }
  }

  async function abrirExercicio(eid: string) {
    if (sujo) {
      const r = await escolher({
        titulo: 'Alterações não salvas',
        mensagem: 'Salvar a ficha antes de abrir o exercício?',
        opcoes: [
          { label: 'Salvar e abrir', value: 'salvar' as const },
          { label: 'Abrir sem salvar', value: 'descartar' as const, variante: 'secundaria' },
        ],
      });
      if (r === null) return;
      if (r === 'salvar') {
        const salvo = await salvar();
        if (!salvo) return;
        if (nova) navigate(`/fichas/${salvo}`, { replace: true });
      }
    }
    navigate(`/exercicios/${eid}`);
  }

  async function excluir() {
    if (!plano || !(await confirmar('Excluir ficha?', `"${plano.nome}" será removida. Sessões já feitas continuam no histórico.`, 'Excluir', true))) return;
    await workoutPlansRepository.remove(plano.id);
    navigate('/treinar', { replace: true });
  }

  return (
    <Page title={nova ? 'Nova ficha' : 'Editar ficha'} voltar>
      <label className="block space-y-1">
        <span className="text-sm text-neutral-400">Nome</span>
        <input className="input" value={nome} onChange={(e) => mudar(() => setNome(e.target.value))} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-neutral-400">Dia da semana</span>
        <select className="input" value={dia ?? ''} onChange={(e) => mudar(() => setDia(Number(e.target.value)))}>
          {SEMANA.filter((d) => !nova || !ocupados.has(d)).map((d) => (
            <option key={d} value={d}>
              {DIAS[d]}{ocupados.has(d) ? ` (ocupado: ${ocupados.get(d)!.nome})` : ''}
            </option>
          ))}
        </select>
      </label>

      <ol className="space-y-3">
        {itens.map((it, i) => {
          const ex = exercicio(it.exerciseId);
          const tempo = ex?.tipo === 'tempo';
          const [min, max] = faixaReps(ex?.tipo ?? 'carga');
          return (
            <li key={it.exerciseId} className="card space-y-3" data-testid="item-ficha">
              <div className="flex items-center gap-1">
                <button type="button" className="flex min-h-12 flex-1 items-center gap-1 text-left text-lg font-semibold" onClick={() => abrirExercicio(it.exerciseId)}>
                  {ex?.nome ?? 'Exercício removido'} <ChevronRight size={20} className="text-neutral-500" />
                </button>
                <button type="button" aria-label="Subir" className="p-3 disabled:opacity-30" disabled={i === 0} onClick={() => mudar(() => setItens((xs) => moverItem(xs, i, -1)))}>
                  <ArrowUp size={24} />
                </button>
                <button type="button" aria-label="Descer" className="p-3 disabled:opacity-30" disabled={i === itens.length - 1} onClick={() => mudar(() => setItens((xs) => moverItem(xs, i, 1)))}>
                  <ArrowDown size={24} />
                </button>
                <button type="button" aria-label="Remover da ficha" className="p-3 text-red-400" onClick={() => mudar(() => setItens((xs) => xs.filter((_, j) => j !== i)))}>
                  <X size={24} />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {([
                  ['series', 'Séries', 1, 10],
                  ['repsMin', tempo ? 'Seg mín' : 'Reps mín', min, max],
                  ['repsMax', tempo ? 'Seg máx' : 'Reps máx', min, max],
                  ['descansoSeg', 'Descanso (s)', 0, 600],
                ] as const).map(([campo, rotulo, lo, hi]) => (
                  <label key={campo} className="space-y-1">
                    <span className="block text-xs text-neutral-400">{rotulo}</span>
                    <input
                      className="input px-2 text-center"
                      type="number"
                      inputMode="numeric"
                      min={lo}
                      max={hi}
                      aria-label={`${rotulo} — ${ex?.nome ?? ''}`}
                      value={mostrar(it[campo])}
                      onChange={(e) => setCampo(i, campo, numero(e.target.value))}
                    />
                  </label>
                ))}
              </div>
            </li>
          );
        })}
      </ol>

      <button type="button" className="btn-secondary w-full" onClick={() => setEscolhendo(true)}>
        <Plus size={22} /> Adicionar exercício
      </button>

      {erros.length > 0 && (
        <ul role="alert" className="card space-y-1 text-red-400">
          {erros.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      <button type="button" className="btn-primary w-full" disabled={salvando} onClick={async () => {
        const salvo = await salvar();
        if (salvo) navigate('/treinar', { replace: true });
      }}>
        Salvar
      </button>
      {!nova && (
        <button type="button" className="btn w-full text-red-400" onClick={excluir}>
          <Trash2 size={22} /> Excluir ficha
        </button>
      )}

      {escolhendo && (
        <ExercisePicker
          excluirIds={itens.map((i) => i.exerciseId)}
          onFechar={() => setEscolhendo(false)}
          onEscolher={(e) => {
            setEscolhendo(false);
            setExtras((m) => new Map(m).set(e.id, e));
            const [rmin, rmax] = e.tipo === 'tempo' ? [30, 30] : [10, 12];
            mudar(() => setItens((xs) => [
              ...xs,
              { exerciseId: e.id, series: 3, repsMin: rmin, repsMax: rmax, descansoSeg: dados.descansoPadrao, ordem: xs.length },
            ]));
          }}
        />
      )}
    </Page>
  );
}
