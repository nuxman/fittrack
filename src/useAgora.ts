import { useEffect, useState } from 'react';

/** Date.now() atualizado a cada `ms` (para cronômetros). */
export function useAgora(ms = 1000): number {
  const [t, setT] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return t;
}
