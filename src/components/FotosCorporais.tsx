import { useRef } from 'react';
import { Camera, Eye, Trash2 } from 'lucide-react';
import type { BodyPhoto } from '../db/types';
import { FotoAmpliavel } from './FotoAmpliavel';

export const AVISO_FOTOS = 'Fotos corporais ficam só neste aparelho e não entram no backup.';

/** Aviso fixo das telas com fotos corporais. */
export function AvisoFotos() {
  return <p className="text-sm text-neutral-400" data-testid="aviso-fotos">{AVISO_FOTOS}</p>;
}

/** "Mostrar fotos": as fotos começam desfocadas; vale só enquanto a tela estiver aberta (estado local da tela). */
export function MostrarFotos({ visiveis, onMostrar }: { visiveis: boolean; onMostrar: () => void }) {
  if (visiveis) return null;
  return (
    <button type="button" className="btn-secondary w-full" onClick={onMostrar}>
      <Eye size={22} /> Mostrar fotos
    </button>
  );
}

/** Uma foto corporal: desfocada (sem ampliar) até "Mostrar fotos"; depois, toque amplia em tela cheia. */
export function FotoCorporal({ foto, visivel, className, rotulo }: { foto: BodyPhoto; visivel: boolean; className: string; rotulo: string }) {
  return (
    <div className={`overflow-hidden rounded-xl ${visivel ? '' : 'pointer-events-none'}`} data-testid="foto-corporal" data-desfocada={!visivel || undefined}>
      <div className={visivel ? '' : 'blur-xl'} aria-hidden={!visivel || undefined}>
        <FotoAmpliavel blob={foto.blob} className={className} alt="Foto corporal" rotulo={rotulo} />
      </div>
    </div>
  );
}

/** Editor da medição: fotos da medição, adicionar (galeria ou câmera) e remover. */
export function CampoFotos({ fotos, visiveis, ocupado, onMostrar, onAdicionar, onRemover }: {
  fotos: BodyPhoto[];
  visiveis: boolean;
  ocupado: boolean;
  onMostrar: () => void;
  onAdicionar: (f: File) => void;
  onRemover: (f: BodyPhoto) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <section className="card space-y-3" aria-label="Fotos">
      <h2 className="text-lg font-semibold">Fotos</h2>
      <AvisoFotos />
      {fotos.length > 0 && <MostrarFotos visiveis={visiveis} onMostrar={onMostrar} />}
      {fotos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {fotos.map((f, k) => (
            <li key={f.id} className="space-y-1">
              <FotoCorporal foto={f} visivel={visiveis} className="aspect-[3/4] w-full" rotulo={`Ampliar foto ${k + 1}`} />
              <button type="button" className="btn-secondary min-h-11 w-full px-1 text-sm" disabled={ocupado} aria-label={`Remover foto ${k + 1}`} onClick={() => onRemover(f)}>
                <Trash2 size={18} /> Remover
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Arquivo da foto corporal"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onAdicionar(f);
        }}
      />
      <button type="button" className="btn-secondary w-full" disabled={ocupado} onClick={() => input.current?.click()}>
        <Camera size={22} /> {ocupado ? 'Processando…' : 'Adicionar foto'}
      </button>
    </section>
  );
}
