import { emDemo, sairDemo } from '../modo';

/** Faixa fixa no topo, em todas as telas, enquanto o modo demonstração estiver ativo. */
export function FaixaDemo() {
  if (!emDemo()) return null;
  return (
    <div
      className="sticky top-0 z-30 flex h-[var(--demo-h)] items-center justify-center gap-2 bg-primary-400 text-sm font-semibold text-neutral-950"
      role="status"
      data-testid="faixa-demo"
    >
      Modo demonstração ·{' '}
      <button type="button" className="h-full px-2 underline" onClick={() => sairDemo()}>
        Sair
      </button>
    </div>
  );
}
