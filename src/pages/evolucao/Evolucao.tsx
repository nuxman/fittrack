import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Page } from '../../components/Page';
import { useAsync } from '../../useAsync';
import { exerciciosComSeries } from '../../evolucao';
import { carregarEvolucao, ddmm } from './dados';
import { EvolucaoCardio } from './EvolucaoCardio';
import { EvolucaoCorpo } from './EvolucaoCorpo';

const ABAS = [
  ['exercicios', 'Exercícios'],
  ['cardio', 'Cardio'],
  ['corpo', 'Corpo'],
] as const;
type Aba = (typeof ABAS)[number][0];

/** Aba Evolução: "Exercícios | Cardio | Corpo" no topo. A escolha fica na URL (?ver=cardio, ?ver=corpo), para o Voltar voltar a ela. */
export default function Evolucao() {
  const [params, setParams] = useSearchParams();
  const aba: Aba = ABAS.find(([v]) => v === params.get('ver'))?.[0] ?? 'exercicios';
  return (
    <Page title="Evolução">
      <div role="group" aria-label="O que ver" className="grid grid-cols-3 gap-1 rounded-2xl bg-surface p-1">
        {ABAS.map(([v, rotulo]) => (
          <button
            key={v}
            type="button"
            aria-pressed={v === aba}
            className={v === aba ? 'btn-primary px-1' : 'btn px-1 text-neutral-300'}
            onClick={() => setParams(v === 'exercicios' ? {} : { ver: v }, { replace: true })}
          >
            {rotulo}
          </button>
        ))}
      </div>
      {aba === 'cardio' ? <EvolucaoCardio /> : aba === 'corpo' ? <EvolucaoCorpo /> : <Exercicios />}
    </Page>
  );
}

/** Exercícios com séries registradas, do treinado mais recentemente ao mais antigo. */
function Exercicios() {
  const [dados] = useAsync(async () => {
    const d = await carregarEvolucao();
    return exerciciosComSeries(d.sessoes, d.sets, d.nomes);
  });

  if (!dados) return <p>Carregando…</p>;
  if (dados.length === 0) {
    return (
      <div className="card space-y-4">
        <p className="text-lg text-neutral-300">
          Aqui você vai ver a evolução de carga, volume e recordes de cada exercício depois dos primeiros treinos. Comece pela aba Treinar.
        </p>
        <Link to="/treinar" className="btn-primary w-full">Ir para Treinar</Link>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {dados.map((e) => (
        <li key={e.exerciseId}>
          <Link to={`/evolucao/${e.exerciseId}`} className="card flex items-center gap-3" data-testid="item-evolucao">
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold">{e.nome}</p>
              <p className="text-sm text-neutral-400">
                {e.sessoes} {e.sessoes === 1 ? 'treino' : 'treinos'} · último em {ddmm(e.ultima)}
              </p>
            </div>
            <ChevronRight size={22} className="shrink-0 text-neutral-500" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
