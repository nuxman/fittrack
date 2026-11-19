import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export const DESFAZER_MS = 8000;

/**
 * "<texto> · Desfazer" por 8 s a partir de `em` (horário da exclusão; recarregar a página não estende o prazo).
 * Ao desfazer, limpa o estado da navegação para a faixa não voltar.
 */
export function Desfazer({ texto, em, onDesfazer }: { texto: string; em: number; onDesfazer: () => Promise<void> }) {
  const navigate = useNavigate();
  const [visivel, setVisivel] = useState(() => Date.now() - em < DESFAZER_MS);
  useEffect(() => {
    if (!visivel) return;
    const t = setTimeout(() => setVisivel(false), em + DESFAZER_MS - Date.now());
    return () => clearTimeout(t);
  }, [visivel, em]);
  if (!visivel) return null;
  const desfazer = async () => {
    setVisivel(false);
    await onDesfazer();
    navigate('.', { replace: true, state: null });
  };
  return (
    <div role="status" className="fixed inset-x-4 bottom-[calc(var(--nav-h)+max(env(safe-area-inset-bottom),8px)+0.75rem)] z-20 mx-auto flex max-w-md items-center justify-between rounded-2xl bg-surface-raised px-4 py-2 shadow-lg">
      <span>{texto}</span>
      <button type="button" className="min-h-11 px-2 font-semibold text-primary-400" onClick={() => void desfazer()}>
        Desfazer
      </button>
    </div>
  );
}
