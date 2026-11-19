import { useEffect, useState } from 'react';
import type { GrupoMuscular } from '../db/types';
import { GrupoIcone } from './GrupoIcone';

/** Foto do exercício (blob local) ou ícone do grupo principal. */
export function FotoExercicio({ blob, grupo, className = '', iconeSize = 28, alt = 'Foto do exercício' }: { blob?: Blob; grupo?: GrupoMuscular; className?: string; iconeSize?: number; alt?: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return setUrl(undefined);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return (
    <div className={`flex items-center justify-center overflow-hidden rounded-xl bg-surface-raised ${className}`}>
      {url ? <img src={url} alt={alt} className="h-full w-full object-contain" /> : grupo && <GrupoIcone grupo={grupo} size={iconeSize} />}
    </div>
  );
}
