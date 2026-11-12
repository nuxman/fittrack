import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { Page } from '../components/Page';
import { GrupoIcone } from '../components/GrupoIcone';
import { FotoAmpliavel } from '../components/FotoAmpliavel';
import { Anotacoes } from '../components/Anotacoes';
import { VerExecucao } from '../components/VerExecucao';
import { useAsync } from '../useAsync';
import { exercisesRepository } from '../db/repositories/exercises';
import { exerciseImagesRepository } from '../db/repositories/exerciseImages';
import { exerciseSetsRepository } from '../db/repositories/exerciseSets';
import { workoutPlansRepository } from '../db/repositories/workoutPlans';
import { formatarPrescricao } from '../format';
import { formatarSerie } from '../sessao';

/** Detalhe do exercício fora da sessão (aberto pelas miniaturas). Somente leitura, exceto "Minhas anotações". */
export function ExercicioDetalhe() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const fichaId = params.get('ficha');
  const [dados, recarregar] = useAsync(async () => {
    const [ex, img, ultima, ficha] = await Promise.all([
      exercisesRepository.get(id),
      exerciseImagesRepository.getForExercise(id),
      exerciseSetsRepository.ultimaDoExercicio(id),
      fichaId ? workoutPlansRepository.get(fichaId) : undefined,
    ]);
    return { ex, foto: img && img.blob.size > 0 ? img.blob : undefined, ultima, item: ficha?.itens.find((i) => i.exerciseId === id) };
  }, [id, fichaId]);

  if (!dados) return <Page title="Exercício" voltar>Carregando…</Page>;
  const { ex, foto, ultima, item } = dados;
  if (!ex) return <Page title="Exercício" voltar><p className="card">Exercício não encontrado.</p></Page>;

  return (
    <Page title={ex.nome} voltar>
      {foto ? (
        <FotoAmpliavel blob={foto} grupo={ex.grupoPrincipal} className="h-64 w-full" />
      ) : (
        <div className="flex h-24 items-center justify-center rounded-2xl bg-surface">
          <GrupoIcone grupo={ex.grupoPrincipal} size={48} />
        </div>
      )}
      <section className="card space-y-1" aria-label="Prescrição">
        {item && <p className="text-lg">Na ficha: {formatarPrescricao(item, ex)} · descanso {item.descansoSeg} s</p>}
        <p className="text-neutral-300">Última carga: {ultima ? formatarSerie(ultima, ex) : 'sem registro'}</p>
      </section>
      <VerExecucao url={ex.videoUrl} />
      <Anotacoes exerciseId={ex.id} inicial={ex.anotacoes ?? ''} onSalvo={recarregar} aberto />
      <details className="card" open>
        <summary className="cursor-pointer text-lg font-semibold">Grupos trabalhados</summary>
        <p className="mt-2 text-neutral-300">Principal: {ex.grupoPrincipal}</p>
        {ex.gruposSecundarios.length > 0 && <p className="text-neutral-300">Secundários: {ex.gruposSecundarios.join(', ')}</p>}
      </details>
      <Link to={`/exercicios/${ex.id}`} className="btn-secondary w-full">
        <Pencil size={20} /> Editar exercício
      </Link>
    </Page>
  );
}
