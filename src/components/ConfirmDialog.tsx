import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export interface OpcaoDialogo<T> {
  label: string;
  value: T;
  variante?: 'primaria' | 'secundaria' | 'perigo';
}

export interface DialogoConfig<T> {
  titulo: string;
  mensagem?: ReactNode;
  /** Botões em ordem; cancelar (fechar, Esc, tocar fora) resolve null. */
  opcoes: OpcaoDialogo<T>[];
  cancelarLabel?: string;
  /** Escolha obrigatória: sem botão de cancelar; Esc e toque fora não fecham. */
  semCancelar?: boolean;
}

type Pedir = <T>(c: DialogoConfig<T>) => Promise<T | null>;

const Ctx = createContext<Pedir | null>(null);

const CLASSES = {
  primaria: 'btn-primary',
  secundaria: 'btn-secondary',
  perigo: 'btn bg-red-600 text-white active:bg-red-700',
};

/** Diálogo modal no tema do app (substitui window.confirm), com uma ou várias opções. */
export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [atual, setAtual] = useState<{ config: DialogoConfig<unknown>; resolve: (v: unknown) => void } | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  const pedir = useCallback<Pedir>(
    (config) =>
      new Promise((resolve) => setAtual({ config, resolve: resolve as (v: unknown) => void })),
    [],
  );

  useEffect(() => {
    const d = ref.current;
    if (!atual || !d || d.open) return;
    // jsdom não implementa showModal; o atributo open basta para exibir.
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
  }, [atual]);

  const fechar = (v: unknown) => {
    atual?.resolve(v);
    setAtual(null);
  };

  return (
    <Ctx.Provider value={pedir}>
      {children}
      {atual && (
        <dialog
          ref={ref}
          aria-labelledby="dlg-titulo"
          onCancel={(e) => {
            e.preventDefault();
            if (!atual.config.semCancelar) fechar(null);
          }}
          onClick={(e) => e.target === e.currentTarget && !atual.config.semCancelar && fechar(null)}
          className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-surface p-0 text-neutral-100 backdrop:bg-black/70"
        >
          <div className="space-y-4 p-5">
            <h2 id="dlg-titulo" className="text-xl font-bold text-primary-400">
              {atual.config.titulo}
            </h2>
            {atual.config.mensagem && <div className="text-neutral-300">{atual.config.mensagem}</div>}
            <div className="flex flex-col gap-2">
              {atual.config.opcoes.map((o) => (
                <button key={o.label} type="button" className={CLASSES[o.variante ?? 'primaria']} onClick={() => fechar(o.value)}>
                  {o.label}
                </button>
              ))}
              {!atual.config.semCancelar && (
                <button type="button" className="btn text-neutral-400" onClick={() => fechar(null)}>
                  {atual.config.cancelarLabel ?? 'Cancelar'}
                </button>
              )}
            </div>
          </div>
        </dialog>
      )}
    </Ctx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDialog() {
  const pedir = useContext(Ctx);
  if (!pedir) throw new Error('useDialog fora de ConfirmDialogProvider');
  return {
    escolher: pedir,
    /** Atalho para sim/não. */
    confirmar: async (titulo: string, mensagem?: ReactNode, confirmarLabel = 'Confirmar', perigo = false) =>
      (await pedir({ titulo, mensagem, opcoes: [{ label: confirmarLabel, value: true, variante: perigo ? 'perigo' : 'primaria' }] })) === true,
    /** Aviso com um único botão "OK". */
    avisar: async (titulo: string, mensagem?: ReactNode) => {
      await pedir({ titulo, mensagem, opcoes: [{ label: 'OK', value: true }], cancelarLabel: 'Fechar' });
    },
  };
}
