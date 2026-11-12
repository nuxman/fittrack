import { Link } from 'react-router-dom';
import type { Exercise, WorkoutPlanItem } from '../db/types';
import { ordenarItens } from '../db/repositories/workoutPlans';
import { FotoExercicio } from './FotoExercicio';

/** Fileira com rolagem horizontal: foto (ou ícone do grupo) de cada exercício da ficha; toque abre o detalhe. */
export function Miniaturas({ planId, itens, exercicios, imagens }: {
  planId: string;
  itens: WorkoutPlanItem[];
  exercicios: Map<string, Exercise>;
  imagens: Map<string, Blob>;
}) {
  return (
    <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Exercícios da ficha">
      {ordenarItens(itens).map((i) => {
        const ex = exercicios.get(i.exerciseId);
        if (!ex) return null;
        return (
          <li key={i.exerciseId} className="shrink-0">
            <Link to={`/exercicio/${ex.id}?ficha=${planId}`} aria-label={ex.nome} className="block w-16 space-y-1">
              <FotoExercicio blob={imagens.get(ex.id)} grupo={ex.grupoPrincipal} className="h-16 w-16" iconeSize={24} />
              <p className="truncate text-center text-xs text-neutral-400">{ex.nome}</p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
