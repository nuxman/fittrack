import { useState } from 'react';
import { X } from 'lucide-react';
import type { GrupoMuscular } from '../db/types';
import { FotoExercicio } from './FotoExercicio';

/** Foto do exercício; toque amplia em tela cheia. Sem foto, não renderiza nada. */
export function FotoAmpliavel({ blob, grupo, className }: { blob?: Blob; grupo: GrupoMuscular; className: string }) {
  const [ampliada, setAmpliada] = useState(false);
  if (!blob) return null;
  return (
    <>
      <button type="button" className="shrink-0" aria-label="Ampliar foto" onClick={() => setAmpliada(true)}>
        <FotoExercicio blob={blob} grupo={grupo} className={className} />
      </button>
      {ampliada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black" role="dialog" aria-label="Foto ampliada" onClick={() => setAmpliada(false)}>
          <FotoExercicio blob={blob} grupo={grupo} className="h-full w-full bg-black" />
          <button type="button" aria-label="Fechar foto" className="absolute right-4 top-4 rounded-full bg-neutral-800 p-3">
            <X size={28} />
          </button>
        </div>
      )}
    </>
  );
}
