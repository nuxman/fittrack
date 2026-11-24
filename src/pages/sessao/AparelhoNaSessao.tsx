import { useState } from 'react';
import { Etiqueta, DialogoAparelho } from '../../components/Aparelho';
import { textoEtiqueta } from '../../db/repositories/equipment';
import { exercisesRepository } from '../../db/repositories/exercises';
import type { SnapshotItem } from '../../db/types';
import { useSessao } from './SessaoLayout';

/** Etiqueta do aparelho (ou "Definir aparelho"); tocar abre o diálogo e liga o aparelho ao exercício, sem sair da sessão. */
export function AparelhoNaSessao({ item }: { item: SnapshotItem }) {
  const { exercicios, aparelhos, recarregar } = useSessao();
  const [aberto, setAberto] = useState(false);
  const exercicio = exercicios.get(item.exerciseId);
  if (!exercicio) return null; // exercício excluído: nada a ligar
  const aparelho = aparelhos.get(item.exerciseId);

  const escolher = async (id: string | undefined) => {
    setAberto(false);
    await exercisesRepository.update(exercicio.id, { equipmentId: id });
    await recarregar();
  };

  return (
    <>
      <button
        type="button"
        className="inline-flex min-h-9 items-center text-sm"
        aria-label={aparelho ? `Aparelho de ${item.nome}: ${textoEtiqueta(aparelho)}. Alterar` : `Definir aparelho de ${item.nome}`}
        onClick={() => setAberto(true)}
      >
        {aparelho ? <Etiqueta aparelho={aparelho} className="rounded-full bg-surface-raised px-2 py-0.5" /> : <span className="text-primary-400 underline">Definir aparelho</span>}
      </button>
      {aberto && (
        <DialogoAparelho grupo={item.grupoPrincipal} atualId={aparelho?.id} onEscolher={(a) => void escolher(a?.id)} onFechar={() => setAberto(false)} />
      )}
    </>
  );
}
