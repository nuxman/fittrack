import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Play } from 'lucide-react';
import type { WorkoutPlan } from '../db/types';
import { DIAS } from '../dias';
import { duracaoEstimadaSeg, formatarEstimativa, gruposDaFicha } from '../semana';
import type { Painel } from '../painel';
import { Miniaturas } from './Miniaturas';

/** Card de ficha (aba Treinar e Início): nome, grupos, nº de exercícios, duração estimada, miniaturas e ações. */
export function CardFicha({ plano, painel, destaque, motivo, aviso, iniciando, onIniciar, editar = true, retomar = false, children }: {
  plano: WorkoutPlan;
  painel: Painel;
  destaque?: boolean;
  /** "Treino de hoje", "Pendente de terça"… */
  motivo?: string;
  aviso?: string | null;
  iniciando: boolean;
  onIniciar: () => void;
  editar?: boolean;
  /** Início: com sessão ativa, "Retomar treino" no lugar de "Iniciar". */
  retomar?: boolean;
  children?: ReactNode;
}) {
  const grupos = gruposDaFicha(plano.itens, (id) => painel.exercicios.get(id)?.grupoPrincipal);
  return (
    <section className={`card space-y-3 ${destaque ? 'ring-2 ring-primary-400' : ''}`} aria-label={plano.nome} data-testid="card-ficha">
      <div>
        <p className="text-sm font-semibold uppercase text-primary-400">{motivo ?? DIAS[plano.diaSemana]}</p>
        <h2 className="text-lg font-semibold">{plano.nome}</h2>
        {grupos.length > 0 && <p className="text-sm text-neutral-300">{grupos.join(', ')}</p>}
        <p className="text-neutral-400">
          {plano.itens.length} exercícios · {formatarEstimativa(duracaoEstimadaSeg(plano, painel.sessoes))}
        </p>
        {aviso && <p className="mt-1 text-sm text-neutral-400" data-testid="aviso-grupo">{aviso}</p>}
      </div>
      <Miniaturas planId={plano.id} itens={plano.itens} exercicios={painel.exercicios} imagens={painel.imagens} />
      <div className={`grid gap-2 ${editar ? 'grid-cols-2' : ''}`}>
        {retomar ? (
          <Link to="/sessao" className="btn-primary">
            <Play size={22} /> Retomar treino
          </Link>
        ) : (
          <button type="button" className="btn-primary" disabled={iniciando || plano.itens.length === 0} onClick={onIniciar} aria-label={`Iniciar ${plano.nome}`}>
            <Play size={22} /> Iniciar
          </button>
        )}
        {editar && (
          <Link to={`/fichas/${plano.id}`} className="btn-secondary">
            <Pencil size={20} /> Editar ficha
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
