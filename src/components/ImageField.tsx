import { useEffect, useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import type { ExerciseImage, GrupoMuscular } from '../db/types';
import { GrupoIcone } from './GrupoIcone';

interface Props {
  imagem: Pick<ExerciseImage, 'blob' | 'largura' | 'altura'> | undefined;
  grupo: GrupoMuscular;
  ocupado?: boolean;
  onEscolher: (file: File) => void;
  onRemover: () => void;
}

/** Prévia + "Adicionar/Trocar foto" (galeria ou câmera) + "Remover". */
export function ImageField({ imagem, grupo, ocupado, onEscolher, onRemover }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!imagem) return setUrl(undefined);
    const u = URL.createObjectURL(imagem.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [imagem]);

  return (
    <div className="space-y-2">
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-2xl bg-surface-raised">
        {url ? <img src={url} alt="Foto do exercício" className="h-full w-full object-contain" /> : <GrupoIcone grupo={grupo} size={64} />}
      </div>
      {imagem && (
        <p className="text-sm text-neutral-400">
          {imagem.largura}×{imagem.altura} px · {Math.round(imagem.blob.size / 1024)} KB
        </p>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Arquivo da foto"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onEscolher(f);
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary" disabled={ocupado} onClick={() => input.current?.click()}>
          <Camera size={22} /> {imagem ? 'Trocar foto' : 'Adicionar foto'}
        </button>
        {imagem && (
          <button type="button" className="btn-secondary" disabled={ocupado} onClick={onRemover}>
            <Trash2 size={22} /> Remover foto
          </button>
        )}
      </div>
    </div>
  );
}
