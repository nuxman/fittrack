import { Link, useNavigate } from 'react-router-dom';
import { Flag, SkipForward, Undo2 } from 'lucide-react';
import { useSessao } from './SessaoLayout';
import { FotoExercicio } from '../../components/FotoExercicio';
import { workoutSessionsRepository } from '../../db/repositories/workoutSessions';
import { formatarSerie, prescricaoSessao, pulados, seriesFeitas, statusExercicio, type StatusExercicio } from '../../sessao';

const ROTULO: Record<Exclude<StatusExercicio, 'parcial'>, string> = { pendente: 'Pendente', concluido: 'Concluído', pulado: 'Pulado' };

export function SessaoVisao() {
  const { sessao, sets, imagens, ultimas, agir } = useSessao();
  const navigate = useNavigate();
  const pul = pulados(sessao);
  const itens = [...sessao.planSnapshot.itens].sort((a, b) => a.ordem - b.ordem);

  return (
    <>
      <ul className="space-y-2">
        {itens.map((i) => {
          const st = statusExercicio(i, sets, pul);
          const ultima = ultimas.get(i.exerciseId);
          return (
            <li key={i.exerciseId} className="card flex items-center gap-3" data-testid="item-sessao">
              <Link to={`/sessao/${i.exerciseId}`} className="flex min-w-0 flex-1 items-center gap-3">
                <FotoExercicio blob={imagens.get(i.exerciseId)} grupo={i.grupoPrincipal} className="h-14 w-14 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold">{i.nome}</p>
                  <p className="text-sm text-neutral-400">
                    {prescricaoSessao(i)} | {ultima ? formatarSerie(ultima, i) : 'sem registro'}
                  </p>
                  <p className={`text-sm font-semibold ${st === 'concluido' ? 'text-primary-400' : 'text-neutral-300'}`}>
                    {st === 'parcial' ? `${seriesFeitas(sets, i.exerciseId)}/${i.series}` : ROTULO[st]}
                  </p>
                </div>
              </Link>
              {st === 'pulado' && (
                <button type="button" className="btn-secondary shrink-0 px-3" onClick={() => agir((s) => workoutSessionsRepository.despular(s.id, i.exerciseId))}>
                  <Undo2 size={20} /> Desfazer pulo
                </button>
              )}
              {(st === 'pendente' || st === 'parcial') && (
                <button type="button" className="btn-secondary shrink-0 px-3" onClick={() => agir((s) => workoutSessionsRepository.pular(s.id, i.exerciseId))}>
                  <SkipForward size={20} /> Pular
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <details className="card">
        <summary className="cursor-pointer text-lg font-semibold">Durante o treino</summary>
        <div className="mt-3 space-y-2 text-neutral-300">
          <p>Não prenda a respiração: respire durante todo o movimento, soltando o ar na fase de esforço.</p>
          <p>Pare o treino se sentir:</p>
          <ul className="list-disc pl-6">
            <li>dor no peito;</li>
            <li>tontura;</li>
            <li>falta de ar desproporcional ao esforço;</li>
            <li>dor articular aguda.</li>
          </ul>
          <p className="text-sm text-neutral-400">Isto não é orientação médica. Na dúvida, procure um profissional de saúde.</p>
        </div>
      </details>

      <div className="fixed inset-x-0 bottom-above-nav z-10 px-4">
        <button type="button" className="btn-primary mx-auto flex w-full max-w-xl" onClick={() => navigate('/sessao/finalizar')}>
          <Flag size={22} /> Finalizar treino
        </button>
      </div>
      <div className="h-16" aria-hidden />
    </>
  );
}
