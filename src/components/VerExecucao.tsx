import type { MouseEvent } from 'react';
import { ExternalLink, Youtube } from 'lucide-react';
import { linkDeBusca } from '../db/seed';
import { useDialog } from './ConfirmDialog';

/** Link salvo; sem link, a busca no YouTube pelo nome (mesmo formato do seed). */
const linkVideo = (nome: string, url?: string) => url || linkDeBusca(nome);

const ATRIBUTOS = { target: '_blank', rel: 'noopener noreferrer' } as const;

/** "Ver execução": abre fora do app, sem player embutido. Offline avisa que precisa de internet. */
export function VerExecucao({ nome, url }: { nome: string; url?: string }) {
  return (
    <div>
      <a href={linkVideo(nome, url)} {...ATRIBUTOS} className="btn-secondary w-full">
        <ExternalLink size={20} /> Ver execução
      </a>
      {!navigator.onLine && <p className="mt-1 text-sm text-neutral-400">Sem conexão: o vídeo precisa de internet.</p>}
    </div>
  );
}

/** Botão pequeno de vídeo (topo da execução, lista da visão geral). Offline: avisa em vez de abrir. */
export function VideoIcone({ nome, url }: { nome: string; url?: string }) {
  const { avisar } = useDialog();
  const offline = (e: MouseEvent) => {
    if (navigator.onLine) return;
    e.preventDefault();
    void avisar('Sem conexão', 'O vídeo precisa de internet.');
  };
  return (
    <a
      href={linkVideo(nome, url)}
      {...ATRIBUTOS}
      onClick={offline}
      aria-label={`Ver execução de ${nome}`}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-primary-400"
    >
      <Youtube size={22} />
    </a>
  );
}
