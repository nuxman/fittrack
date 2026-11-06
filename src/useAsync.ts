import { useCallback, useEffect, useState } from 'react';

/** Carrega um valor assíncrono (ex.: de um repository); reload() busca de novo. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): [T | undefined, () => void] {
  const [value, setValue] = useState<T>();
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    let alive = true;
    fn().then((v) => alive && setValue(v));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, versao]);
  return [value, useCallback(() => setVersao((v) => v + 1), [])];
}
