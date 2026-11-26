import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ouvirNovaVersao } from '../atualizacao';

/** "Nova versão disponível — atualizar": aparece quando há um deploy novo; tocar ativa o service worker novo e recarrega. */
export function AvisoAtualizacao() {
  const [atualizar, setAtualizar] = useState<(() => Promise<void>) | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  // Guarda a função dentro de outra: setState com função a chamaria como atualizador.
  useEffect(() => ouvirNovaVersao((a) => setAtualizar(() => a)), []);
  if (!atualizar) return null;
  return (
    <div className="fixed inset-x-0 top-[var(--topo)] z-40 flex justify-center px-4 pt-2" role="status" data-testid="aviso-atualizacao">
      <button
        type="button"
        disabled={atualizando}
        className="flex min-h-12 items-center gap-2 rounded-full bg-primary-400 px-4 font-semibold text-neutral-950 shadow-lg"
        onClick={() => {
          setAtualizando(true);
          void atualizar();
        }}
      >
        <RefreshCw size={18} aria-hidden /> Nova versão disponível — atualizar
      </button>
    </div>
  );
}
