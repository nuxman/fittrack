import { lazy, Suspense, useState } from 'react';

// O gráfico (e o Recharts) só carrega ao abrir a seção.
const MiniGrafico = lazy(() => import('../pages/evolucao/MiniGrafico'));

/** Seção recolhível "Evolução de carga" (execução e detalhe do exercício). Recolhida por padrão; os dados e o gráfico só carregam ao abrir. */
export function EvolucaoCarga({ exerciseId }: { exerciseId: string }) {
  const [aberta, setAberta] = useState(false);
  return (
    <details className="card" onToggle={(e) => setAberta(e.currentTarget.open)}>
      <summary className="cursor-pointer text-lg font-semibold">Evolução de carga</summary>
      {aberta && (
        <div className="mt-3">
          <Suspense fallback={<p className="text-neutral-400">Carregando…</p>}>
            <MiniGrafico exerciseId={exerciseId} />
          </Suspense>
        </div>
      )}
    </details>
  );
}
