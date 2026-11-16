import { useId } from 'react';
import { Minus, Plus } from 'lucide-react';
import { parseNumero } from '../sessao';

// eslint-disable-next-line react-refresh/only-export-components
export const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** Soma `delta` ao número digitado (vírgula ou ponto), sem passar de `min`. */
// eslint-disable-next-line react-refresh/only-export-components
export function ajustarTexto(texto: string, delta: number, min: number) {
  const v = parseNumero(texto);
  return num(Math.max(min, (Number.isNaN(v) ? 0 : v) + delta));
}

/** Campo de carga ou reps com botões grandes − e + (execução e edição no Histórico). */
interface CampoProps {
  rotulo: string;
  valor: string;
  inputMode: 'decimal' | 'numeric';
  onChange: (v: string) => void;
  onMenos: () => void;
  onMais: () => void;
}

export function Campo({ rotulo, valor, inputMode, onChange, onMenos, onMais }: CampoProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-neutral-300">
        {rotulo}
      </label>
      <div className="flex gap-2">
        <button type="button" className="btn-secondary w-16 shrink-0 px-0" aria-label={`Diminuir ${rotulo}`} onClick={onMenos}>
          <Minus size={24} />
        </button>
        <input id={id} className="input text-center text-2xl" inputMode={inputMode} value={valor} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn-secondary w-16 shrink-0 px-0" aria-label={`Aumentar ${rotulo}`} onClick={onMais}>
          <Plus size={24} />
        </button>
      </div>
    </div>
  );
}
