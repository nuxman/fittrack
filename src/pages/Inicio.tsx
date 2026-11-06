import { Page } from '../components/Page';
import { useAsync } from '../useAsync';
import { workoutPlansRepository } from '../db/repositories/workoutPlans';
import { exercisesRepository } from '../db/repositories/exercises';
import { DIAS } from '../dias';


export function Inicio() {
  const [data] = useAsync(async () => {
    const [planos, exercicios] = await Promise.all([workoutPlansRepository.list(), exercisesRepository.list()]);
    return { planos: planos.sort((a, b) => a.diaSemana - b.diaSemana), nomes: new Map(exercicios.map((e) => [e.id, e.nome])) };
  });
  const hoje = new Date().getDay();

  if (!data) return <Page title="Início">Carregando…</Page>;

  return (
    <Page title="Início">
      {data.planos.map((p) => (
        <section key={p.id} className={`card ${p.diaSemana === hoje ? 'ring-2 ring-primary-400' : ''}`}>
          <h2 className="text-lg font-semibold">
            {DIAS[p.diaSemana]} — {p.nome}
            {p.diaSemana === hoje && <span className="ml-2 text-sm text-primary-400">hoje</span>}
          </h2>
          <ul className="mt-2 space-y-1 text-neutral-300">
            {[...p.itens].sort((a, b) => a.ordem - b.ordem).map((i) => (
              <li key={i.ordem}>
                {data.nomes.get(i.exerciseId) ?? 'Exercício removido'} · {i.series}×
                {i.repsMin === i.repsMax ? i.repsMin : `${i.repsMin}–${i.repsMax}`}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Page>
  );
}
