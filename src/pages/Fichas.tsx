import { Link } from 'react-router-dom';
import { Pencil, Plus } from 'lucide-react';
import { Page } from '../components/Page';
import { useAsync } from '../useAsync';
import { workoutPlansRepository } from '../db/repositories/workoutPlans';
import { DIAS, SEMANA } from '../dias';

/** Aba Treinar (provisória até a Etapa 3): lista das fichas para edição. */
export function Fichas() {
  const [planos] = useAsync(() => workoutPlansRepository.list());
  if (!planos) return <Page title="Treinar">Carregando…</Page>;

  const ordenados = [...planos].sort((a, b) => SEMANA.indexOf(a.diaSemana) - SEMANA.indexOf(b.diaSemana));
  const haDiaLivre = planos.length < 7;

  return (
    <Page title="Treinar">
      {ordenados.map((p) => (
        <section key={p.id} className="card flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase text-primary-400">{DIAS[p.diaSemana]}</p>
            <h2 className="text-lg font-semibold">{p.nome}</h2>
            <p className="text-neutral-400">{p.itens.length} exercícios</p>
          </div>
          <Link to={`/fichas/${p.id}`} className="btn-secondary shrink-0">
            <Pencil size={20} /> Editar ficha
          </Link>
        </section>
      ))}
      {ordenados.length === 0 && <p className="card text-neutral-400">Nenhuma ficha cadastrada.</p>}
      {haDiaLivre && (
        <Link to="/fichas/nova" className="btn-primary w-full">
          <Plus size={22} /> Nova ficha
        </Link>
      )}
    </Page>
  );
}
