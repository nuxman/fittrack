import { useParams } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { Page } from '../../components/Page';
import { useAsync } from '../../useAsync';
import { exerciciosComSeries, pontosDoExercicio, porMedida, recordes, type Medida, type Recorde } from '../../evolucao';
import { carregarEvolucao, ddmm, kg, SERIES } from './dados';
import { Grafico } from './Grafico';

const TITULO: Record<Medida, string> = { kg: 'Carga em kg', placa: 'Carga em placa', peso_corporal: 'Peso corporal', tempo: 'Tempo' };

/** Maior volume em kg; os outros recordes na unidade do primeiro gráfico da medida. */
const formatarRecorde = (medida: Medida, r: Recorde) =>
  `${(r.rotulo === 'Maior volume' ? kg : SERIES[medida][0]!.formatar)(r.valor)}${r.reps != null ? ` × ${r.reps}` : ''}`;

/** Evolução de um exercício: recordes, gráficos e tabela, separados por unidade. */
export default function EvolucaoExercicio() {
  const { id = '' } = useParams();
  const [dados] = useAsync(async () => {
    const d = await carregarEvolucao();
    const nome = exerciciosComSeries(d.sessoes, d.sets, d.nomes).find((e) => e.exerciseId === id)?.nome ?? d.nomes.get(id) ?? 'Exercício';
    return { nome, grupos: [...porMedida(pontosDoExercicio(id, d.sessoes, d.sets))] };
  }, [id]);

  if (!dados) return <Page title="Evolução" voltar>Carregando…</Page>;
  return (
    <Page title={dados.nome} voltar>
      {dados.grupos.length === 0 && <p className="card text-neutral-300">Nenhuma série registrada para este exercício.</p>}
      {dados.grupos.map(([medida, pontos]) => (
        <section key={medida} className="card space-y-4" aria-label={TITULO[medida]}>
          {dados.grupos.length > 1 && <h2 className="text-lg font-semibold text-primary-400">{TITULO[medida]}</h2>}

          <ul className="space-y-1" aria-label="Recordes">
            {recordes(medida, pontos).map((r) => (
              <li key={r.rotulo} className="flex items-center gap-2" data-testid="recorde">
                <Trophy size={18} className="shrink-0 text-primary-400" aria-hidden />
                <span>
                  <span className="text-neutral-300">{r.rotulo}:</span> <span className="font-semibold">{formatarRecorde(medida, r)}</span>{' '}
                  <span className="text-sm text-neutral-500">em {ddmm(r.data)}</span>
                </span>
              </li>
            ))}
          </ul>

          {pontos.length < 2 ? (
            <p className="text-sm text-neutral-400">O gráfico aparece a partir do segundo treino com este exercício.</p>
          ) : (
            SERIES[medida].map((s) => <Grafico key={s.titulo} {...s} pontos={pontos} />)
          )}

          <details>
            <summary className="cursor-pointer text-neutral-300">Ver em tabela</summary>
            <table className="mt-2 w-full text-left text-sm">
              <thead className="text-neutral-400">
                <tr>
                  <th className="py-1 font-normal">Data</th>
                  {SERIES[medida].map((s) => <th key={s.titulo} className="py-1 font-normal">{s.titulo.replace(/ por treino$/, '')}</th>)}
                </tr>
              </thead>
              <tbody>
                {[...pontos].reverse().map((p) => (
                  <tr key={p.sessionId} className="border-t border-neutral-800">
                    <td className="py-1">{ddmm(p.data)}</td>
                    {SERIES[medida].map((s) => {
                      const v = s.valor(p);
                      return <td key={s.titulo} className="py-1">{v == null ? '—' : s.formatar(v)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      ))}
    </Page>
  );
}
