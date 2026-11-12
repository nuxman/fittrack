import { ExternalLink } from 'lucide-react';

/** "Ver execução": só com link; abre fora do app, sem player embutido. Offline avisa que precisa de internet. */
export function VerExecucao({ url }: { url?: string }) {
  if (!url) return null;
  return (
    <div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary w-full">
        <ExternalLink size={20} /> Ver execução
      </a>
      {!navigator.onLine && <p className="mt-1 text-sm text-neutral-400">Sem conexão: o vídeo precisa de internet.</p>}
    </div>
  );
}
