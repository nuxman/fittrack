import { Link } from 'react-router-dom';
import { useAsync } from '../../useAsync';
import { pontosDoExercicio, porMedida } from '../../evolucao';
import { carregarEvolucao, SERIES } from './dados';
import { Grafico } from './Grafico';

/** Mini gráfico "Evolução de carga": a medida mais recente do exercício (carga máxima, placa, reps ou tempo) e link para a Evolução. */
export default function MiniGrafico({ exerciseId }: { exerciseId: string }) {
  const [pontos] = useAsync(async () => {
    const d = await carregarEvolucao();
    const lista = pontosDoExercicio(exerciseId, d.sessoes, d.sets);
    const ultima = lista.at(-1);
    return ultima ? porMedida(lista).get(ultima.medida)! : [];
  }, [exerciseId]);

  if (!pontos) return <p className="text-neutral-400">Carregando…</p>;
  if (pontos.length < 2) {
    return (
      <p className="text-sm text-neutral-400" data-testid="mini-grafico-vazio">
        {pontos.length === 0 ? 'Nenhum treino anterior com este exercício.' : 'O gráfico aparece a partir do segundo treino com este exercício.'}
      </p>
    );
  }
  const serie = SERIES[pontos[0]!.medida][0]!;
  return (
    <div className="space-y-2">
      <Grafico {...serie} pontos={pontos.slice(-10)} altura="h-36" />
      <Link to={`/evolucao/${exerciseId}`} className="text-sm font-semibold text-primary-400 underline">
        Ver evolução completa
      </Link>
    </div>
  );
}
