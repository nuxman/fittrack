import { useMemo, useState } from 'react';
import { Plus, RotateCcw } from 'lucide-react';
import type { Exercise, GrupoMuscular } from '../db/types';
import { GRUPOS_MUSCULARES } from '../db/types';
import { normalizeNome } from '../db/normalize';
import { exercisesRepository, NomeDuplicadoError } from '../db/repositories/exercises';
import { useAsync } from '../useAsync';

interface Props {
  /** Exercícios já na ficha (ficam fora da lista). */
  excluirIds: string[];
  onEscolher: (e: Exercise) => void;
  onFechar: () => void;
}

/** Busca no catálogo; nome novo vira "Criar 'X'" (ou "Restaurar 'X'" se houver um excluído com esse nome). */
export function ExercisePicker({ excluirIds, onEscolher, onFechar }: Props) {
  const [busca, setBusca] = useState('');
  const [grupo, setGrupo] = useState<GrupoMuscular | ''>('');
  const [erro, setErro] = useState<string>();
  const [todos] = useAsync(() => exercisesRepository.list());
  const [excluido] = useAsync(() => (busca.trim() ? exercisesRepository.findDeletedByName(busca) : Promise.resolve(undefined)), [busca]);

  const alvo = normalizeNome(busca);
  const lista = useMemo(
    () =>
      (todos ?? [])
        .filter((e) => !excluirIds.includes(e.id) && normalizeNome(e.nome).includes(alvo))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [todos, excluirIds, alvo],
  );
  const exato = (todos ?? []).find((e) => normalizeNome(e.nome) === alvo);

  async function criar() {
    if (!grupo) return setErro('Escolha o grupo principal do novo exercício');
    try {
      onEscolher(
        await exercisesRepository.create({
          nome: busca, tipo: 'carga', unidadeCarga: 'kg', grupoPrincipal: grupo, gruposSecundarios: [], porLado: false,
        }),
      );
    } catch (e) {
      setErro(e instanceof NomeDuplicadoError ? e.message : 'Não foi possível criar o exercício');
    }
  }

  return (
    <div className="fixed inset-0 z-20 overflow-y-auto bg-surface-base p-4 pb-28" role="dialog" aria-label="Adicionar exercício">
      <div className="mx-auto max-w-xl space-y-3">
        <div className="flex items-center gap-2">
          <input autoFocus className="input" placeholder="Buscar ou criar exercício" value={busca} onChange={(e) => { setBusca(e.target.value); setErro(undefined); }} />
          <button type="button" className="btn text-neutral-300" onClick={onFechar}>Fechar</button>
        </div>

        {busca.trim() && !exato && excluido && (
          <button type="button" className="btn-secondary w-full" onClick={async () => onEscolher(await exercisesRepository.restore(excluido.id))}>
            <RotateCcw size={22} /> Restaurar "{excluido.nome}"
          </button>
        )}
        {busca.trim() && !exato && !excluido && (
          <div className="card space-y-2">
            <label className="block text-sm text-neutral-400" htmlFor="novo-grupo">Grupo principal</label>
            <select id="novo-grupo" className="input" value={grupo} onChange={(e) => setGrupo(e.target.value as GrupoMuscular)}>
              <option value="">Escolha…</option>
              {GRUPOS_MUSCULARES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <button type="button" className="btn-primary w-full" onClick={criar}>
              <Plus size={22} /> Criar "{busca.trim()}"
            </button>
          </div>
        )}
        {erro && <p role="alert" className="text-red-400">{erro}</p>}

        <ul className="space-y-2">
          {lista.map((e) => (
            <li key={e.id}>
              <button type="button" className="card w-full text-left" onClick={() => onEscolher(e)}>
                <span className="block text-lg">{e.nome}</span>
                <span className="text-sm text-neutral-400">{e.grupoPrincipal}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
