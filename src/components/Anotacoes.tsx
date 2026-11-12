import { useState } from 'react';
import { exercisesRepository } from '../db/repositories/exercises';

/** "Minhas anotações" (Exercise.anotacoes), recolhível e editável na hora, sem abrir o editor. */
export function Anotacoes({ exerciseId, inicial, onSalvo, aberto }: { exerciseId: string; inicial: string; onSalvo: () => void; aberto?: boolean }) {
  const [texto, setTexto] = useState(inicial);
  const [estado, setEstado] = useState<'' | 'salvando' | 'salvo' | 'erro'>('');
  const salvar = async () => {
    setEstado('salvando');
    try {
      await exercisesRepository.update(exerciseId, { anotacoes: texto.trim() || undefined });
      setEstado('salvo');
      onSalvo();
    } catch {
      setEstado('erro');
    }
  };
  return (
    <details className="card" open={aberto}>
      <summary className="cursor-pointer text-lg font-semibold">Minhas anotações</summary>
      <textarea
        className="input mt-3 min-h-28 py-3"
        aria-label="Minhas anotações"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setEstado('');
        }}
      />
      <button type="button" className="btn-secondary mt-2 w-full" disabled={estado === 'salvando' || texto === inicial} onClick={salvar}>
        Salvar anotações
      </button>
      {estado === 'salvo' && <p className="mt-1 text-sm text-primary-400">Anotações salvas.</p>}
      {estado === 'erro' && <p role="alert" className="mt-1 text-sm text-red-400">Não foi possível salvar.</p>}
    </details>
  );
}
