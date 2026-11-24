import { Check, Play } from 'lucide-react';
import type { LocalTreino, WorkoutPlan } from '../db/types';
import { DIAS } from '../dias';
import { fichasDaSemana } from '../semana';
import type { Painel } from '../painel';

/** "Fichas da semana" (Início e aba Treinar): cada ficha do local, na ordem da semana; faltantes em destaque; tocar inicia. */
export function FichasDaSemana({ painel, local, agora, iniciando, onIniciar }: {
  painel: Painel;
  local: LocalTreino;
  agora: Date;
  iniciando: boolean;
  onIniciar: (p: WorkoutPlan) => void;
}) {
  const lista = fichasDaSemana(painel.planos, painel.sessoes, local, agora);
  if (lista.length === 0) return null;
  return (
    <section className="card space-y-2" aria-label="Fichas da semana" data-testid="fichas-da-semana">
      <h2 className="text-sm font-semibold uppercase text-neutral-400">Fichas da semana</h2>
      <ul className="space-y-1">
        {lista.map(({ plano, feitaEm, emCasa }) => {
          const ok = !!feitaEm || emCasa;
          // "feita em seg", "em casa" ou "faltando".
          const estado = feitaEm ? `feita em ${DIAS[feitaEm.getDay()]!.slice(0, 3).toLowerCase()}` : emCasa ? 'em casa' : 'faltando';
          return (
            <li key={plano.id}>
              <button
                type="button"
                data-testid="ficha-da-semana"
                disabled={iniciando || plano.itens.length === 0}
                aria-label={`${DIAS[plano.diaSemana]}: ${plano.nome}, ${estado}. Tocar para iniciar`}
                onClick={() => onIniciar(plano)}
                className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${ok ? 'text-neutral-400' : 'bg-surface-raised ring-1 ring-primary-400'}`}
              >
                <span className="w-10 shrink-0 text-sm font-semibold uppercase">{DIAS[plano.diaSemana]!.slice(0, 3)}</span>
                <span className={`min-w-0 flex-1 truncate ${ok ? '' : 'font-semibold text-neutral-100'}`}>{plano.nome}</span>
                <span className={`flex shrink-0 items-center gap-1 text-sm ${ok ? 'text-primary-400' : 'text-primary-300'}`}>
                  {estado} {ok ? <Check size={16} aria-hidden /> : <Play size={14} aria-hidden />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
