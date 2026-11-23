import { useEffect, useState } from 'react';
import type { GrupoMuscular } from '../db/types';
import { GrupoIcone } from './GrupoIcone';

/** Foto (blob local) ou ícone do grupo principal. `cobrir`: a foto preenche o quadro, cortando as bordas (foto do perfil). */
export function FotoExercicio({ blob, grupo, className = '', iconeSize = 28, alt = 'Foto do exercício', cobrir = false }: { blob?: Blob; grupo?: GrupoMuscular; className?: string; iconeSize?: number; alt?: string; cobrir?: boolean }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return setUrl(undefined);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return (
    <div className={`flex items-center justify-center overflow-hidden rounded-xl bg-surface-raised ${className}`}>
      {url ? <img src={url} alt={alt} className={`h-full w-full ${cobrir ? 'object-cover' : 'object-contain'}`} /> : grupo && <GrupoIcone grupo={grupo} size={iconeSize} />}
    </div>
  );
}
