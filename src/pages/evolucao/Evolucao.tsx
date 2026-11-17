import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Page } from '../../components/Page';
import { useAsync } from '../../useAsync';
import { exerciciosComSeries } from '../../evolucao';
import { carregarEvolucao, ddmm } from './dados';

/** Aba Evolução: exercícios com séries registradas, do treinado mais recentemente ao mais antigo. */
export default function Evolucao() {
  const [dados] = useAsync(async () => {
    const d = await carregarEvolucao();
    return exerciciosComSeries(d.sessoes, d.sets, d.nomes);
  });

  return (
    <Page title="Evolução">
      {!dados ? (
        <p>Carregando…</p>
      ) : dados.length === 0 ? (
        <div className="card space-y-4">
          <p className="text-lg text-neutral-300">
            Aqui você vai ver a evolução de carga, volume e recordes de cada exercício depois dos primeiros treinos. Comece pela aba Treinar.
          </p>
          <Link to="/treinar" className="btn-primary w-full">Ir para Treinar</Link>
        </div>
      ) : (
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
      )}
    </Page>
  );
}
