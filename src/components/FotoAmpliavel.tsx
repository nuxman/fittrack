import { useRef, useState, type PointerEvent } from 'react';
import { X } from 'lucide-react';
import type { GrupoMuscular } from '../db/types';
import { FotoExercicio } from './FotoExercicio';

/** Foto do exercício; toque amplia em tela cheia. Sem foto, não renderiza nada. */
export function FotoAmpliavel({ blob, grupo, className }: { blob?: Blob; grupo: GrupoMuscular; className: string }) {
  const [ampliada, setAmpliada] = useState(false);
  if (!blob) return null;
  return (
    <>
      <button type="button" className="shrink-0" aria-label="Ampliar foto" onClick={() => setAmpliada(true)}>
        <FotoExercicio blob={blob} grupo={grupo} className={className} />
      </button>
      {ampliada && <TelaCheia blob={blob} grupo={grupo} onFechar={() => setAmpliada(false)} />}
    </>
  );
}

const MAX_ZOOM = 5;
type Ponto = { x: number; y: number };
const dist = (a: Ponto, b: Ponto) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Tela cheia com zoom de dois dedos (1× a 5×) e arrastar quando ampliada; toque duplo volta a 1×.
 * Fecha pelo botão X ou por um toque simples sem zoom.
 */
function TelaCheia({ blob, grupo, onFechar }: { blob: Blob; grupo: GrupoMuscular; onFechar: () => void }) {
  const [zoom, setZoom] = useState({ escala: 1, x: 0, y: 0 });
  const dedos = useRef(new Map<number, Ponto>());
  // Início do gesto atual: distância entre os dedos (pinça) ou ponto do dedo (arrastar).
  const gesto = useRef<{ dist?: number; escala: number; x: number; y: number; ponto?: Ponto; moveu: boolean } | null>(null);
  const ultimoToque = useRef(0);

  const iniciarGesto = () => {
    const [a, b] = [...dedos.current.values()];
    gesto.current = { ...zoom, moveu: gesto.current?.moveu ?? false, ...(b ? { dist: dist(a!, b) } : { ponto: a }) };
  };

  const down = (e: PointerEvent) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (dedos.current.size === 1) gesto.current = null;
    iniciarGesto();
  };

  const move = (e: PointerEvent) => {
    if (!dedos.current.has(e.pointerId) || !gesto.current) return;
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesto.current;
    const [a, b] = [...dedos.current.values()];
    if (b && g.dist) {
      const escala = Math.min(MAX_ZOOM, Math.max(1, (g.escala * dist(a!, b)) / g.dist));
      g.moveu = true;
      setZoom((z) => (escala === 1 ? { escala: 1, x: 0, y: 0 } : { ...z, escala }));
    } else if (g.ponto && g.escala > 1) {
      const dx = e.clientX - g.ponto.x;
      const dy = e.clientY - g.ponto.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) g.moveu = true;
      setZoom({ escala: g.escala, x: g.x + dx, y: g.y + dy });
    } else if (g.ponto && Math.abs(e.clientX - g.ponto.x) + Math.abs(e.clientY - g.ponto.y) > 4) {
      g.moveu = true;
    }
  };

  const up = (e: PointerEvent) => {
    dedos.current.delete(e.pointerId);
    const g = gesto.current;
    if (dedos.current.size > 0) return iniciarGesto(); // tirou um dos dois dedos: continua arrastando com o outro
    gesto.current = null;
    if (!g || g.moveu) return;
    const agora = Date.now();
    if (agora - ultimoToque.current < 300) {
      ultimoToque.current = 0;
      setZoom({ escala: 1, x: 0, y: 0 });
    } else {
      ultimoToque.current = agora;
      if (zoom.escala === 1) onFechar();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black" role="dialog" aria-label="Foto ampliada">
      <div
        className="h-full w-full touch-none"
        data-testid="foto-zoom"
        style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.escala})` }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <FotoExercicio blob={blob} grupo={grupo} className="h-full w-full bg-black" />
      </div>
      <button type="button" aria-label="Fechar foto" className="absolute right-4 top-4 rounded-full bg-neutral-800 p-3" onClick={onFechar}>
        <X size={28} />
      </button>
      {zoom.escala === 1 && <p className="absolute inset-x-0 bottom-6 text-center text-sm text-neutral-400">Use dois dedos para ampliar</p>}
    </div>
  );
}
