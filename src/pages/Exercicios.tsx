import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Page } from '../components/Page';
import { useAsync } from '../useAsync';
import { exercisesRepository } from '../db/repositories/exercises';
import { normalizeNome } from '../db/normalize';

export function Exercicios() {
  const [busca, setBusca] = useState('');
  const [lista] = useAsync(() => exercisesRepository.list());
  const alvo = normalizeNome(busca);
  const filtrados = (lista ?? [])
    .filter((e) => normalizeNome(e.nome).includes(alvo))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  return (
    <Page title="Exercícios" voltar>
      <input className="input" placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <Link to="/exercicios/novo" className="btn-primary w-full">
        <Plus size={22} /> Novo exercício
      </Link>
      <ul className="space-y-2">
        {filtrados.map((e) => (
          <li key={e.id}>
            <Link to={`/exercicios/${e.id}`} className="card block">
              <span className="block text-lg">{e.nome}</span>
              <span className="text-sm text-neutral-400">{e.grupoPrincipal}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
