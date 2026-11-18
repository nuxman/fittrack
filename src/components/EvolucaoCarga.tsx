import { useEffect, useState, type ComponentType } from 'react';

type Mini = ComponentType<{ exerciseId: string }>;

/** Seção recolhível "Evolução de carga" (execução e detalhe do exercício). Recolhida por padrão; os dados e o gráfico só carregam ao abrir.
 * Sem React.lazy: ele guarda a falha do import() para sempre e a joga para a tela de erro da rota (tirando o usuário da execução).
 * Aqui a falha fica na seção, com "Tentar de novo". */
export function EvolucaoCarga({ exerciseId }: { exerciseId: string }) {
  const [aberta, setAberta] = useState(false);
  const [mini, setMini] = useState<Mini | 'erro'>();
  const [tentativa, setTentativa] = useState(0);
  const pronto = mini !== undefined && mini !== 'erro';

  useEffect(() => {
    if (!aberta || pronto) return;
    let vivo = true;
    import('../pages/evolucao/MiniGrafico').then(
      (m) => vivo && setMini(() => m.default),
      () => vivo && setMini('erro'),
    );
    return () => {
      vivo = false;
    };
  }, [aberta, pronto, tentativa]);

  const MiniGrafico = pronto ? mini : null;
  return (
    <details className="card" onToggle={(e) => setAberta(e.currentTarget.open)}>
      <summary className="cursor-pointer text-lg font-semibold">Evolução de carga</summary>
      {aberta && (
        <div className="mt-3">
          {MiniGrafico ? (
            <MiniGrafico exerciseId={exerciseId} />
          ) : mini === 'erro' ? (
            <div className="space-y-2" role="alert">
              <p className="text-neutral-300">Não foi possível carregar o gráfico. Verifique a internet.</p>
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => {
                  setMini(undefined);
                  setTentativa((t) => t + 1);
                }}
              >
                Tentar de novo
              </button>
            </div>
          ) : (
            <p className="text-neutral-400">Carregando…</p>
          )}
        </div>
      )}
    </details>
  );
}
