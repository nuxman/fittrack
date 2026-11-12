import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { LOCAIS_TREINO, type LocalTreino } from '../db/types';
import { NOME_LOCAL } from '../db/repositories/workoutPlans';

/** "Academia | Casa" em botões grandes. */
export function SeletorLocal({ valor, onMudar, rotulo = 'Local do treino' }: { valor: LocalTreino; onMudar: (l: LocalTreino) => void; rotulo?: string }) {
  return (
    <div role="group" aria-label={rotulo} className="grid grid-cols-2 gap-2 rounded-2xl bg-surface p-1">
      {LOCAIS_TREINO.map((l) => (
        <button key={l} type="button" aria-pressed={l === valor} className={l === valor ? 'btn-primary' : 'btn text-neutral-300'} onClick={() => onMudar(l)}>
          {NOME_LOCAL[l]}
        </button>
      ))}
    </div>
  );
}

/** Local sem nenhuma ficha (Início e aba Treinar). */
export function CriarFicha({ local }: { local: LocalTreino }) {
  return (
    <Link to={`/fichas/nova?local=${local}`} className="btn-primary w-full">
      <Plus size={22} /> Criar ficha de {NOME_LOCAL[local].toLowerCase()}
    </Link>
  );
}
