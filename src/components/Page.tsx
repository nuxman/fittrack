import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

/** Volta uma tela; se a tela foi aberta direto (sem histórico no app), vai para o destino padrão. */
// eslint-disable-next-line react-refresh/only-export-components
export function useVoltar(padrao = '/') {
  const navigate = useNavigate();
  const { key } = useLocation();
  return () => (key === 'default' ? navigate(padrao, { replace: true }) : navigate(-1));
}

export function Page({ title, children, voltar }: { title: string; children: ReactNode; voltar?: boolean }) {
  const irVoltar = useVoltar();
  return (
    <main className="mx-auto max-w-xl px-4 pb-nav pt-6">
      <div className="mb-4 flex items-center gap-2">
        {voltar && (
          <button type="button" aria-label="Voltar" className="-ml-2 p-2 text-neutral-300" onClick={irVoltar}>
            <ChevronLeft size={30} />
          </button>
        )}
        <h1 className="text-3xl font-bold text-primary-400">{title}</h1>
      </div>
      <div className="space-y-4">{children}</div>
    </main>
  );
}
