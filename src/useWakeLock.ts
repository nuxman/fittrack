import { useEffect, useState } from 'react';

export type EstadoWakeLock = 'ativa' | 'inativa' | 'indisponivel';

/**
 * Mantém a tela ligada enquanto `ativo`. O navegador solta a trava quando o app fica oculto,
 * então ela é pedida de novo ao voltar (visibilitychange). Solta ao desativar ou desmontar.
 */
export function useWakeLock(ativo: boolean): EstadoWakeLock {
  const suportado = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [estado, setEstado] = useState<EstadoWakeLock>(suportado ? 'inativa' : 'indisponivel');

  useEffect(() => {
    if (!ativo || !suportado) return;
    let vivo = true;
    let trava: WakeLockSentinel | null = null;

    const pedir = async () => {
      if (document.visibilityState !== 'visible' || (trava && !trava.released)) return;
      try {
        const t = await navigator.wakeLock.request('screen');
        if (!vivo) return void t.release();
        trava = t;
        setEstado('ativa');
      } catch {
        if (vivo) setEstado('indisponivel');
      }
    };
    const aoMudarVisibilidade = () => void pedir();

    void pedir();
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    return () => {
      vivo = false;
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      void trava?.release();
      setEstado('inativa');
    };
  }, [ativo, suportado]);

  return estado;
}
